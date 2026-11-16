import { addIsoDays } from './time.ts'
import type { ChipState, RecordedStatus } from './meal.ts'

/** 一天三餐都是打卡或口粮，这一天才算完成。 */
export function dayComplete(
  statuses: readonly (RecordedStatus | null)[],
): boolean {
  return statuses.length === 3 && statuses.every((status) => status === 'checked_in' || status === 'exempt')
}

/**
 * 连续天数从哪一天往回数。今天已完成就从今天数。
 * 今天还有餐次没到窗口或正在窗口内，不算断，从昨天数。
 * 今天已经漏了一餐，这一天不可能完成，连续天数为 0（返回 null）。
 */
export function streakAnchor(today: string, chips: readonly ChipState[]): string | null {
  if (chips.length === 3 && chips.every((s) => s === 'checked_in' || s === 'exempt')) return today
  if (chips.some((s) => s === 'missed')) return null
  return addIsoDays(today, -1)
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
  /** 当前或最近一只宠物的领养日。没有领养过为 null。 */
  adoptedOn: string | null
  /** 最近一只宠物的死亡日。还活着为 null。 */
  diedOn: string | null
  /**
   * 更早的宠物的在世区间，含两端。每只宠物死亡时记一条，不会被下一只覆盖。
   * 这些天不属于个人时间，也不属于当前宠物的共度。
   */
  pastPets?: readonly { adoptedOn: string; diedOn: string }[]
}

/**
 * 先领养：活着只算共度；死后从死亡日次日重计个人时间。
 * 先打卡：活着不减；死后从当前连续天数减去宠物在世重合的那些天。
 * 没有早于领养日的完成日，算先领养。
 * 更早的宠物按各自的在世区间扣掉重合的天，不会因为领养了新宠物而被算回来。
 */
export function personalStreak(input: StreakInput): number {
  const { endDate, adoptedOn, diedOn } = input
  const past = input.pastPets ?? []
  const inPast = (date: string) => past.some((p) => date >= p.adoptedOn && date <= p.diedOn)
  const completeDates = input.completeDates.filter((date) => !inPast(date))

  if (!adoptedOn) return streakEndingAt(completeDates, endDate)
  const firstAdoption = [...past.map((p) => p.adoptedOn), adoptedOn].sort()[0]
  const adoptFirst = !input.completeDates.some((date) => date < firstAdoption)
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
