import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applySnackReview, recordSnack, removeSnack } from '../app/snack.ts'
import { createMemoryStore } from '../adapters/memory/memory-store.ts'
import { seededStore } from './fixtures.ts'

const caller = { userId: 'u' }
const day = '2026-11-13'

// 上海 12:10，午餐窗口 11:00–13:00 内。
const inWindow = new Date('2026-11-13T04:10:00.000Z')
// 上海 13:30，窗口外（下一餐晚餐 17:00–19:00）。
const outOfWindow = new Date('2026-11-13T05:30:00.000Z')

describe('record snack', () => {
  it('rejects a snack inside a meal window', async () => {
    const store = await seededStore()
    const result = await recordSnack(store, caller, inWindow, { photos: ['p'] })
    assert.equal(result.ok, false)
    assert.equal(result.ok === false && result.error, '现在在打卡窗口内，请直接打这一餐')
    assert.deepEqual(await store.listSnacks('u', day), [])
  })

  it('creates a snack outside the window with photos pending review', async () => {
    const store = await seededStore()
    const result = await recordSnack(store, caller, outOfWindow, { photos: ['a', 'b'] })
    assert.deepEqual(result, { ok: true, merged: false })
    const snacks = await store.listSnacks('u', day)
    assert.equal(snacks.length, 1)
    assert.equal(snacks[0].date, day)
    assert.deepEqual(snacks[0].photos, ['a', 'b'])
    assert.deepEqual(snacks[0].photoReviews, ['pending', 'pending'])
  })

  it('merges a second snack within one hour into the first', async () => {
    const store = await seededStore()
    await recordSnack(store, caller, outOfWindow, { photos: ['a'] })
    const second = await recordSnack(
      store,
      caller,
      new Date(outOfWindow.getTime() + 30 * 60 * 1000),
      { photos: ['b'] },
    )
    assert.deepEqual(second, { ok: true, merged: true })
    const snacks = await store.listSnacks('u', day)
    assert.equal(snacks.length, 1)
    assert.deepEqual(snacks[0].photos, ['a', 'b'])
    assert.deepEqual(snacks[0].photoReviews, ['pending', 'pending'])
  })

  it('opens a new snack once the anchor is an hour old', async () => {
    const store = await seededStore()
    await recordSnack(store, caller, outOfWindow, { photos: ['a'] })
    const second = await recordSnack(
      store,
      caller,
      new Date(outOfWindow.getTime() + 60 * 60 * 1000),
      { photos: ['b'] },
    )
    assert.deepEqual(second, { ok: true, merged: false })
    assert.equal((await store.listSnacks('u', day)).length, 2)
  })

  it('refuses empty photos', async () => {
    const store = await seededStore()
    const result = await recordSnack(store, caller, outOfWindow, { photos: [] })
    assert.equal(result.ok, false)
    assert.equal(result.ok === false && result.error, '需要照片')
  })
})

describe('remove and review snacks', () => {
  async function withSnack(photos = ['a']): Promise<ReturnType<typeof createMemoryStore>> {
    const store = await seededStore()
    await recordSnack(store, caller, outOfWindow, { photos })
    return store
  }

  it('removes a snack and refuses a missing one', async () => {
    const store = await withSnack()
    const removed = await removeSnack(store, caller, { date: day, startedAt: outOfWindow.toISOString() })
    assert.deepEqual(removed, { ok: true })
    assert.deepEqual(await store.listSnacks('u', day), [])

    const again = await removeSnack(store, caller, { date: day, startedAt: outOfWindow.toISOString() })
    assert.equal(again.ok, false)
    assert.equal(again.ok === false && again.error, '无这份零食')
  })

  it('maps a review by photo id and refuses a replaced photo', async () => {
    const store = await withSnack(['a', 'b'])
    const got = await applySnackReview(store, caller, {
      date: day,
      startedAt: outOfWindow.toISOString(),
      photo: 'b',
      review: 'passed',
    })
    assert.deepEqual(got, { ok: true })
    assert.deepEqual((await store.listSnacks('u', day))[0].photoReviews, ['pending', 'passed'])

    const late = await applySnackReview(store, caller, {
      date: day,
      startedAt: outOfWindow.toISOString(),
      photo: 'old',
      review: 'rejected',
    })
    assert.equal(late.ok, false)
    assert.equal(late.ok === false && late.error, '照片已替换')
  })
})
