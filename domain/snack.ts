import { MEALS, mealWindow } from './meal.ts'
import type { MealClocks } from './meal.ts'
import { logicalDate } from './time.ts'

/** 窗口外的打卡算零食。一小时内的零食记成一份，从这一份的第一次打卡起算。 */
export const SNACK_MERGE_MS = 60 * 60 * 1000

/**
 * 现在是否落在任何一餐的窗口里，不管那一餐有没有打过卡。
 * 饭点不能落在 03:01–04:59，所以每个窗口都在同一个逻辑日内，只看今天这一天就够。
 */
export function inAnyWindow(now: Date, clocks: MealClocks, timeZone: string): boolean {
  const day = logicalDate(now, timeZone)
  return MEALS.some((meal) => {
    const window = mealWindow(day, clocks[meal], timeZone)
    return now >= window.start && now < window.end
  })
}

/**
 * 这次零食要并入哪一份。参数是今天已有零食的起点（ISO 时刻）。
 * 起点距现在不满一小时的，并入其中最近的一份；否则开一份新的。
 * 以第一次打卡为锚，不是滑动窗口，所以连续不断地吃也会在一小时后另开一份。
 */
export function snackMergeTarget(starts: readonly string[], now: Date): string | null {
  const at = now.getTime()
  let best: string | null = null
  for (const start of starts) {
    const t = new Date(start).getTime()
    if (t > at || at - t >= SNACK_MERGE_MS) continue
    if (best === null || start > best) best = start
  }
  return best
}
