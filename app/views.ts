import type { ChipState, MealType } from '../domain/index.ts'
import {
  MEALS,
  PET_BAND_TEXT,
  addIsoDays,
  cameraAction,
  canAdopt,
  chipLabel,
  chipState,
  homeBadge,
  homePetView,
  inAnyWindow,
  emotionFromHunger,
  feedingHungerPercent,
  healthScore,
  petLevel,
  logicalDate,
  mealWindow,
  nextMealAt,
  personalStreak,
  petBand,
  streakAnchor,
} from '../domain/index.ts'
import { clocksOn } from './schedule.ts'
import type { Store } from './ports.ts'
import type { MealRecordDoc, SnackDoc, UserDoc } from './types.ts'
import { requireUser } from './user.ts'

const MEAL_NAME: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
}

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

export type HomeCamera =
  | { type: 'checkin'; meal: MealType; name: string }
  | { type: 'pick'; meals: { meal: MealType; name: string }[] }
  | { type: 'snack' }
  | { type: 'toast'; reason: 'meal_done' }

export type HomeView = {
  date: string
  dateLabel: string
  chips: { meal: MealType; name: string; time: string; label: string; state: ChipState }[]
  badge: boolean
  petView: 'pasture' | 'living' | 'memorial'
  petName: string
  band: ReturnType<typeof petBand>
  bandText: string
  companyDays: number
  mealsEaten: number
  cooldownDays: number
  hungerText: string
  healthText: string
  levelText: string
  emotion: string
  camera: HomeCamera
}

type Caller = { userId: string }

/** 隐藏的、整餐被驳回的，页面上都按没打卡。 */
function countsAsEaten(record: MealRecordDoc | undefined): MealRecordDoc | null {
  if (!record || record.hidden || record.review === 'rejected') return null
  return record
}

function weekdayOf(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return WEEKDAY[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
}

function dateLabel(iso: string): string {
  const [, month, day] = iso.split('-').map(Number)
  return `${month}月${day}日 周${weekdayOf(iso)}`
}

function dayDistance(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
}

function cooldownDaysLeft(user: UserDoc, today: string, now: Date): number {
  if (!user.cooldownUntil) return 0
  const until = new Date(user.cooldownUntil)
  if (canAdopt(until, now)) return 0
  return Math.max(dayDistance(today, logicalDate(until, user.timeZone)), 0)
}

function cameraOf(states: readonly ChipState[], now: Date, clocks: UserDoc['meals'], timeZone: string): HomeCamera {
  const due = MEALS.filter((_, index) => states[index] === 'due')
  const action = cameraAction(due, inAnyWindow(now, clocks, timeZone))
  if (action.type === 'checkin') return { type: 'checkin', meal: action.meal, name: MEAL_NAME[action.meal] }
  if (action.type === 'pick') {
    return { type: 'pick', meals: action.meals.map((meal) => ({ meal, name: MEAL_NAME[meal] })) }
  }
  return action
}

const LEVEL_LOOKBACK_DAYS = 120

/** 最近两天里最后一次算数的打卡，以及回看期内最早的一次。没有记录时饥饿按 100%。 */
async function checkinSpan(
  store: Store,
  userId: string,
  today: string,
  todayRecords: readonly MealRecordDoc[],
): Promise<{ latest: MealRecordDoc | null; earliestAt: string | null }> {
  const yesterday = await store.listRecords(userId, addIsoDays(today, -1))
  const recent = [...yesterday, ...todayRecords].filter((row) => countsAsEaten(row) !== null)
  recent.sort((a, b) => a.checkinAt.localeCompare(b.checkinAt))
  let earliestAt = recent[0]?.checkinAt ?? null
  let cursor = addIsoDays(today, -2)
  const stop = addIsoDays(today, -LEVEL_LOOKBACK_DAYS)
  while (cursor >= stop) {
    const rows = await store.listRecords(userId, cursor)
    for (const row of rows) {
      if (countsAsEaten(row) === null) continue
      if (earliestAt === null || row.checkinAt < earliestAt) earliestAt = row.checkinAt
    }
    cursor = addIsoDays(cursor, -1)
  }
  return { latest: recent[recent.length - 1] ?? null, earliestAt }
}

/**
 * 首页要画的东西。不写库，也不在这里结算。
 * 红点只表示窗口内还有没打的餐。审核没完不留红点，也不改宠物状态词。
 */
export async function homeView(store: Store, caller: Caller, now: Date): Promise<HomeView> {
  const user = await requireUser(store, caller.userId)
  const pet = await store.getPet(caller.userId)
  const today = logicalDate(now, user.timeZone)
  const clocks = clocksOn(user, today)
  const records = await store.listRecords(caller.userId, today)
  const states = chipStates(user, today, now, records)
  const span = await checkinSpan(store, caller.userId, today, records)
  let hungerPercent = 100
  if (span.latest) {
    const next = nextMealAt(
      span.latest.date,
      span.latest.meal,
      clocksOn(user, span.latest.date),
      user.timeZone,
    )
    hungerPercent = feedingHungerPercent(
      now,
      new Date(span.latest.checkinAt),
      next,
      span.latest.status === 'exempt',
    )
  }
  const hours = span.earliestAt === null
    ? 0
    : (now.getTime() - new Date(span.earliestAt).getTime()) / 3_600_000
  const alive = pet?.alive === true
  const dead = pet !== null && !pet.alive
  const cooldownOver = canAdopt(user.cooldownUntil ? new Date(user.cooldownUntil) : null, now)
  const band = pet ? petBand(pet.hunger) : 'full'
  return {
    date: today,
    dateLabel: dateLabel(today),
    chips: MEALS.map((meal, index) => ({
      meal,
      name: MEAL_NAME[meal],
      time: clocks[meal],
      state: states[index],
      label: chipLabel(meal, states[index]),
    })),
    badge: homeBadge(states),
    petView: homePetView(alive ? 'alive' : dead ? 'dead' : 'none', cooldownOver),
    petName: pet?.name || '小饭',
    band,
    bandText: PET_BAND_TEXT[band],
    companyDays: pet?.companyDays ?? 0,
    mealsEaten: pet?.mealsEaten ?? 0,
    cooldownDays: cooldownDaysLeft(user, today, now),
    hungerText: `${hungerPercent}%`,
    healthText: pet ? String(healthScore(pet.hunger)) : '—',
    levelText: pet
      ? String(petLevel(hours, (pet.hungerLog ?? []).filter((day) => day.date < today)))
      : '—',
    emotion: emotionFromHunger(hungerPercent),
    camera: cameraOf(states, now, clocks, user.timeZone),
  }
}

export type GalleryMeal = {
  meal: MealType
  name: string
  photo: string | null
  exempt: boolean
}

export type GallerySnack = {
  startedAt: string
  photo: string
  count: number
}

export type GalleryDay = {
  key: string
  week: string
  day: number
}

export type GalleryView = {
  streak: number
  todayIndex: number
  days: GalleryDay[]
  meals: GalleryMeal[]
  snacks: GallerySnack[]
}

export type AdoptView = {
  canAdopt: boolean
  cooldownDays: number
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function chipStates(user: UserDoc, today: string, now: Date, records: readonly MealRecordDoc[]): ChipState[] {
  const clocks = clocksOn(user, today)
  return MEALS.map((meal) => {
    const record = countsAsEaten(records.find((row) => row.meal === meal))
    return chipState(now, mealWindow(today, clocks[meal], user.timeZone), record?.status ?? null)
  })
}

function dayFinished(records: readonly MealRecordDoc[]): boolean {
  return MEALS.every((meal) => {
    const record = countsAsEaten(records.find((row) => row.meal === meal))
    return record?.status === 'checked_in' || record?.status === 'exempt'
  })
}

function firstShown(photos: readonly string[], reviews: readonly string[]): string | null {
  for (let i = 0; i < photos.length; i += 1) {
    if (reviews[i] !== 'rejected') return photos[i]
  }
  return null
}

function mealTile(meal: MealType, record: MealRecordDoc | undefined): GalleryMeal {
  const eaten = countsAsEaten(record)
  if (!eaten) return { meal, name: MEAL_NAME[meal], photo: null, exempt: false }
  if (eaten.status === 'exempt') return { meal, name: MEAL_NAME[meal], photo: null, exempt: true }
  return {
    meal,
    name: MEAL_NAME[meal],
    photo: firstShown(eaten.photos, eaten.photoReviews),
    exempt: false,
  }
}

function snackTiles(snacks: readonly SnackDoc[]): GallerySnack[] {
  const rows: GallerySnack[] = []
  for (const snack of snacks) {
    if (snack.hidden) continue
    const photos = snack.photos.filter((_, index) => snack.photoReviews[index] !== 'rejected')
    if (photos.length === 0) continue
    rows.push({ startedAt: snack.startedAt, photo: photos[0], count: photos.length })
  }
  return rows
}

/** 图鉴顶部那一周一到日，今天落在哪一格。 */
function weekOf(today: string): { days: GalleryDay[]; todayIndex: number } {
  const [year, month, day] = today.split('-').map(Number)
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  const monday = addIsoDays(today, weekday === 0 ? -6 : 1 - weekday)
  const days = WEEK_LABELS.map((week, index) => {
    const key = addIsoDays(monday, index)
    return { key, week, day: Number(key.slice(8)) }
  })
  return { days, todayIndex: days.findIndex((item) => item.key === today) }
}

async function streakOf(store: Store, user: UserDoc, now: Date): Promise<number> {
  const today = logicalDate(now, user.timeZone)
  const records = await store.listRecords(user.userId, today)
  const anchor = streakAnchor(today, chipStates(user, today, now, records))
  if (anchor === null) return 0
  const completeDates: string[] = []
  let cursor = anchor
  for (;;) {
    const dayRecords = cursor === today ? records : await store.listRecords(user.userId, cursor)
    if (!dayFinished(dayRecords)) break
    completeDates.push(cursor)
    cursor = addIsoDays(cursor, -1)
  }
  return personalStreak({
    completeDates,
    endDate: anchor,
    adoptedOn: user.adoptedOn,
    diedOn: user.diedOn,
    pastPets: user.pastPets,
  })
}

/**
 * 图鉴。连续天数跟「现在」走，三格和零食跟要看的那一天走。
 * 不传日期就是今天。零食单独一行，不进连续天数。
 */
export async function galleryView(
  store: Store,
  caller: Caller,
  now: Date,
  date?: string,
): Promise<GalleryView> {
  const user = await requireUser(store, caller.userId)
  const today = logicalDate(now, user.timeZone)
  const shown = date ?? today
  const week = weekOf(today)
  const [streak, records, snacks] = await Promise.all([
    streakOf(store, user, now),
    store.listRecords(caller.userId, shown),
    store.listSnacks(caller.userId, shown),
  ])
  return {
    streak,
    todayIndex: week.todayIndex,
    days: week.days,
    meals: MEALS.map((meal) => mealTile(meal, records.find((row) => row.meal === meal))),
    snacks: snackTiles(snacks),
  }
}

/** 没有活着的宠物，并且冷却已经结束，才能领养。 */
export async function adoptView(store: Store, caller: Caller, now: Date): Promise<AdoptView> {
  const user = await requireUser(store, caller.userId)
  const pet = await store.getPet(caller.userId)
  const today = logicalDate(now, user.timeZone)
  const cooldownOver = canAdopt(user.cooldownUntil ? new Date(user.cooldownUntil) : null, now)
  return {
    canAdopt: pet?.alive !== true && cooldownOver,
    cooldownDays: cooldownDaysLeft(user, today, now),
  }
}
