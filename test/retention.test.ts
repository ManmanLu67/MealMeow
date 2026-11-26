import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { clearExpiredPhotos, purgeNotice } from '../app/retention.ts'
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
    assert.equal(gallery.meals.find((meal) => meal.meal === 'breakfast')?.photo, '2026-10-01-breakfast')
  })
})

describe('purgeNotice', () => {
  it('warns on the last logical day of a month without deleting yet', () => {
    const at = new Date('2026-11-30T15:00:00.000Z')
    assert.deepEqual(purgeNotice(at, 'Asia/Shanghai', null), { month: '2026-10', deleteNow: false })
    assert.equal(purgeNotice(at, 'Asia/Shanghai', '2026-10'), null)
    assert.deepEqual(purgeNotice(at, 'Asia/Shanghai', '2026-09'), { month: '2026-10', deleteNow: false })
  })

  it('warns after the window rolls with deleteNow once the month has fallen out', () => {
    const at = new Date('2026-11-30T20:00:00.000Z')
    assert.deepEqual(purgeNotice(at, 'Asia/Shanghai', null), { month: '2026-10', deleteNow: true })
    assert.deepEqual(purgeNotice(at, 'Asia/Shanghai', '2026-10'), { month: '2026-10', deleteNow: true })
  })
})
