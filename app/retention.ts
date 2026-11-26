import { addIsoDays, logicalDate } from '../domain/index.ts'
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

type MonthPhotos = {
  paths: string[]
  records: Awaited<ReturnType<Store['listRecords']>>
  snacks: Awaited<ReturnType<Store['listSnacks']>>
}

async function photosByMonth(store: Store, caller: Caller): Promise<Map<string, MonthPhotos>> {
  const map = new Map<string, MonthPhotos>()
  if ((await store.getUser(caller.userId)) === null) return map
  for (const date of await store.listDates(caller.userId)) {
    const month = date.slice(0, 7)
    const paths: string[] = []
    const records: MonthPhotos['records'] = []
    const snacks: MonthPhotos['snacks'] = []
    for (const record of await store.listRecords(caller.userId, date)) {
      if (record.photos.length === 0) continue
      paths.push(...record.photos)
      records.push(record)
    }
    for (const snack of await store.listSnacks(caller.userId, date)) {
      if (snack.photos.length === 0) continue
      paths.push(...snack.photos)
      snacks.push(snack)
    }
    if (paths.length === 0) continue
    const hit = map.get(month) ?? { paths: [], records: [], snacks: [] }
    hit.paths.push(...paths)
    hit.records.push(...records)
    hit.snacks.push(...snacks)
    map.set(month, hit)
  }
  return map
}

/** 只清掉这一个月的照片。记录、审核和结算留下。返回被清掉的路径。 */
export async function clearExpiredPhotos(
  store: Store,
  caller: Caller,
  _now: Date,
  month: string,
): Promise<string[]> {
  const hit = (await photosByMonth(store, caller)).get(month)
  if (hit === undefined) return []
  for (const record of hit.records) {
    await store.saveRecord({ ...record, photos: [], photoReviews: [] })
  }
  for (const snack of hit.snacks) {
    await store.saveSnack({ ...snack, photos: [], photoReviews: [] })
  }
  return hit.paths
}

export async function photoPurgeNotice(
  store: Store,
  caller: Caller,
  now: Date,
  noted: string | null,
): Promise<{ month: string; deleteNow: boolean } | null> {
  const user = await store.getUser(caller.userId)
  if (user === null) return null
  const today = logicalDate(now, user.timeZone)
  const previous = previousMonth(today.slice(0, 7))
  const byMonth = await photosByMonth(store, caller)
  const older = [...byMonth.keys()].filter((month) => month < previous).sort()
  if (older.length > 0) return { month: older[0], deleteNow: true }
  const notice = purgeNotice(now, user.timeZone, noted)
  if (notice !== null && notice.deleteNow && !byMonth.has(notice.month)) return null
  return notice
}
