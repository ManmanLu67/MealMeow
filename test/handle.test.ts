import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { handle, parseRequest, PAGE_ACTIONS } from '../app/handle.ts'
import { seededStore } from './fixtures.ts'

const now = new Date('2026-11-13T04:10:00.000Z')

describe('platform-neutral entry', () => {
  it('ignores a user id in the request body and acts as the logged-in caller', async () => {
    const store = await seededStore({ userId: 'self' }, { userId: 'self' })
    await store.saveUser({ ...(await store.getUser('self'))!, userId: 'other' })
    const result = await handle(store, { userId: 'self' }, now, {
      action: 'exempt',
      userId: 'other',
      date: '2026-11-13',
      meal: 'lunch',
    })
    assert.equal(result.ok, true)
    assert.notEqual(await store.getRecord('self', '2026-11-13', 'lunch'), null)
    assert.equal(await store.getRecord('other', '2026-11-13', 'lunch'), null)
  })

  it('has no page action that can write a review result', () => {
    assert.ok(!(PAGE_ACTIONS as readonly string[]).includes('review'))
    assert.equal(parseRequest({ action: 'review', review: 'passed' }), null)
    assert.equal(parseRequest({ action: 'applyReview' }), null)
  })

  it('rejects malformed input without touching the store', async () => {
    const store = await seededStore()
    for (const bad of [
      null,
      'sync',
      {},
      { action: 'checkin', date: '2026-11-13', meal: 'brunch', photos: ['a'] },
      { action: 'checkin', date: '2026-11-13', meal: 'lunch', photos: [] },
      { action: 'checkin', date: '2026-11-13', meal: 'lunch', photos: [1] },
      { action: 'saveMeals', clocks: { breakfast: '07:30' } },
      { action: 'sync' },
    ]) {
      assert.deepEqual(await handle(store, { userId: 'u' }, now, bad), { ok: false, error: 'bad_request' })
    }
    assert.deepEqual(await store.listRecords('u', '2026-11-13'), [])
  })

  it('runs the whole page flow through one function', async () => {
    const { createMemoryStore } = await import('../adapters/memory/memory-store.ts')
    const store = createMemoryStore()
    const who = { userId: 'u' }
    assert.deepEqual(await handle(store, who, now, { action: 'sync', timeZone: 'Asia/Shanghai' }), {
      ok: true,
      data: { created: true },
    })
    const adopted = await handle(store, who, now, { action: 'adopt' })
    assert.equal(adopted.ok, true)
    const done = await handle(store, who, now, {
      action: 'checkin',
      date: '2026-11-13',
      meal: 'lunch',
      photos: ['a'],
    })
    assert.equal(done.ok, true)
    const removed = await handle(store, who, now, {
      action: 'deleteCheckin',
      date: '2026-11-13',
      meal: 'lunch',
    })
    assert.deepEqual(removed, { ok: true, data: { effect: 'cancel' } })
  })
})
