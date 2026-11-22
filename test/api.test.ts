import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { describe, it } from 'node:test'
import { createMemoryStore } from '../adapters/memory/memory-store.ts'

const require = createRequire(import.meta.url)
const { handleApi } = require('../cloudfunctions/api/handle-api.js') as {
  handleApi: (
    event: unknown,
    deps: {
      userId: string
      now?: Date
      store?: ReturnType<typeof createMemoryStore>
      home?: (caller: { userId: string }) => Promise<{ ok: boolean }>
      syncUser?: (
        caller: { userId: string },
        now: Date,
        input: { timeZone: string },
      ) => Promise<{ ok: boolean }>
      applyReview?: () => Promise<{ ok: boolean }>
    },
  ) => Promise<{ ok: boolean; error?: string }>
}

describe('cloud api entry', () => {
  it('the event user id is ignored', async () => {
    let seen = ''
    const result = await handleApi(
      { action: 'home', userId: 'other' },
      { userId: 'self', home: async (caller) => { seen = caller.userId; return { ok: true } } },
    )
    assert.equal(result.ok, true)
    assert.equal(seen, 'self')
  })

  it('a page event cannot mark a review passed', async () => {
    let reviews = 0
    const result = await handleApi(
      { action: 'review', review: 'passed' },
      { userId: 'self', applyReview: async () => { reviews += 1; return { ok: true } } },
    )
    assert.equal(result.ok, false)
    assert.equal(reviews, 0)
  })

  it('sync passes the device time zone to syncUser', async () => {
    let zone = ''
    await handleApi(
      { action: 'sync', timeZone: 'Asia/Shanghai' },
      {
        userId: 'self',
        syncUser: async (_caller, _now, input) => { zone = input.timeZone; return { ok: true } },
      },
    )
    assert.equal(zone, 'Asia/Shanghai')
  })

  it('with a store, writes belong to the logged-in user', async () => {
    const store = createMemoryStore()
    const result = await handleApi(
      { action: 'sync', userId: 'other', timeZone: 'Asia/Shanghai' },
      { userId: 'self', store, now: new Date('2026-11-13T04:10:00.000Z') },
    )
    assert.equal(result.ok, true)
    assert.equal((await store.getUser('self'))?.timeZone, 'Asia/Shanghai')
    assert.equal(await store.getUser('other'), null)
  })
})
