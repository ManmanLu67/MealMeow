import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyReview, runDueJobs } from '../app/settle.ts'
import { createMemoryStore } from '../app/store.ts'
import type { Store } from '../app/store.ts'

async function storeWithHeldLunch(end: Date, hunger: number): Promise<Store> {
  const store = createMemoryStore()
  await store.savePet({
    userId: 'u',
    hunger,
    alive: true,
    adoptedOn: '2026-11-01',
    endedOn: null,
    companyDays: 1,
    mealsEaten: 0,
  })
  await store.saveJob({
    subjectType: 'personal',
    subjectId: 'u',
    date: '2026-11-13',
    meal: 'lunch',
    windowEndAt: end.toISOString(),
    status: 'waiting_review',
  })
  await store.saveRecord({
    userId: 'u',
    date: '2026-11-13',
    meal: 'lunch',
    status: 'checked_in',
    checkinAt: end.toISOString(),
    photos: ['a'],
    review: 'pending',
    hidden: false,
  })
  return store
}

test('a missing record starves and a pending review freezes', async () => {
  const end = new Date('2026-11-13T04:00:00.000Z')
  const store = createMemoryStore()
  await store.savePet({ userId: 'u', hunger: 4, alive: true, adoptedOn: '2026-11-01', endedOn: null, companyDays: 1, mealsEaten: 0 })
  await store.saveJob({ subjectType: 'personal', subjectId: 'u', date: '2026-11-13', meal: 'breakfast', windowEndAt: end.toISOString(), status: 'pending' })
  await store.saveJob({ subjectType: 'personal', subjectId: 'u', date: '2026-11-13', meal: 'lunch', windowEndAt: end.toISOString(), status: 'pending' })
  await store.saveRecord({ userId: 'u', date: '2026-11-13', meal: 'lunch', status: 'checked_in', checkinAt: end.toISOString(), photos: ['a'], review: 'pending', hidden: false })
  const first = await runDueJobs(store, end)
  assert.equal((await store.getPet('u')).hunger, 5)
  assert.equal((await store.getJob('u', '2026-11-13', 'lunch')).status, 'waiting_review')
  const later = new Date(end.getTime() + 2 * 60 * 60 * 1000)
  await store.saveJob({ ...(await store.getJob('u', '2026-11-13', 'lunch')), status: 'pending' })
  await runDueJobs(store, later)
  assert.equal((await store.getPet('u')).hunger, 5)
  assert.equal((await store.getJob('u', '2026-11-13', 'lunch')).status, 'manual_review')
  assert.equal(first.settled, 1)
  assert.equal(first.frozen, 1)
})

test('a rejected check-in starves at settlement', async () => {
  const end = new Date('2026-11-13T04:00:00.000Z')
  const store = createMemoryStore()
  await store.savePet({
    userId: 'u',
    hunger: 8,
    alive: true,
    adoptedOn: '2026-11-01',
    endedOn: null,
    companyDays: 1,
    mealsEaten: 0,
  })
  await store.saveJob({
    subjectType: 'personal',
    subjectId: 'u',
    date: '2026-11-13',
    meal: 'breakfast',
    windowEndAt: end.toISOString(),
    status: 'pending',
  })
  await store.saveRecord({
    userId: 'u',
    date: '2026-11-13',
    meal: 'breakfast',
    status: 'checked_in',
    checkinAt: end.toISOString(),
    photos: ['a'],
    review: 'rejected',
    hidden: false,
  })
  await runDueJobs(store, end)
  assert.equal((await store.getPet('u'))!.hunger, 9)
  const settlement = await store.getSettlement('u', '2026-11-13', 'breakfast')
  assert.equal(settlement!.outcome, 'starved')
  assert.equal((await store.getJob('u', '2026-11-13', 'breakfast'))!.status, 'settled')
})

test('a pending job with an existing settlement only closes the job', async () => {
  const end = new Date('2026-11-13T04:00:00.000Z')
  const store = createMemoryStore()
  await store.savePet({
    userId: 'u',
    hunger: 6,
    alive: true,
    adoptedOn: '2026-11-01',
    endedOn: null,
    companyDays: 1,
    mealsEaten: 0,
  })
  await store.saveJob({
    subjectType: 'personal',
    subjectId: 'u',
    date: '2026-11-13',
    meal: 'breakfast',
    windowEndAt: end.toISOString(),
    status: 'pending',
  })
  await store.saveSettlement({
    subjectType: 'personal',
    subjectId: 'u',
    date: '2026-11-13',
    meal: 'breakfast',
    outcome: 'fed',
    hungerBefore: 6,
    hungerAfter: 5,
  })
  await runDueJobs(store, end)
  assert.equal((await store.getPet('u'))!.hunger, 6)
  const settlement = await store.getSettlement('u', '2026-11-13', 'breakfast')
  assert.equal(settlement!.hungerAfter, 5)
  assert.equal((await store.getJob('u', '2026-11-13', 'breakfast'))!.status, 'settled')
})

test('passing a review feeds once', async () => {
  const end = new Date('2026-11-13T04:00:00.000Z')
  const store = await storeWithHeldLunch(end, 8)
  await applyReview(store, { userId: 'u' }, { date: '2026-11-13', meal: 'lunch', review: 'passed' }, end)
  assert.equal((await store.getPet('u'))!.hunger, 5)
  const second = await applyReview(
    store,
    { userId: 'u' },
    { date: '2026-11-13', meal: 'lunch', review: 'passed' },
    end,
  )
  assert.equal(second.ok, false)
  assert.equal(second.ok === false ? second.error : null, 'already_settled')
  assert.equal((await store.getPet('u'))!.hunger, 5)
  assert.equal((await store.getSettlement('u', '2026-11-13', 'lunch'))!.outcome, 'fed')
})

test('rejecting a review starves once', async () => {
  const end = new Date('2026-11-13T04:00:00.000Z')
  const store = await storeWithHeldLunch(end, 8)
  await applyReview(store, { userId: 'u' }, { date: '2026-11-13', meal: 'lunch', review: 'rejected' }, end)
  assert.equal((await store.getPet('u'))!.hunger, 9)
  const second = await applyReview(
    store,
    { userId: 'u' },
    { date: '2026-11-13', meal: 'lunch', review: 'rejected' },
    end,
  )
  assert.equal(second.ok, false)
  assert.equal(second.ok === false ? second.error : null, 'already_settled')
  assert.equal((await store.getPet('u'))!.hunger, 9)
})
