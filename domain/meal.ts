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
const DAY_START_MINUTES = 4 * 60

/** 应急口粮每个逻辑月的额度。 */
export const STAPLE_PER_MONTH = 2

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

/** 窗口是饭点前后 1 小时，左闭右开。相邻窗口不能重合；恰好隔 2 小时时端点相接，允许。 */
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
    if (next - current < MIN_GAP_MINUTES) return '打卡时间不能重合'
  }
  // 窗口是饭点前后 1 小时。饭点在 03:01–04:59 时窗口会跨过 04:00 的逻辑日界线，
  // 同一个窗口会分属两个逻辑日，所以不接受。03:00 和 05:00 刚好贴着界线，可以。
  for (const meal of MEALS) {
    const minutes = parseClock(clocks[meal]) as number
    if (minutes > DAY_START_MINUTES - 60 && minutes < DAY_START_MINUTES + 60) {
      return '饭点前后 1 小时不能跨过凌晨 4 点，请避开 03:01 到 04:59'
    }
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

export type CameraAction =
  | { type: 'pick'; meals: MealType[]; snack: true }
  /** 没有待打的餐：直接记零食。窗口里这一餐已经打过时也走这里。 */
  | { type: 'snack' }

/**
 * 首页相机按下去做什么。due 是窗口内还没打卡的餐。
 * 有待打的餐时，可选其中一餐，也可以另记零食。已打卡的餐不通过相机修改，修改走顶部胶囊。
 */
export function cameraAction(due: readonly MealType[]): CameraAction {
  if (due.length > 0) return { type: 'pick', meals: [...due], snack: true }
  return { type: 'snack' }
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
