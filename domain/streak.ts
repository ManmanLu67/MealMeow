import { addIsoDays } from './time.ts'
import type { RecordedStatus } from './meal.ts'

/** 一天三餐都是打卡或口粮，这一天才算完成。 */
export function dayComplete(
  statuses: readonly (RecordedStatus | null)[],
): boolean {
  return statuses.length === 3 && statuses.every((status) => status === 'checked_in' || status === 'exempt')
}

export function streakEndingAt(completeDates: readonly string[], endDate: string): number {
  const done = new Set(completeDates)
  let count = 0
  let cursor = endDate
  while (done.has(cursor)) {
    count += 1
    cursor = addIsoDays(cursor, -1)
  }
  return count
}

export interface StreakInput {
  completeDates: readonly string[]
  endDate: string
  adoptedOn: string | null
  diedOn: string | null
}

/**
 * 先领养：活着只算共度；死后从死亡日次日重计个人时间。
 * 先打卡：活着不减；死后从当前连续天数减去宠物在世重合的那些天。
 * 没有早于领养日的完成日，算先领养。
 */
export function personalStreak(input: StreakInput): number {
  const { completeDates, endDate, adoptedOn, diedOn } = input
  if (!adoptedOn) return streakEndingAt(completeDates, endDate)
  const adoptFirst = !completeDates.some((date) => date < adoptedOn)
  if (adoptFirst) {
    const counted = diedOn
      ? completeDates.filter((date) => date > diedOn)
      : completeDates.filter((date) => date >= adoptedOn)
    return streakEndingAt(counted, endDate)
  }
  if (!diedOn) return streakEndingAt(completeDates, endDate)
  const run = runDates(completeDates, endDate)
  const petDays = run.filter((date) => date >= adoptedOn && date <= diedOn).length
  return run.length - petDays
}

function runDates(completeDates: readonly string[], endDate: string): string[] {
  const done = new Set(completeDates)
  const dates: string[] = []
  let cursor = endDate
  while (done.has(cursor)) {
    dates.push(cursor)
    cursor = addIsoDays(cursor, -1)
  }
  return dates
}
