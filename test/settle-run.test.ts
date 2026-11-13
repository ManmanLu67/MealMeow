import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runDueJobs } from '../app/settle.ts'
import { createMemoryStore } from '../app/store.ts'

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
