import type { MealClocks, MealType } from './meal.ts'
import { MEALS } from './meal.ts'
import type { PetBand } from './pet.ts'
import { addIsoDays, mealInstant } from './time.ts'

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
 * 打卡之后饥饿从 0% 涨到下一餐的饭点。口粮不跟着涨，停在 10%。
 * 到了饭点或已经过了，就是 100%。
 */
export function feedingHungerPercent(
  now: Date,
  checkinAt: Date,
  nextAt: Date,
  staple: boolean,
): number {
  if (staple) return 10
  const span = nextAt.getTime() - checkinAt.getTime()
  if (span <= 0) return 100
  const raw = ((now.getTime() - checkinAt.getTime()) / span) * 100
  if (raw <= 0) return 0
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

/** 情绪标签跟着饥饿百分比，不跟健康档。 */
export function emotionFromHunger(percent: number): string {
  if (percent <= 30) return '饱足'
  if (percent <= 60) return '满足'
  if (percent <= 85) return '有点饿'
  return '饿扁了'
}
