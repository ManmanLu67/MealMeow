import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMemoryStore } from '../app/store.ts'

describe('memory store', () => {
  it('one row per user, date, and meal', async () => {
    const store = createMemoryStore()
    const row = {
      userId: 'u',
      date: '2026-11-13',
      meal: 'lunch' as const,
      status: 'checked_in' as const,
      checkinAt: '',
      photos: ['a', 'b'],
      review: 'pending' as const,
      hidden: false,
    }
    await store.saveRecord(row)
    await store.saveRecord({ ...row, photos: ['c'] })
    const all = await store.listRecords('u', '2026-11-13')
    assert.equal(all.length, 1)
    assert.deepEqual(all[0].photos, ['c'])
  })
})
