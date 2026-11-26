import { addIsoDays, logicalDate, stapleMonth } from '../domain/index.ts'
import type { Store } from './ports.ts'
import type { Caller } from './handle.ts'

export function purgeNotice(
  now: Date,
  timeZone: string,
  noted: string | null,
): { month: string; deleteNow: boolean } | null {
  const today = logicalDate(now, timeZone)
  const currentMonth = today.slice(0, 7)
  const previous = previousMonth(currentMonth)
  const fallenOut = previousMonth(previous)
  const nextDay = addIsoDays(today, 1)
  const lastDayOfMonth = nextDay.slice(0, 7) !== currentMonth
  const month = lastDayOfMonth ? previous : fallenOut
  const deleteNow = !lastDayOfMonth
  if (noted === month && !deleteNow) return null
  return { month, deleteNow }
}

function previousMonth(month: string): string {
  const [yearText, monthText] = month.split('-')
  const year = Number(yearText)
  const monthNumber = Number(monthText)
  if (monthNumber === 1) return `${year - 1}-12`
  return `${year}-${String(monthNumber - 1).padStart(2, '0')}`
}

/** 本月和上月以外的照片路径清掉。记录、审核和结算留下。返回被清掉的路径。 */
export async function clearExpiredPhotos(store: Store, caller: Caller, now: Date): Promise<string[]> {
  const user = await store.getUser(caller.userId)
  if (user === null) return []
  const current = stapleMonth(now, user.timeZone)
  const kept = new Set([current, previousMonth(current)])
  const dropped: string[] = []
  for (const date of await store.listDates(caller.userId)) {
    if (kept.has(date.slice(0, 7))) continue
    for (const record of await store.listRecords(caller.userId, date)) {
      dropped.push(...record.photos)
      if (record.photos.length === 0) continue
      await store.saveRecord({ ...record, photos: [], photoReviews: [] })
    }
    for (const snack of await store.listSnacks(caller.userId, date)) {
      dropped.push(...snack.photos)
      if (snack.photos.length === 0) continue
      await store.saveSnack({ ...snack, photos: [], photoReviews: [] })
    }
  }
  return dropped
}
