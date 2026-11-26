import type { ChipState, MealType } from '../domain/index.ts'
import {
  MEALS,
  PET_BAND_TEXT,
  addIsoDays,
  cameraAction,
  canAdopt,
  chipLabel,
  chipState,
  effectiveStapleLeft,
  homeBadge,
  homePetView,
  emotionFromHunger,
  healthScore,
  petLevel,
  logicalDate,
  stapleMonth,
  mealWindow,
  personalStreak,
  petBand,
  streakAnchor,
} from '../domain/index.ts'
import { previousMonth } from './retention.ts'
import { loadSatiety } from './satiety.ts'
import { clocksOn } from './schedule.ts'
import type { Store } from './ports.ts'
import type { Annotation, MealRecordDoc, PetSpecies, SnackDoc, UserDoc } from './types.ts'
import { requireUser } from './user.ts'

const MEAL_NAME: Record<MealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
}

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六']

export type HomeCamera =
  | { type: 'pick'; meals: { meal: MealType; name: string }[]; snack: true }
  | { type: 'snack' }

export type HomeView = {
  date: string
  dateLabel: string
  chips: { meal: MealType; name: string; time: string; label: string; state: ChipState; inWindow: boolean }[]
  badge: boolean
  petView: 'pasture' | 'living' | 'memorial'
  petName: string
  band: ReturnType<typeof petBand>
  bandText: string
  companyDays: number
  mealsEaten: number
  cooldownDays: number
  satietyText: string
  healthText: string
  levelText: string
  emotion: string
  camera: HomeCamera
  species: PetSpecies
  photos: { meal: MealType; src: string }[]
  /** 0 是空盘，100 是稿子里那盘丸子。只跟着最近一次打卡，到下一顿饭点变成 0。 */
  bowlFill: number
  /** 点开左上角状态板时列出的当天变化。 */
  statChanges: string[]
  /** 本月还剩几次口粮。换月后回到 2，不沿用上个月剩下的。 */
  stapleLeft: number
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

function cameraOf(states: readonly ChipState[]): HomeCamera {
  const due = MEALS.filter((_, index) => states[index] === 'due')
  const action = cameraAction(due)
  if (action.type === 'pick') {
    return { type: 'pick', meals: action.meals.map((meal) => ({ meal, name: MEAL_NAME[meal] })), snack: true }
  }
  return { type: 'snack' }
}

const LEVEL_LOOKBACK_DAYS = 120

/** 回看期内最后一次算数的进食、最早的一次，以及最近两天里最近一次真正的打卡。还没吃过时饥饿是 0%。 */
async function checkinSpan(
  store: Store,
  userId: string,
  today: string,
  todayRecords: readonly MealRecordDoc[],
): Promise<{ latest: MealRecordDoc | null; earliestAt: string | null; bowlFrom: MealRecordDoc | null }> {
  const yesterday = await store.listRecords(userId, addIsoDays(today, -1))
  const recent = [...yesterday, ...todayRecords].filter((row) => countsAsEaten(row) !== null)
  recent.sort((a, b) => a.checkinAt.localeCompare(b.checkinAt))
  const bowlFrom = recent.filter((row) => row.status === 'checked_in').at(-1) ?? null
  let latest = recent[recent.length - 1] ?? null
  let earliestAt = recent[0]?.checkinAt ?? null
  let cursor = addIsoDays(today, -2)
  const stop = addIsoDays(today, -LEVEL_LOOKBACK_DAYS)
  while (cursor >= stop) {
    const rows = await store.listRecords(userId, cursor)
    for (const row of rows) {
      if (countsAsEaten(row) === null) continue
      if (earliestAt === null || row.checkinAt < earliestAt) earliestAt = row.checkinAt
      if (latest === null || row.checkinAt > latest.checkinAt) latest = row
    }
    cursor = addIsoDays(cursor, -1)
  }
  return { latest, earliestAt, bowlFrom }
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
  const { satiety, bowl } = await loadSatiety(store, user, now)
  const hours = span.earliestAt === null
    ? 0
    : (now.getTime() - new Date(span.earliestAt).getTime()) / 3_600_000
  const statChanges = await todayStatChanges(
    store,
    caller.userId,
    today,
    records,
    span.latest,
    satiety,
    now,
  )
  const alive = pet?.alive === true
  const dead = pet !== null && !pet.alive
  const cooldownOver = canAdopt(user.cooldownUntil ? new Date(user.cooldownUntil) : null, now)
  const band = pet ? petBand(pet.hunger) : 'full'
  return {
    date: today,
    dateLabel: dateLabel(today),
    chips: MEALS.map((meal, index) => {
      const window = mealWindow(today, clocks[meal], user.timeZone)
      return {
        meal,
        name: MEAL_NAME[meal],
        time: clocks[meal],
        state: states[index],
        label: chipLabel(meal, states[index]),
        inWindow: now >= window.start && now < window.end,
      }
    }),
    badge: homeBadge(states),
    petView: homePetView(alive ? 'alive' : dead ? 'dead' : 'none', cooldownOver),
    petName: pet?.name || '小饭',
    band,
    bandText: PET_BAND_TEXT[band],
    companyDays: pet?.companyDays ?? 0,
    mealsEaten: pet?.mealsEaten ?? 0,
    cooldownDays: cooldownDaysLeft(user, today, now),
    satietyText: `${satiety}%`,
    healthText: String(healthScore(pet?.hunger ?? 0)),
    levelText: pet
      ? String(petLevel(hours, (pet.hungerLog ?? []).filter((day) => day.date < today)))
      : '',
    emotion: emotionFromHunger(satiety),
    camera: cameraOf(states),
    species: pet?.species ?? 'cat',
    photos: MEALS.flatMap((meal) => {
      const src = keptPhoto(countsAsEaten(records.find((row) => row.meal === meal)))
      return src === null ? [] : [{ meal, src }]
    }),
    bowlFill: bowl,
    statChanges,
    stapleLeft: effectiveStapleLeft(now, user.timeZone, user.stapleMonth, user.stapleLeft),
  }
}

/** 状态板浮窗里的当天变化。百分比是重算后的整数，健康跟着今天已经结算的饥饿档。 */
async function todayStatChanges(
  store: Store,
  userId: string,
  today: string,
  records: readonly MealRecordDoc[],
  latest: MealRecordDoc | null,
  percent: number,
  now: Date,
): Promise<string[]> {
  const lines: string[] = []
  const boosts: string[] = []
  for (const snack of await store.listSnacks(userId, today)) {
    if (snack.hidden) continue
    for (const at of snack.boosts ?? []) {
      if (Date.parse(at) <= now.getTime()) boosts.push(at)
    }
  }
  boosts.sort()
  const applied = boosts.slice(0, 3)
  const todayMeal = latest !== null && latest.date === today ? latest : null
  const snacksChanged = applied.length > 0 && (
    todayMeal === null
    || todayMeal.status === 'exempt'
    || applied.some((at) => Date.parse(at) >= Date.parse(todayMeal.checkinAt))
  )
  if (todayMeal !== null) {
    const name = MEAL_NAME[todayMeal.meal]
    lines.push(todayMeal.status === 'exempt'
      ? `${name}口粮后，饱腹加上 90，现在是 ${percent}%`
      : `${name}打卡后，饱腹从 100% 掉到现在的 ${percent}%`)
    if (snacksChanged) lines.push('今天的零食加成也算在这个数里')
  } else if (snacksChanged) {
    lines.push(`今天的零食加成后，饱腹是 ${percent}%`)
  } else if (!latest) {
    lines.push(`还没吃过，饱腹是 ${percent}%`)
  } else if (percent === 0) lines.push('上一餐之后没再吃，饱腹停在 0%')
  else lines.push(`饱腹是 ${percent}%`)

  for (const meal of MEALS) {
    const settlement = await store.getSettlement(userId, today, meal)
    if (!settlement) continue
    const record = records.find((row) => row.meal === meal)
    const verb = settlement.outcome === 'starved'
      ? '漏餐'
      : record?.status === 'exempt' ? '口粮' : '吃到'
    const before = healthScore(settlement.hungerBefore)
    const after = healthScore(settlement.hungerAfter)
    lines.push(`${MEAL_NAME[meal]}${verb}：漏了 ${settlement.hungerBefore} 餐，变成 ${settlement.hungerAfter} 餐，健康 ${before} → ${after}`)
  }
  if (lines.length === 0) lines.push('今天还没有打卡或结算')
  return lines
}

function keptPhoto(record: MealRecordDoc | null): string | null {
  if (record === null || record.status !== 'checked_in') return null
  return firstShown(record.photos, record.photoReviews)
}

export type GalleryFace = 'photo' | 'staple' | 'window' | 'waiting' | 'empty' | 'kept'

export type GalleryMeal = {
  meal: MealType
  name: string
  photo: string | null
  exempt: boolean
  note: Annotation | null
  face: GalleryFace
}

export type GallerySnack = {
  startedAt: string
  photo: string
  count: number
  note: Annotation | null
}

export type GalleryDay = {
  key: string
  week: string
  day: number
  marked: boolean
  star: boolean
}

export type GalleryCalendarDay = {
  key: string
  day: number
  marked: boolean
  star: boolean
  today: boolean
}

export type GalleryCalendar = {
  key: string
  label: string
  leading: number
  days: GalleryCalendarDay[]
}

export type GalleryView = {
  streak: number
  todayIndex: number
  days: GalleryDay[]
  meals: GalleryMeal[]
  snacks: GallerySnack[]
  /** 图鉴月份箭头的起点：始终是上一个逻辑月。 */
  earliestMonth: string
  calendar: GalleryCalendar | null
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

function clampGalleryDay(today: string, date: string): string {
  const current = today.slice(0, 7)
  const earliest = previousMonth(current)
  const month = date.slice(0, 7)
  if (month < earliest) return `${earliest}-01`
  if (month > current) return today
  return date
}

function clampGalleryMonth(today: string, month: string): string {
  const current = today.slice(0, 7)
  const earliest = previousMonth(current)
  if (month < earliest) return earliest
  if (month > current) return current
  return month
}

function firstShown(photos: readonly string[], reviews: readonly string[]): string | null {
  for (let i = 0; i < photos.length; i += 1) {
    if (reviews[i] !== 'rejected') return photos[i]
  }
  return null
}

function mealTile(meal: MealType, record: MealRecordDoc | undefined): Omit<GalleryMeal, 'face'> {
  const eaten = countsAsEaten(record)
  if (!eaten) return { meal, name: MEAL_NAME[meal], photo: null, exempt: false, note: null }
  if (eaten.status === 'exempt') return { meal, name: MEAL_NAME[meal], photo: null, exempt: true, note: null }
  return {
    meal,
    name: MEAL_NAME[meal],
    photo: firstShown(eaten.photos, eaten.photoReviews),
    exempt: false,
    note: eaten.note ?? null,
  }
}

function mealFace(
  meal: MealType,
  record: MealRecordDoc | undefined,
  now: Date,
  user: UserDoc,
  shown: string,
): GalleryMeal {
  const tile = mealTile(meal, record)
  if (tile.photo) return { ...tile, face: 'photo' }
  if (tile.exempt) return { ...tile, face: 'staple' }
  if (countsAsEaten(record)?.status === 'checked_in') return { ...tile, face: 'kept' }
  const clocks = clocksOn(user, shown)
  const state = chipState(now, mealWindow(shown, clocks[meal], user.timeZone), null)
  if (state === 'due') return { ...tile, face: 'window' }
  if (state === 'upcoming') return { ...tile, face: 'waiting' }
  return { ...tile, face: 'empty' }
}

function allCheckedIn(records: readonly MealRecordDoc[]): boolean {
  return MEALS.every((meal) => countsAsEaten(records.find((row) => row.meal === meal))?.status === 'checked_in')
}

function snackTiles(snacks: readonly SnackDoc[]): GallerySnack[] {
  const rows: GallerySnack[] = []
  for (const snack of snacks) {
    if (snack.hidden) continue
    const photos = snack.photos.filter((_, index) => snack.photoReviews[index] !== 'rejected')
    if (photos.length === 0) continue
    rows.push({
      startedAt: snack.startedAt,
      photo: photos[0],
      count: photos.length,
      note: snack.note ?? null,
    })
  }
  return rows
}

/** 图鉴顶部那一周一到日，今天落在哪一格。 */
function weekOf(today: string): { days: { key: string; week: string; day: number }[]; todayIndex: number } {
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
  month?: string,
): Promise<GalleryView> {
  const user = await requireUser(store, caller.userId)
  const today = logicalDate(now, user.timeZone)
  const currentMonth = stapleMonth(now, user.timeZone)
  const earliestMonth = previousMonth(currentMonth)
  const shown = clampGalleryDay(today, date ?? today)
  const week = weekOf(today)
  const [streak, records, snacks] = await Promise.all([
    streakOf(store, user, now),
    store.listRecords(caller.userId, shown),
    store.listSnacks(caller.userId, shown),
  ])
  const days = await Promise.all(week.days.map(async (day) => {
    const rows = day.key === shown ? records : await store.listRecords(caller.userId, day.key)
    const eaten = MEALS.some((meal) => countsAsEaten(rows.find((row) => row.meal === meal)) !== null)
    return { ...day, marked: eaten, star: allCheckedIn(rows) }
  }))
  return {
    streak,
    todayIndex: week.todayIndex,
    days,
    meals: MEALS.map((meal) => mealFace(meal, records.find((row) => row.meal === meal), now, user, shown)),
    snacks: snackTiles(snacks),
    earliestMonth,
    calendar: month
      ? await monthCalendar(store, caller.userId, clampGalleryMonth(today, month), today)
      : null,
  }
}

async function monthCalendar(
  store: Store,
  userId: string,
  month: string,
  today: string,
): Promise<GalleryCalendar> {
  const [yearText, monthText] = month.split('-')
  const year = Number(yearText)
  const monthNumber = Number(monthText)
  const weekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay()
  const leading = (weekday + 6) % 7
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const known = new Set(await store.listDates(userId))
  const days: GalleryCalendarDay[] = []
  for (let day = 1; day <= last; day += 1) {
    const key = `${month}-${String(day).padStart(2, '0')}`
    const rows = known.has(key) ? await store.listRecords(userId, key) : []
    const eaten = MEALS.some((meal) => countsAsEaten(rows.find((row) => row.meal === meal)) !== null)
    days.push({ key, day, marked: eaten, star: allCheckedIn(rows), today: key === today })
  }
  return {
    key: month,
    label: `${year}年${monthNumber}月`,
    leading,
    days,
  }
}

export type MeView = { nickname: string; accountId: string }

/** 同一用户永远得到同一个展示用账号，不暴露登录号。 */
export function displayAccountId(userId: string): string {
  let hash = 2_166_136_261
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i)
    hash = Math.imul(hash, 16_777_619)
  }
  const n = hash >>> 0
  const left = String(n % 10000).padStart(4, '0')
  const right = String(Math.floor(n / 10000) % 10000).padStart(4, '0')
  return `cf-${left}-${right}`
}

export async function meView(store: Store, caller: Caller): Promise<MeView> {
  const user = await requireUser(store, caller.userId)
  const nickname = user.nickname.trim()
  return { nickname, accountId: displayAccountId(user.userId) }
}

export type MemorialCard = { id: string; name: string; photo: string }

export type MemorialDetail = {
  missing: false
  name: string
  photo: string
  companyDays: number
  mealsEaten: number
  level: string
  adoptedOn: string
  diedOn: string
  cooldownDays: number
} | { missing: true }

/**
 * 没有死亡记录时列表是空的。首页只在冷却中的死亡态显示入口，空列表不改变首页。
 * 当前这只已死的宠物还没写入 pastPets，所以和历史分开列。没有宠物肖像。
 */
export async function memorialView(
  store: Store,
  caller: Caller,
  now: Date,
  id?: string,
): Promise<{ pets: MemorialCard[] } | MemorialDetail> {
  const user = await requireUser(store, caller.userId)
  const pet = await store.getPet(caller.userId)
  const pets = memorialCards(user, pet)
  if (id === undefined) return { pets }
  return memorialDetail(user, pet, pets, id, now)
}

function memorialCards(user: UserDoc, pet: Awaited<ReturnType<Store['getPet']>>): MemorialCard[] {
  const cards = user.pastPets.map((past) => ({
    id: past.adoptedOn,
    name: past.name || '小饭',
    photo: '',
  }))
  if (pet && pet.alive === false && !cards.some((card) => card.id === pet.adoptedOn)) {
    cards.push({ id: pet.adoptedOn, name: pet.name || '小饭', photo: '' })
  }
  return cards
}

function memorialDetail(
  user: UserDoc,
  pet: Awaited<ReturnType<Store['getPet']>>,
  pets: readonly MemorialCard[],
  id: string,
  now: Date,
): MemorialDetail {
  if (!pets.some((card) => card.id === id)) return { missing: true }
  const today = logicalDate(now, user.timeZone)
  if (pet && pet.alive === false && pet.adoptedOn === id) {
    return {
      missing: false,
      name: pet.name || '小饭',
      photo: '',
      companyDays: pet.companyDays,
      mealsEaten: pet.mealsEaten,
      level: String(petLevel(pet.companyDays * 24, pet.hungerLog ?? [])),
      adoptedOn: pet.adoptedOn,
      diedOn: pet.endedOn ?? user.diedOn ?? '',
      cooldownDays: cooldownDaysLeft(user, today, now),
    }
  }
  const past = user.pastPets.find((row) => row.adoptedOn === id)
  if (!past) return { missing: true }
  return {
    missing: false,
    name: past.name || '小饭',
    photo: '',
    companyDays: dayDistance(past.adoptedOn, past.diedOn) + 1,
    mealsEaten: 0,
    level: '—',
    adoptedOn: past.adoptedOn,
    diedOn: past.diedOn,
    cooldownDays: 0,
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
