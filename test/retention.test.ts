import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clearExpiredPhotos } from '../app/retention.ts'
import { galleryView } from '../app/views.ts'
import type { MealRecordDoc } from '../app/types.ts'
import { MEALS } from '../domain/index.ts'
import { record, seededStore } from './fixtures.ts'

const now = new Date('2026-11-13T04:10:00.000Z')

function daysFrom(start: string, end: string): string[] {
  const out: string[] = []
  let cursor = start
  while (cursor <= end) {
    out.push(cursor)
    const [year, month, day] = cursor.split('-').map(Number)
    cursor = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
  }
  return out
}

describe('expired photos', () => {
  it('drops photos before last month and keeps the streak', async () => {
    const store = await seededStore()
    const dates = daysFrom('2026-09-30', '2026-11-12')
    for (const date of dates) {
      for (const meal of MEALS) {
        const row: MealRecordDoc = record({
          date,
          meal,
          photos: [`${date}-${meal}`],
          photoReviews: ['passed'],
          review: 'passed',
        })
        await store.saveRecord(row)
      }
    }
    await store.saveRecord(record({
      date: '2026-11-13',
      meal: 'breakfast',
      photos: ['2026-11-13-breakfast'],
      photoReviews: ['passed'],
      review: 'passed',
    }))
    const dropped = await clearExpiredPhotos(store, { userId: 'u' }, now)
    assert.ok(dropped.includes('2026-09-30-breakfast'))
    const early = await store.getRecord('u', '2026-09-30', 'breakfast')
    assert.equal(early?.status, 'checked_in')
    assert.equal(early?.review, 'passed')
    assert.deepEqual(early?.photos, [])
    assert.deepEqual((await store.getRecord('u', '2026-10-01', 'breakfast'))?.photos, ['2026-10-01-breakfast'])
    assert.deepEqual((await store.getRecord('u', '2026-11-12', 'lunch'))?.photos, ['2026-11-12-lunch'])
    const gallery = await galleryView(store, { userId: 'u' }, now, '2026-09-30')
    assert.equal(gallery.streak, 44)
    assert.ok(gallery.meals.every((meal) => meal.face === 'kept' && meal.photo === null))
  })
})
