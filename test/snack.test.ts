import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { finishCheckin, removeCheckin, useStaple } from '../app/checkin.ts'
import { loadSatiety } from '../app/satiety.ts'
import { applySnackReview, recordSnack, removeSnack } from '../app/snack.ts'
import { homeView } from '../app/views.ts'
import { createMemoryStore } from '../adapters/memory/memory-store.ts'
import { MEALS_DEFAULT, record, seededStore } from './fixtures.ts'

const MEALS_LUNCH_930 = { ...MEALS_DEFAULT, lunch: '09:30' }

const caller = { userId: 'u' }
const day = '2026-11-13'

// 上海 12:10，午餐窗口 11:00–13:00 内。
const inWindow = new Date('2026-11-13T04:10:00.000Z')
// 上海 13:30，窗口外（下一餐晚餐 17:00–19:00）。
const outOfWindow = new Date('2026-11-13T05:30:00.000Z')

describe('record snack', () => {
  it('records a snack inside a meal window without replacing that meal', async () => {
    const store = await seededStore()
    const result = await recordSnack(store, caller, inWindow, { photos: ['p'] })
    assert.deepEqual(result, { ok: true, merged: false })
    const snacks = await store.listSnacks('u', day)
    assert.equal(snacks.length, 1)
    assert.deepEqual(snacks[0].photos, ['p'])
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

describe('satiety boosts and death at 200', () => {
  const day = '2026-11-13'
  const breakfastAt = new Date('2026-11-13T00:29:00.000Z') // 上海 08:29
  const stapleAt = new Date('2026-11-13T00:30:00.000Z') // 上海 08:30
  const lunch = { date: day, meal: 'lunch' as const }

  async function storeAfterBreakfast() {
    const store = await seededStore({ meals: MEALS_LUNCH_930 }, {})
    await finishCheckin(store, caller, breakfastAt, {
      date: day,
      meal: 'breakfast',
      photos: ['m'],
    })
    await useStaple(store, caller, stapleAt, lunch)
    return store
  }

  it('kills the pet after three snack boosts in the same hour', async () => {
    const store = await storeAfterBreakfast()
    const t1 = new Date(stapleAt.getTime() + 1_000)
    const t2 = new Date(stapleAt.getTime() + 2_000)
    const t3 = new Date(stapleAt.getTime() + 3_000)
    const t4 = new Date(stapleAt.getTime() + 4_000)
    assert.equal((await recordSnack(store, caller, t1, { photos: ['a'] })).ok, true)
    assert.equal((await recordSnack(store, caller, t2, { photos: ['b'] })).ok, true)
    assert.equal((await recordSnack(store, caller, t3, { photos: ['c'] })).ok, true)
    let pet = await store.getPet('u')
    assert.equal(pet?.alive, false)
    assert.notEqual((await store.getUser('u'))?.diedOn, null)
    const snacks = await store.listSnacks('u', day)
    assert.equal(snacks.length, 1)
    assert.equal(snacks[0].boosts?.length, 3)
    assert.deepEqual(snacks[0].photos, ['a', 'b', 'c'])

    assert.equal((await recordSnack(store, caller, t4, { photos: ['d'] })).ok, true)
    const after = (await store.listSnacks('u', day))[0]
    assert.equal(after.boosts?.length, 3)
    assert.deepEqual(after.photos, ['a', 'b', 'c', 'd'])
    pet = await store.getPet('u')
    assert.equal(pet?.alive, false)
  })

  it('raises satiety by 15 across four snacks more than an hour apart', async () => {
    const store = await seededStore()
    const times = [8, 10, 12, 14].map((hour) => new Date(Date.UTC(2026, 10, 13, hour - 8, 0, 0)))
    const photos = ['a', 'b', 'c', 'd']
    for (let i = 0; i < times.length; i += 1) {
      assert.equal((await recordSnack(store, caller, times[i], { photos: [photos[i]] })).ok, true)
    }
    const snacks = await store.listSnacks('u', day)
    assert.equal(snacks.length, 4)
    const boosts = snacks.flatMap((snack) => snack.boosts ?? [])
    assert.equal(boosts.length * 5, 15)
    const fourth = snacks.find((snack) => snack.startedAt === times[3].toISOString())
    assert.deepEqual(fourth?.photos, ['d'])
    assert.equal(fourth?.boosts, undefined)
    const user = await store.getUser('u')
    assert.ok(user)
    assert.equal((await loadSatiety(store, user, times[3])).satiety, 3)
  })

  it('does not kill on a fourth finish that adds no boost when satiety is already at 200', async () => {
    const store = await seededStore()
    const at = '2026-11-13T04:00:00.000Z'
    await store.saveRecord(record({
      date: day,
      meal: 'breakfast',
      status: 'checked_in',
      checkinAt: at,
      review: 'passed',
      photoReviews: ['passed'],
    }))
    await store.saveRecord(record({
      date: day,
      meal: 'lunch',
      status: 'exempt',
      checkinAt: at,
      photos: [],
      photoReviews: [],
      review: 'passed',
    }))
    await store.saveSnack({
      userId: 'u',
      date: day,
      startedAt: at,
      photos: ['a', 'b', 'c'],
      photoReviews: ['passed', 'passed', 'passed'],
      hidden: false,
      boosts: [1, 2, 3].map((n) => new Date(Date.parse(at) + n).toISOString()),
    })
    const now = new Date(Date.parse(at) + 4)
    const opened = await homeView(store, caller, now)
    assert.equal(opened.satietyText, '205%')
    assert.equal((await store.getPet('u'))?.alive, true)

    const fourth = await recordSnack(store, caller, now, { photos: ['d'] })
    assert.equal(fourth.ok, true)
    const snacks = await store.listSnacks('u', day)
    assert.equal(snacks.length, 1)
    assert.equal(snacks[0].boosts?.length, 3)
    assert.deepEqual(snacks[0].photos, ['a', 'b', 'c', 'd'])
    assert.equal((await store.getPet('u'))?.alive, true)
    assert.equal((await store.getUser('u'))?.diedOn, null)
  })

  it('records three boosts without a pet and does not throw', async () => {
    const store = await seededStore({ meals: MEALS_LUNCH_930 }, null)
    const base = new Date('2026-11-13T00:31:00.000Z')
    for (let i = 0; i < 3; i += 1) {
      const ok = await recordSnack(
        store,
        caller,
        new Date(base.getTime() + i * 60_000),
        { photos: [`p${i}`] },
      )
      assert.equal(ok.ok, true)
    }
    const snacks = await store.listSnacks('u', day)
    assert.equal(snacks.length, 1)
    assert.equal(snacks[0].boosts?.length, 3)
  })

  it('stays dead after removing the snack and staple that caused satiety death', async () => {
    const store = await storeAfterBreakfast()
    const t1 = new Date(stapleAt.getTime() + 1_000)
    const t2 = new Date(stapleAt.getTime() + 2_000)
    const t3 = new Date(stapleAt.getTime() + 3_000)
    await recordSnack(store, caller, t1, { photos: ['a'] })
    await recordSnack(store, caller, t2, { photos: ['b'] })
    await recordSnack(store, caller, t3, { photos: ['c'] })
    assert.equal((await store.getPet('u'))?.alive, false)
    const snack = (await store.listSnacks('u', day))[0]
    await removeSnack(store, caller, { date: day, startedAt: snack.startedAt })
    await removeCheckin(store, caller, stapleAt, lunch)
    assert.equal((await store.getPet('u'))?.alive, false)
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
