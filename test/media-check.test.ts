import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { handle } from '../app/handle.ts'
import { handleReviewCallback, submitPhotos } from '../app/media-check.ts'
import { verifyWechatSignature } from '../adapters/cloud/wechat-media-check.ts'
import { record, seededStore } from './fixtures.ts'

const caller = { userId: 'u' }
const day = '2026-11-13'
const now = new Date('2026-11-13T04:10:00.000Z')

async function lunch(store: Awaited<ReturnType<typeof seededStore>>) {
  await store.saveJob({
    subjectType: 'personal',
    subjectId: 'u',
    date: day,
    meal: 'lunch',
    windowEndAt: '2026-11-13T06:00:00.000Z',
    status: 'pending',
  })
  await store.saveRecord(record({ photos: ['a', 'b'], photoReviews: ['pending', 'pending'] }))
}

describe('wechat media signature', () => {
  it('accepts the sha1 of token, timestamp, and nonce', () => {
    const ok = verifyWechatSignature('test-token', {
      signature: '834356fd38e2160f4ea80c935539c97f822b327a',
      timestamp: '1700000000',
      nonce: 'abc',
    })
    assert.equal(ok, true)
    assert.equal(verifyWechatSignature('', { signature: 'x', timestamp: '1', nonce: 'n' }), false)
    assert.equal(verifyWechatSignature('test-token', { signature: 'nope', timestamp: '1700000000', nonce: 'abc' }), false)
  })
})

describe('media check', () => {
  it('a callback fills in only the photo its trace id belongs to', async () => {
    const store = await seededStore()
    await lunch(store)
    const photos: string[] = []
    await submitPhotos(store, {
      submitMedia: async (photo) => {
        photos.push(photo)
        return { traceId: `trace-${photo}` }
      },
    }, caller, { date: day, meal: 'lunch' })
    assert.deepEqual(photos, ['a', 'b'])

    const result = await handleReviewCallback(
      { trace_id: 'trace-a', result: { suggest: 'pass' }, userId: 'other' },
      { store, now, verifySignature: () => true },
    )
    assert.equal(result.ok, true)
    const row = await store.getRecord('u', day, 'lunch')
    // 一张通过，整餐就通过。另一张还没回，仍是 pending。
    assert.deepEqual(row?.photoReviews, ['passed', 'pending'])
    assert.equal(row?.review, 'passed')
    assert.equal(await store.getUser('other'), null)
  })

  it('a callback with a bad signature is refused and changes nothing', async () => {
    const store = await seededStore()
    await lunch(store)
    await store.saveTrace({
      traceId: 'trace-a',
      userId: 'u',
      date: day,
      photo: 'a',
      meal: 'lunch',
      startedAt: null,
    })
    const result = await handleReviewCallback(
      { traceId: 'trace-a', suggest: 'risky' },
      { store, now, verifySignature: () => false },
    )
    assert.equal(result.ok, false)
    assert.deepEqual((await store.getRecord('u', day, 'lunch'))?.photoReviews, ['pending', 'pending'])
  })

  it('a late callback for a replaced photo is refused', async () => {
    const store = await seededStore()
    await lunch(store)
    await submitPhotos(store, {
      submitMedia: async (photo) => ({ traceId: `trace-${photo}` }),
    }, caller, { date: day, meal: 'lunch' })
    await store.saveRecord(record({ photos: ['new'], photoReviews: ['pending'], traceIds: [] }))
    const result = await handleReviewCallback(
      { traceId: 'trace-a', suggest: 'risky' },
      { store, now, verifySignature: () => true },
    )
    assert.equal(result.ok, false)
    const row = await store.getRecord('u', day, 'lunch')
    assert.deepEqual(row?.photos, ['new'])
    assert.deepEqual(row?.photoReviews, ['pending'])
    assert.equal(row?.review, 'pending')
  })

  it('keeps the check-in when a photo cannot be submitted', async () => {
    const store = await seededStore()
    const result = await handle(store, caller, now, {
      action: 'checkin',
      meal: 'lunch',
      photos: ['p1', 'p2'],
    }, {
      submitMedia: async (photo) => {
        if (photo === 'p2') throw new Error('down')
        return { traceId: 't1' }
      },
    })
    assert.equal(result.ok, true)
    const row = await store.getRecord('u', day, 'lunch')
    assert.deepEqual(row?.photos, ['p1', 'p2'])
    assert.deepEqual(row?.photoReviews, ['pending', 'pending'])
    assert.deepEqual(row?.traceIds, ['t1', ''])
  })

  it('submits a snack photo and reviews only that snack', async () => {
    const store = await seededStore()
    const at = new Date('2026-11-13T05:30:00.000Z')
    const result = await handle(store, caller, at, { action: 'snack', photos: ['s'] }, {
      submitMedia: async () => ({ traceId: 'trace-s' }),
    })
    assert.equal(result.ok, true)
    assert.deepEqual((await store.listSnacks('u', day))[0].traceIds, ['trace-s'])
    const reviewed = await handleReviewCallback(
      { traceId: 'trace-s', suggest: 'pass' },
      { store, now: at, verifySignature: () => true },
    )
    assert.equal(reviewed.ok, true)
    assert.deepEqual((await store.listSnacks('u', day))[0].photoReviews, ['passed'])
  })
})
