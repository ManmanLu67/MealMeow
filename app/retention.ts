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

export function previousMonth(month: string): string {
  const [yearText, monthText] = month.split('-')
  const year = Number(yearText)
  const monthNumber = Number(monthText)
  if (monthNumber === 1) return `${year - 1}-12`
  return `${year}-${String(monthNumber - 1).padStart(2, '0')}`
}

async function scanExpiredPhotos(
  store: Store,
  caller: Caller,
  now: Date,
): Promise<{ paths: string[]; records: Awaited<ReturnType<Store['listRecords']>>; snacks: Awaited<ReturnType<Store['listSnacks']>> } | null> {
  const user = await store.getUser(caller.userId)
  if (user === null) return null
  const current = stapleMonth(now, user.timeZone)
  const kept = new Set([current, previousMonth(current)])
  const paths: string[] = []
  const records: Awaited<ReturnType<Store['listRecords']>> = []
  const snacks: Awaited<ReturnType<Store['listSnacks']>> = []
  for (const date of await store.listDates(caller.userId)) {
    if (kept.has(date.slice(0, 7))) continue
    for (const record of await store.listRecords(caller.userId, date)) {
      paths.push(...record.photos)
      if (record.photos.length > 0) records.push(record)
    }
    for (const snack of await store.listSnacks(caller.userId, date)) {
      paths.push(...snack.photos)
      if (snack.photos.length > 0) snacks.push(snack)
    }
  }
  return { paths, records, snacks }
}

/** 本月和上月以外的照片路径（只读，不写库）。 */
export async function listExpiredPhotoPaths(store: Store, caller: Caller, now: Date): Promise<string[]> {
  const scan = await scanExpiredPhotos(store, caller, now)
  return scan === null ? [] : scan.paths
}

/** 本月和上月以外的照片路径清掉。记录、审核和结算留下。返回被清掉的路径。 */
export async function clearExpiredPhotos(store: Store, caller: Caller, now: Date): Promise<string[]> {
  const scan = await scanExpiredPhotos(store, caller, now)
  if (scan === null) return []
  for (const record of scan.records) {
    await store.saveRecord({ ...record, photos: [], photoReviews: [] })
  }
  for (const snack of scan.snacks) {
    await store.saveSnack({ ...snack, photos: [], photoReviews: [] })
  }
  return scan.paths
}

export async function photoPurgeNotice(
  store: Store,
  caller: Caller,
  now: Date,
  noted: string | null,
): Promise<{ month: string; deleteNow: boolean } | null> {
  const user = await store.getUser(caller.userId)
  if (user === null) return null
  let notice = purgeNotice(now, user.timeZone, noted)
  if (notice !== null && notice.deleteNow) {
    const paths = await listExpiredPhotoPaths(store, caller, now)
    if (paths.length === 0) notice = null
  }
  return notice
}
