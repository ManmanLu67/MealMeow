import type { MealClocks, MealType } from './meal.ts'
import { MEALS } from './meal.ts'
import type { PetBand } from './pet.ts'
import { addIsoDays, logicalDate, mealInstant } from './time.ts'

export type SatietyEvent = {
  kind: 'meal' | 'staple' | 'snack'
  at: string
  meal?: MealType
  date?: string
}

const SATIETY_KIND_ORDER: Record<SatietyEvent['kind'], number> = {
  meal: 0,
  staple: 1,
  snack: 2,
}

function sortSatietyEvents(events: readonly SatietyEvent[]): SatietyEvent[] {
  return [...events].sort((a, b) => {
    const t = Date.parse(a.at) - Date.parse(b.at)
    if (t !== 0) return t
    return SATIETY_KIND_ORDER[a.kind] - SATIETY_KIND_ORDER[b.kind]
  })
}

/**
 * 事件时刻之后最早的一顿饭点（严格大于该时刻）。
 * 每天三顿饭，下一顿只可能落在该逻辑日或次日；只扫这两天。
 */
function followingMealInstant(
  at: Date,
  clocksFor: (date: string) => MealClocks,
  timeZone: string,
): Date {
  const start = logicalDate(at, timeZone)
  const atMs = at.getTime()
  for (let day = 0; day <= 1; day += 1) {
    const iso = addIsoDays(start, day)
    const clocks = clocksFor(iso)
    for (const meal of MEALS) {
      const instant = mealInstant(iso, clocks[meal], timeZone)
      if (instant.getTime() > atMs) return instant
    }
  }
  const after = addIsoDays(start, 2)
  return mealInstant(after, clocksFor(after).breakfast, timeZone)
}

function linearSatiety(value: number, anchorAt: Date, nextMeal: Date, at: Date): number {
  if (value <= 0) return 0
  const t = at.getTime()
  if (t >= nextMeal.getTime()) return 0
  const span = nextMeal.getTime() - anchorAt.getTime()
  if (span <= 0) return 0
  const elapsed = t - anchorAt.getTime()
  if (elapsed <= 0) return value
  return Math.round(value * (1 - elapsed / span))
}

type SatietyTrack = {
  value: number
  anchorAt: Date
  nextMeal: Date
  active: boolean
}

function initTrack(): SatietyTrack {
  return { value: 0, anchorAt: new Date(0), nextMeal: new Date(0), active: false }
}

function applyDecay(track: SatietyTrack, at: Date): void {
  if (!track.active) return
  track.value = linearSatiety(track.value, track.anchorAt, track.nextMeal, at)
  track.anchorAt = at
  if (track.value <= 0) track.active = false
}

function anchorTrack(track: SatietyTrack, value: number, at: Date, nextMeal: Date): void {
  track.value = value
  track.anchorAt = at
  track.nextMeal = nextMeal
  track.active = value > 0
}

function replaySatiety(
  now: Date,
  events: readonly SatietyEvent[],
  clocksFor: (date: string) => MealClocks,
  timeZone: string,
  includeBowl: boolean,
): number {
  const satiety = initTrack()
  const bowl = initTrack()
  const ordered = sortSatietyEvents(events)
  const nowMs = now.getTime()
  const snackBoosts = new Map<string, number>()

  for (const event of ordered) {
    const at = new Date(event.at)
    if (at.getTime() > nowMs) break
    if (event.kind === 'snack') {
      const day = logicalDate(at, timeZone)
      const used = snackBoosts.get(day) ?? 0
      if (used >= 3) continue
      snackBoosts.set(day, used + 1)
    }
    applyDecay(satiety, at)
    if (includeBowl && bowl.active) applyDecay(bowl, at)

    const next = followingMealInstant(at, clocksFor, timeZone)
    if (event.kind === 'meal') {
      anchorTrack(satiety, 100, at, next)
      if (includeBowl) anchorTrack(bowl, 100, at, next)
    } else if (event.kind === 'staple') {
      const nextValue = Math.round(satiety.value + 90)
      anchorTrack(satiety, nextValue, at, next)
    } else {
      const nextValue = Math.round(satiety.value + 5)
      anchorTrack(satiety, nextValue, at, next)
      if (includeBowl) anchorTrack(bowl, nextValue, at, next)
    }
  }

  const result = satiety.active
    ? linearSatiety(satiety.value, satiety.anchorAt, satiety.nextMeal, now)
    : 0

  if (!includeBowl) return result

  const bowlValue = bowl.active
    ? linearSatiety(bowl.value, bowl.anchorAt, bowl.nextMeal, now)
    : 0
  return Math.min(100, bowlValue)
}

export function satietyAt(
  now: Date,
  events: readonly SatietyEvent[],
  clocksFor: (date: string) => MealClocks,
  timeZone: string,
): number {
  return replaySatiety(now, events, clocksFor, timeZone, false)
}

export function bowlSatiety(
  now: Date,
  events: readonly SatietyEvent[],
  clocksFor: (date: string) => MealClocks,
  timeZone: string,
): number {
  return replaySatiety(now, events, clocksFor, timeZone, true)
}

/** 某一逻辑日结束时的饥饿档，以及这一天结算了几餐。 */
export type HungerDay = {
  date: string
  band: PetBand
  meals: number
}

/**
 * 打卡当时食盘是满的，到下一顿饭点清空。
 * 只用于真正的打卡。口粮和零食不往盘子里加丸子。
 */
export function bowlFill(now: Date, checkinAt: Date, nextAt: Date): number {
  return 100 - feedingHungerPercent(now, checkinAt, nextAt, false)
}

/**
 * 打卡之后饥饿从 0% 涨到下一餐的饭点。口粮先回到 10%，再同样涨到下一餐。
 * 到了饭点或已经过了，停在 100%，直到下一次打卡或口粮。
 */
export function feedingHungerPercent(
  now: Date,
  checkinAt: Date,
  nextAt: Date,
  staple: boolean,
): number {
  const floor = staple ? 10 : 0
  const span = nextAt.getTime() - checkinAt.getTime()
  if (span <= 0) return 100
  const raw = floor + ((now.getTime() - checkinAt.getTime()) / span) * (100 - floor)
  if (raw <= floor) return floor
  if (raw >= 100) return 100
  return Math.round(raw)
}

/** 这一餐的下一顿饭点。晚餐的下一顿是次日早餐。 */
export function nextMealAt(
  date: string,
  meal: MealType,
  clocks: MealClocks,
  timeZone: string,
): Date {
  const index = MEALS.indexOf(meal)
  if (index < MEALS.length - 1) return mealInstant(date, clocks[MEALS[index + 1]], timeZone)
  return mealInstant(addIsoDays(date, 1), clocks.breakfast, timeZone)
}

/**
 * 健康仍用原来的饥饿值。0 是满分 100，9 死亡是 0。
 * 漏餐、进食恢复、濒危和死亡的判定不在这里改。
 */
export function healthScore(hunger: number): number {
  if (hunger >= 9) return 0
  const points = hunger <= 0 ? 0 : hunger
  return Math.round(((9 - points) / 9) * 100)
}

/**
 * 常见角色曲线：到等级 n 一共要 n² 小时。
 * 1 小时到 1 级，4 小时到 2 级，之后每级需要的时间越来越长。最低 0。
 */
export function levelFromCheckinHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0
  return Math.floor(Math.sqrt(hours))
}

/** 这一天又结算了一餐。同一天后来的档覆盖前面的，餐数累加。 */
export function recordHungerDay(
  log: readonly HungerDay[],
  date: string,
  band: PetBand,
): HungerDay[] {
  const found = log.find((day) => day.date === date)
  if (!found) return [...log, { date, band, meals: 1 }]
  return log.map((day) => (
    day.date === date ? { date, band, meals: day.meals + 1 } : day
  ))
}

/**
 * 已经记下的饥饿档。吃饱不扣。
 * 有点饿、很饿：这一天扣 1 级。濒危：这一天每结算一餐扣 1 级。
 */
export function levelPenalty(days: readonly HungerDay[]): number {
  let penalty = 0
  for (const day of days) {
    if (day.band === 'peckish' || day.band === 'hungry') penalty += 1
    else if (day.band === 'critical') penalty += day.meals
  }
  return penalty
}

/** 曲线等级减去已结束那些天的扣级，最低 0。 */
export function petLevel(hours: number, closedDays: readonly HungerDay[]): number {
  return Math.max(0, levelFromCheckinHours(hours) - levelPenalty(closedDays))
}

/** 情绪标签跟着饱腹百分比，不跟健康档。 */
export function emotionFromHunger(percent: number): string {
  if (percent >= 70) return '饱足'
  if (percent >= 40) return '满足'
  if (percent >= 15) return '有点饿'
  return '饿扁了'
}
