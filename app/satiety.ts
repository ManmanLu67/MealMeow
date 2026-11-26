import { addIsoDays, bowlSatiety, logicalDate, satietyAt, type SatietyEvent } from '../domain/index.ts'
import { clocksOn } from './schedule.ts'
import type { Store } from './ports.ts'
import type { MealRecordDoc, SnackDoc, UserDoc } from './types.ts'

function countsAsSatiety(record: MealRecordDoc | undefined): MealRecordDoc | null {
  if (!record || record.hidden || record.review === 'rejected') return null
  return record
}

export function satietyEvents(
  records: readonly MealRecordDoc[],
  snacks: readonly SnackDoc[],
): SatietyEvent[] {
  const events: SatietyEvent[] = []
  for (const row of records) {
    const eaten = countsAsSatiety(row)
    if (!eaten) continue
    if (eaten.status === 'checked_in') {
      events.push({ kind: 'meal', at: eaten.checkinAt, meal: eaten.meal, date: eaten.date })
    } else if (eaten.status === 'exempt') {
      events.push({ kind: 'staple', at: eaten.checkinAt, meal: eaten.meal, date: eaten.date })
    }
  }
  for (const snack of snacks) {
    if (snack.hidden) continue
    for (const at of snack.boosts ?? []) {
      events.push({ kind: 'snack', at })
    }
  }
  return events
}

export async function loadSatiety(
  store: Store,
  user: UserDoc,
  now: Date,
): Promise<{ satiety: number; bowl: number }> {
  const today = logicalDate(now, user.timeZone)
  const dates = [addIsoDays(today, -2), addIsoDays(today, -1), today]
  const records: MealRecordDoc[] = []
  const snacks: SnackDoc[] = []
  for (const date of dates) {
    records.push(...await store.listRecords(user.userId, date))
    snacks.push(...await store.listSnacks(user.userId, date))
  }
  const events = satietyEvents(records, snacks)
  const clocksFor = (date: string) => clocksOn(user, date)
  return {
    satiety: satietyAt(now, events, clocksFor, user.timeZone),
    bowl: bowlSatiety(now, events, clocksFor, user.timeZone),
  }
}