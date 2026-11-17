import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { handle, parseRequest, PAGE_ACTIONS } from '../app/handle.ts'
import { createMemoryStore } from '../adapters/memory/memory-store.ts'
import { seededStore } from './fixtures.ts'

const now = new Date('2026-11-13T04:10:00.000Z') // 上海 12:10，午餐窗口内

describe('platform-neutral entry', () => {
  it('ignores a user id in the request body and acts as the logged-in caller', async () => {
    const store = await seededStore({ userId: 'self' }, { userId: 'self' })
    await store.saveUser({ ...(await store.getUser('self'))!, userId: 'other' })
    const result = await handle(store, { userId: 'self' }, now, {
      action: 'exempt',
      userId: 'other',
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
      { action: 'checkin', meal: 'brunch', photos: ['a'] },
      { action: 'checkin', meal: 'lunch', photos: [] },
      { action: 'checkin', meal: 'lunch', photos: [1] },
      { action: 'exempt', meal: 'brunch' },
      { action: 'deleteCheckin', meal: 'lunch' },
      { action: 'saveMeals', clocks: { breakfast: '07:30' } },
      { action: 'sync' },
    ]) {
      assert.deepEqual(await handle(store, { userId: 'u' }, now, bad), { ok: false, error: 'bad_request' })
    }
    assert.deepEqual(await store.listRecords('u', '2026-11-13'), [])
  })

  it('runs the whole page flow through one function', async () => {
    const store = createMemoryStore()
    const who = { userId: 'u' }
    assert.deepEqual(await handle(store, who, now, { action: 'sync', timeZone: 'Asia/Shanghai' }), {
      ok: true,
      data: { created: true },
    })
    assert.equal((await handle(store, who, now, { action: 'adopt' })).ok, true)
    assert.equal((await handle(store, who, now, { action: 'checkin', meal: 'lunch', photos: ['a'] })).ok, true)
    const removed = await handle(store, who, now, {
      action: 'deleteCheckin',
      date: '2026-11-13',
      meal: 'lunch',
    })
    assert.deepEqual(removed, { ok: true, data: { effect: 'cancel' } })
  })

  it('accepts exactly the requests the mini program sends, with no date on check-in or staple', async () => {
    // 这些请求体和 miniprogram/pages 里 api.call 发出的一致。页面不传日期。
    const store = createMemoryStore()
    const who = { userId: 'u' }
    await handle(store, who, now, { action: 'sync', timeZone: 'Asia/Shanghai' })
    await handle(store, who, now, { action: 'adopt' })
    const sent = [
      { action: 'checkin', meal: 'lunch', photos: ['wxfile://tmp_a.jpg'] },
      { action: 'deleteCheckin', date: '2026-11-13', meal: 'lunch' },
      { action: 'exempt', meal: 'lunch' },
    ]
    for (const body of sent) {
      assert.equal((await handle(store, who, now, body)).ok, true, `${body.action} should be accepted`)
    }
  })

  it('takes the date from the user time zone, not from the client', async () => {
    const store = createMemoryStore()
    const who = { userId: 'u' }
    await handle(store, who, now, { action: 'sync', timeZone: 'Asia/Shanghai' })
    await handle(store, who, now, { action: 'adopt' })
    // 客户端想把打卡记到别的日子：多余的 date 字段会被丢掉，记录仍落在服务端算出的今天。
    const result = await handle(store, who, now, {
      action: 'checkin',
      date: '2026-01-01',
      meal: 'lunch',
      photos: ['a'],
    })
    assert.equal(result.ok, true)
    assert.notEqual(await store.getRecord('u', '2026-11-13', 'lunch'), null)
    assert.equal(await store.getRecord('u', '2026-01-01', 'lunch'), null)
  })

  it('answers no_user when the time zone was never synced', async () => {
    const store = createMemoryStore()
    const result = await handle(store, { userId: 'u' }, now, { action: 'checkin', meal: 'lunch', photos: ['a'] })
    assert.deepEqual(result, { ok: false, error: 'no_user' })
  })
})
