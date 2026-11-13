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

  it('one job row per subject, date, and meal', async () => {
    const store = createMemoryStore()
    const lunch = {
      subjectType: 'personal' as const,
      subjectId: 'u',
      date: '2026-11-13',
      meal: 'lunch' as const,
      windowEndAt: '2026-11-13T06:00:00.000Z',
      status: 'pending' as const,
    }
    const breakfast = { ...lunch, meal: 'breakfast' as const }
    await store.saveJob(lunch)
    await store.saveJob(breakfast)
    await store.saveJob({ ...lunch, status: 'settled' })
    const lunchJob = await store.getJob('u', '2026-11-13', 'lunch')
    const breakfastJob = await store.getJob('u', '2026-11-13', 'breakfast')
    assert.equal(lunchJob?.status, 'settled')
    assert.equal(breakfastJob?.status, 'pending')
  })

  it('one settlement row per subject, date, and meal', async () => {
    const store = createMemoryStore()
    const lunch = {
      subjectType: 'personal' as const,
      subjectId: 'u',
      date: '2026-11-13',
      meal: 'lunch' as const,
      outcome: 'fed' as const,
      hungerBefore: 4,
      hungerAfter: 3,
    }
    const dinner = { ...lunch, meal: 'dinner' as const, outcome: 'starved' as const }
    await store.saveSettlement(lunch)
    await store.saveSettlement(dinner)
    await store.saveSettlement({ ...lunch, hungerAfter: 2 })
    const lunchSet = await store.getSettlement('u', '2026-11-13', 'lunch')
    const dinnerSet = await store.getSettlement('u', '2026-11-13', 'dinner')
    assert.equal(lunchSet?.hungerAfter, 2)
    assert.equal(dinnerSet?.outcome, 'starved')
  })

  it('listRecords scopes to userId and date', async () => {
    const store = createMemoryStore()
    const base = {
      status: 'checked_in' as const,
      checkinAt: '',
      photos: [] as string[],
      review: 'pending' as const,
      hidden: false,
    }
    await store.saveRecord({ userId: 'u1', date: '2026-11-13', meal: 'lunch', ...base })
    await store.saveRecord({ userId: 'u1', date: '2026-11-14', meal: 'lunch', ...base })
    await store.saveRecord({ userId: 'u2', date: '2026-11-13', meal: 'lunch', ...base })
    const rows = await store.listRecords('u1', '2026-11-13')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].userId, 'u1')
    assert.equal(rows[0].date, '2026-11-13')
  })
})
