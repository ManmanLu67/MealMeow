import {
  addIsoDays,
  logicalDate,
  mealInstant,
  minutesFromDayStart,
  parseClock,
} from './time.ts'

export const MEALS = ['breakfast', 'lunch', 'dinner'] as const
export type MealType = (typeof MEALS)[number]
export type MealClocks = Record<MealType, string>
export type RecordedStatus = 'checked_in' | 'exempt'
export type ChipState = 'upcoming' | 'due' | 'checked_in' | 'exempt' | 'missed'

const MEAL_SHORT: Record<MealType, string> = {
  breakfast: '早',
  lunch: '中',
  dinner: '晚',
}

const HOUR_MS = 60 * 60 * 1000
const MIN_GAP_MINUTES = 120

export interface MealWindow {
  start: Date
  end: Date
}

export function mealWindow(
  logicalDay: string,
  hhmm: string,
  timeZone: string,
): MealWindow {
  const at = mealInstant(logicalDay, hhmm, timeZone)
  return {
    start: new Date(at.getTime() - HOUR_MS),
    end: new Date(at.getTime() + HOUR_MS),
  }
}

/** 相邻窗口至少隔 2 小时，恰好 2 小时允许。窗口用左闭右开，端点不相交。 */
export function validateMealClocks(clocks: MealClocks): string | null {
  const offsets: number[] = []
  for (const meal of MEALS) {
    const minutes = parseClock(clocks[meal])
    if (minutes === null) return '饭点格式应为 HH:mm'
    offsets.push(minutesFromDayStart(minutes))
  }
  offsets.sort((a, b) => a - b)
  for (let i = 0; i < offsets.length; i += 1) {
    const current = offsets[i]
    const next = i === offsets.length - 1 ? offsets[0] + 1440 : offsets[i + 1]
    if (next - current < MIN_GAP_MINUTES) return '相邻饭点至少相隔 2 小时'
  }
  return null
}

export function chipState(
  now: Date,
  window: MealWindow,
  record: RecordedStatus | null,
): ChipState {
  if (record === 'checked_in') return 'checked_in'
  if (record === 'exempt') return 'exempt'
  if (now < window.start) return 'upcoming'
  if (now < window.end) return 'due'
  return 'missed'
}

export function chipLabel(meal: MealType, state: ChipState): string {
  const name = MEAL_SHORT[meal]
  if (state === 'upcoming') return name
  if (state === 'due') return `${name} · 待打卡`
  if (state === 'checked_in') return `${name} · 已打`
  if (state === 'exempt') return `${name} · 口粮`
  return `${name} · 漏`
}

export function openMeals(
  now: Date,
  clocks: MealClocks,
  records: Partial<Record<MealType, RecordedStatus | null>>,
  timeZone: string,
): MealType[] {
  const day = logicalDate(now, timeZone)
  return MEALS.filter((meal) => {
    const window = mealWindow(day, clocks[meal], timeZone)
    return chipState(now, window, records[meal] ?? null) === 'due'
  })
}

export function cameraAction(due: readonly MealType[]):
  | { type: 'toast' }
  | { type: 'checkin'; meal: MealType }
  | { type: 'pick'; meals: MealType[] } {
  if (due.length === 0) return { type: 'toast' }
  if (due.length === 1) return { type: 'checkin', meal: due[0] }
  return { type: 'pick', meals: [...due] }
}

export function homeBadge(states: readonly ChipState[]): boolean {
  return states.some((state) => state === 'due')
}

/** 窗口结算前删除会撤掉这条打卡；结算后只把照片从图鉴拿掉。 */
export function deleteCheckin(settled: boolean): 'cancel' | 'hide_photos' {
  return settled ? 'hide_photos' : 'cancel'
}

export function effectiveClocks(
  saved: MealClocks,
  pending: { clocks: MealClocks; effectiveOn: string } | null,
  logicalToday: string,
): MealClocks {
  if (pending && logicalToday >= pending.effectiveOn) return pending.clocks
  return saved
}

/** 口粮额度按逻辑月，每月 1 日 04:00 换月。 */
export function stapleMonth(instant: Date, timeZone: string): string {
  return logicalDate(instant, timeZone).slice(0, 7)
}

export function canUseStaple(input: {
  livingPet: boolean
  inWindow: boolean
  settled: boolean
  stapleLeft: number
  alreadyRecorded: boolean
}): boolean {
  return input.livingPet
    && input.inWindow
    && !input.settled
    && input.stapleLeft > 0
    && !input.alreadyRecorded
}

export function tomorrowLogicalDate(logicalToday: string): string {
  return addIsoDays(logicalToday, 1)
}
