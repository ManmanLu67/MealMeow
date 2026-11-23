import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Store } from '../app/ports.ts'
import { mustPet, pet, record, user } from './fixtures.ts'

/** 内存实现和云数据库实现各跑一遍。行为必须相同。 */
export function runStoreContract(name: string, makeStore: () => Store): void {
  describe(name, () => {
    it('one row per user, date, and meal', async () => {
      const store = makeStore()
      await store.saveRecord(record({ photos: ['a', 'b'], photoReviews: ['pending', 'pending'] }))
      await store.saveRecord(record({ photos: ['c'] }))
      const all = await store.listRecords('u', '2026-11-13')
      assert.equal(all.length, 1)
      assert.deepEqual(all[0].photos, ['c'])
    })

    it('one job row per subject, date, and meal', async () => {
      const store = makeStore()
      const lunch = {
        subjectType: 'personal' as const,
        subjectId: 'u',
        date: '2026-11-13',
        meal: 'lunch' as const,
        windowEndAt: '2026-11-13T06:00:00.000Z',
        status: 'pending' as const,
      }
      await store.saveJob(lunch)
      await store.saveJob({ ...lunch, meal: 'breakfast' })
      await store.saveJob({ ...lunch, status: 'settled' })
      assert.equal((await store.getJob('u', '2026-11-13', 'lunch'))?.status, 'settled')
      assert.equal((await store.getJob('u', '2026-11-13', 'breakfast'))?.status, 'pending')
    })

    it('one settlement row per subject, date, and meal', async () => {
      const store = makeStore()
      const lunch = {
        subjectType: 'personal' as const,
        subjectId: 'u',
        date: '2026-11-13',
        meal: 'lunch' as const,
        outcome: 'fed' as const,
        hungerBefore: 4,
        hungerAfter: 3,
      }
      await store.saveSettlement(lunch)
      await store.saveSettlement({ ...lunch, meal: 'dinner', outcome: 'starved' })
      await store.saveSettlement({ ...lunch, hungerAfter: 2 })
      assert.equal((await store.getSettlement('u', '2026-11-13', 'lunch'))?.hungerAfter, 2)
      assert.equal((await store.getSettlement('u', '2026-11-13', 'dinner'))?.outcome, 'starved')
    })

    it('listRecords scopes to userId and date', async () => {
      const store = makeStore()
      await store.saveRecord(record({ userId: 'u1' }))
      await store.saveRecord(record({ userId: 'u1', date: '2026-11-14' }))
      await store.saveRecord(record({ userId: 'u2' }))
      const rows = await store.listRecords('u1', '2026-11-13')
      assert.equal(rows.length, 1)
      assert.equal(rows[0].userId, 'u1')
    })

    it('pending scan skips held and future jobs', async () => {
      const now = '2026-11-13T04:00:00.000Z'
      const store = makeStore()
      const base = { subjectType: 'personal' as const, subjectId: 'u', date: '2026-11-13' }
      await store.saveJob({ ...base, meal: 'breakfast', windowEndAt: now, status: 'pending' })
      await store.saveJob({ ...base, meal: 'lunch', windowEndAt: now, status: 'waiting_review' })
      await store.saveJob({
        ...base,
        meal: 'dinner',
        windowEndAt: '2026-11-13T05:00:00.000Z',
        status: 'pending',
      })
      const due = await store.listPendingJobs(now)
      assert.deepEqual(due.map((job) => job.meal), ['breakfast'])
    })

    it('lists held jobs only after the review deadline', async () => {
      const store = makeStore()
      await store.saveJob({
        subjectType: 'personal',
        subjectId: 'u',
        date: '2026-11-13',
        meal: 'lunch',
        windowEndAt: '2026-11-13T04:00:00.000Z',
        status: 'waiting_review',
      })
      assert.equal((await store.listHeldJobs('2026-11-13T05:00:00.000Z')).length, 0)
      assert.equal((await store.listHeldJobs('2026-11-13T06:00:00.000Z')).length, 1)
    })

    it('keeps one snack per start time and lists that day in order', async () => {
      const store = makeStore()
      const later = {
        userId: 'u',
        date: '2026-11-13',
        startedAt: '2026-11-13T06:00:00.000Z',
        photos: ['b'],
        photoReviews: ['pending' as const],
        hidden: false,
      }
      await store.saveSnack({ ...later, startedAt: '2026-11-13T05:00:00.000Z', photos: ['a'] })
      await store.saveSnack(later)
      await store.saveSnack({ ...later, photos: ['c'] })
      await store.saveSnack({ ...later, date: '2026-11-14', photos: ['d'] })
      const rows = await store.listSnacks('u', '2026-11-13')
      assert.deepEqual(rows.map((row) => row.photos[0]), ['a', 'c'])
      await store.deleteSnack('u', '2026-11-13', later.startedAt)
      assert.deepEqual((await store.listSnacks('u', '2026-11-13')).map((row) => row.startedAt), [
        '2026-11-13T05:00:00.000Z',
      ])
    })

    it('lists users and frozen jobs per subject', async () => {
      const store = makeStore()
      await store.saveUser(user({ userId: 'a' }))
      await store.saveUser(user({ userId: 'b' }))
      const base = { subjectType: 'personal' as const, date: '2026-11-13', windowEndAt: '2026-11-13T04:00:00.000Z' }
      await store.saveJob({ ...base, subjectId: 'a', meal: 'lunch', status: 'manual_review' })
      await store.saveJob({ ...base, subjectId: 'b', meal: 'lunch', status: 'pending' })
      assert.deepEqual((await store.listUserIds()).sort(), ['a', 'b'])
      assert.equal((await store.listFrozenJobs('a')).length, 1)
      assert.equal((await store.listFrozenJobs('b')).length, 0)
    })

    it('keeps one row per trace id', async () => {
      const store = makeStore()
      const trace = {
        traceId: 't',
        userId: 'u',
        date: '2026-11-13',
        photo: 'a',
        meal: 'lunch' as const,
        startedAt: null,
      }
      await store.saveTrace(trace)
      await store.saveTrace({ ...trace, photo: 'b' })
      assert.equal((await store.getTrace('t'))?.photo, 'b')
      assert.equal(await store.getTrace('missing'), null)
    })

    it('lists dates that have a meal or a snack', async () => {
      const store = makeStore()
      await store.saveUser(user())
      await store.saveRecord(record({ date: '2026-09-02' }))
      await store.saveSnack({
        userId: 'u',
        date: '2026-11-13',
        startedAt: '2026-11-13T05:30:00.000Z',
        photos: ['a'],
        photoReviews: ['pending'],
        hidden: false,
      })
      const dates = await store.listDates('u')
      assert.deepEqual(dates.slice().sort(), ['2026-09-02', '2026-11-13'])
    })

    it('lists a date that only has a settlement', async () => {
      const store = makeStore()
      await store.saveSettlement({
        subjectType: 'personal',
        subjectId: 'u',
        date: '2026-11-01',
        meal: 'breakfast',
        outcome: 'starved',
        hungerBefore: 4,
        hungerAfter: 5,
      })
      assert.deepEqual(await store.listDates('u'), ['2026-11-01'])
    })

    it('runExclusive runs the same subject one at a time', async () => {
      const store = makeStore()
      const order: string[] = []
      const slow = store.runExclusive('u', async () => {
        order.push('a-start')
        await new Promise((resolve) => setTimeout(resolve, 15))
        order.push('a-end')
      })
      const fast = store.runExclusive('u', async () => {
        order.push('b')
      })
      await Promise.all([slow, fast])
      assert.deepEqual(order, ['a-start', 'a-end', 'b'])
      await store.savePet(pet())
      assert.equal((await mustPet(store)).hunger, 4)
    })
  })
}
