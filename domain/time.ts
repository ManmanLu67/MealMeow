export interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

const DAY_START_MINUTES = 4 * 60

export function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + days))
  return next.toISOString().slice(0, 10)
}

export function zonedParts(instant: Date, timeZone: string): WallClock {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const bag: Record<string, string> = {}
  for (const part of fmt.formatToParts(instant)) {
    if (part.type !== 'literal') bag[part.type] = part.value
  }
  let year = Number(bag.year)
  let month = Number(bag.month)
  let day = Number(bag.day)
  let hour = Number(bag.hour)
  if (hour === 24) {
    hour = 0
    const rolled = addIsoDays(isoDate(year, month, day), 1)
    ;[year, month, day] = rolled.split('-').map(Number)
  }
  return { year, month, day, hour, minute: Number(bag.minute) }
}

export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0)
  const corrected = guess - zoneOffsetMs(new Date(guess), timeZone)
  return new Date(guess - zoneOffsetMs(new Date(corrected), timeZone))
}

/** 逻辑日从当地 04:00 开始，04:00 整算新的一天。 */
export function logicalDate(instant: Date, timeZone: string): string {
  const wall = zonedParts(instant, timeZone)
  const minutes = wall.hour * 60 + wall.minute
  const iso = isoDate(wall.year, wall.month, wall.day)
  if (minutes < DAY_START_MINUTES) return addIsoDays(iso, -1)
  return iso
}

export function logicalDayStart(iso: string, timeZone: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return zonedTimeToUtc(year, month, day, 4, 0, timeZone)
}

/**
 * 饭点钟点落在逻辑日上的时刻。
 * 04:00 之前的钟点算这个逻辑日的次日凌晨。
 */
export function mealInstant(logicalDay: string, hhmm: string, timeZone: string): Date {
  const minutes = parseClock(hhmm)
  if (minutes === null) throw new Error(`invalid clock: ${hhmm}`)
  const [year, month, day] = logicalDay.split('-').map(Number)
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  const calendar = minutes < DAY_START_MINUTES ? addIsoDays(logicalDay, 1) : isoDate(year, month, day)
  const [cy, cm, cd] = calendar.split('-').map(Number)
  return zonedTimeToUtc(cy, cm, cd, hour, minute, timeZone)
}

export function parseClock(hhmm: string): number | null {
  const matched = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!matched) return null
  const hour = Number(matched[1])
  const minute = Number(matched[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

/** 两个逻辑日之间的天数，两端都算。from 晚于 to 时为 0。 */
export function daysBetweenInclusive(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const diff = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000)
  return diff < 0 ? 0 : diff + 1
}

export function minutesFromDayStart(clockMinutes: number): number {
  return (clockMinutes - DAY_START_MINUTES + 1440) % 1440
}

const ZONE_NAMES: Record<string, string> = {
  中国标准时间: 'Asia/Shanghai',
  'China Standard Time': 'Asia/Shanghai',
  台北標準時間: 'Asia/Taipei',
  'Taipei Standard Time': 'Asia/Taipei',
  东京标准时间: 'Asia/Tokyo',
  'Tokyo Standard Time': 'Asia/Tokyo',
  太平洋标准时间: 'America/Los_Angeles',
  'Pacific Standard Time': 'America/Los_Angeles',
  东部标准时间: 'America/New_York',
  'Eastern Standard Time': 'America/New_York',
  格林威治标准时间: 'UTC',
  'Coordinated Universal Time': 'UTC',
}

/** 设备报上来的时区。IANA 名称原样留下，Windows 名称和 UTC+8 这种偏移改成 IANA。认不出就是 null。 */
export function canonicalTimeZone(input: string): string | null {
  const raw = input.trim()
  if (raw === '') return null
  if (acceptsTimeZone(raw)) return raw
  const named = ZONE_NAMES[raw]
  if (named !== undefined && acceptsTimeZone(named)) return named
  const hours = offsetHours(raw)
  if (hours === null) return null
  const zone = zoneForOffset(hours)
  return zone !== null && acceptsTimeZone(zone) ? zone : null
}

export function acceptsTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0)
    return true
  } catch {
    return false
  }
}

function offsetHours(raw: string): number | null {
  const text = raw.replace(/\s+/g, '').toUpperCase()
  const matched = /^(?:UTC|GMT)?([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(text)
  if (!matched) return null
  const sign = matched[1] === '-' ? -1 : 1
  const hour = Number(matched[2])
  const minute = matched[3] === undefined ? 0 : Number(matched[3])
  if (hour > 14 || minute > 59) return null
  return sign * (hour + minute / 60)
}

function zoneForOffset(hours: number): string | null {
  if (hours === 8) return 'Asia/Shanghai'
  if (hours === 0) return 'UTC'
  if (hours === 9) return 'Asia/Tokyo'
  if (hours === 5.5) return 'Asia/Kolkata'
  if (hours === -5) return 'America/New_York'
  if (hours === -8) return 'America/Los_Angeles'
  if (hours === 1) return 'Europe/Berlin'
  if (!Number.isInteger(hours) || hours < -12 || hours > 14) return null
  return `Etc/GMT${hours > 0 ? '-' : '+'}${Math.abs(hours)}`
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const wall = zonedParts(instant, timeZone)
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0)
  return wallAsUtc - instant.getTime()
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
