import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { finishCheckin, removeCheckin, saveMeals, useStaple } from '../app/checkin.ts'
import { recordSnack } from '../app/snack.ts'
import { runDueJobs } from '../app/settle.ts'
import { syncUser } from '../app/user.ts'
import { createMemoryStore } from '../adapters/memory/memory-store.ts'
import { MEALS, mealWindow, validateMealClocks } from '../domain/index.ts'
import { MEALS_DEFAULT, SH, mustPet, pet, record, seededStore, user } from './fixtures.ts'

const caller = { userId: 'u' }
const inLunchWindow = new Date('2026-11-13T04:10:00.000Z') // 上海 12:10
const lunch = { date: '2026-11-13', meal: 'lunch' as const }

describe('meal clocks', () => {
  it('starts the next logical day and creates tasks', async () => {
    const now = new Date('2026-11-13T00:00:00.000Z') // 上海 08:00
    const store = await seededStore({}, null)
    const result = await saveMeals(store, caller, now, { ...MEALS_DEFAULT, breakfast: '08:00' })
    assert.equal(result.ok && result.effectiveOn, '2026-11-14')
    assert.equal((await store.getJob('u', '2026-11-14', 'breakfast'))?.status, 'pending')
    assert.notEqual(await store.getJob('u', '2026-11-13', 'breakfast'), null)
  })

  it('a second change on the same day refreshes pending windows only', async () => {
    const now = new Date('2026-11-13T00:00:00.000Z')
    const store = await seededStore({}, null)
    const first = { breakfast: '08:00', lunch: '12:00', dinner: '18:00' }
    const second = { breakfast: '09:00', lunch: '13:00', dinner: '19:00' }
    await saveMeals(store, caller, now, first)
    const held = await store.getJob('u', '2026-11-14', 'lunch')
    await store.saveJob({ ...held!, status: 'waiting_review', windowEndAt: '2099-01-01T00:00:00.000Z' })
    await saveMeals(store, caller, now, second)

    const stored = await store.getUser('u')
    assert.deepEqual(stored?.pendingMeals, { clocks: second, effectiveOn: '2026-11-14' })
    assert.deepEqual(stored?.meals, MEALS_DEFAULT)
    for (const meal of ['breakfast', 'dinner'] as const) {
      const job = await store.getJob('u', '2026-11-14', meal)
      assert.equal(job?.windowEndAt, mealWindow('2026-11-14', second[meal], SH).end.toISOString())
    }
    const lunchJob = await store.getJob('u', '2026-11-14', 'lunch')
    assert.equal(lunchJob?.status, 'waiting_review')
    assert.equal(lunchJob?.windowEndAt, '2099-01-01T00:00:00.000Z')
  })

  it('changing clocks two days in a row keeps the first change', async () => {
    const a = { breakfast: '08:00', lunch: '13:00', dinner: '19:00' }
    const b = { breakfast: '09:00', lunch: '14:00', dinner: '20:00' }
    const store = await seededStore({}, pet())
    await saveMeals(store, caller, new Date('2026-11-13T02:00:00.000Z'), a)
    await saveMeals(store, caller, new Date('2026-11-14T01:00:00.000Z'), b)

    const stored = await store.getUser('u')
    assert.deepEqual(stored?.meals, a)
    assert.deepEqual(stored?.pendingMeals, { clocks: b, effectiveOn: '2026-11-15' })

    // 14 日仍按 A：13:30 在 13:00 午餐窗口内，任务窗口也一致。
    const probe = new Date('2026-11-14T05:30:00.000Z')
    const job = await store.getJob('u', '2026-11-14', 'lunch')
    assert.equal(job?.windowEndAt, mealWindow('2026-11-14', a.lunch, SH).end.toISOString())
    const done = await finishCheckin(store, caller, probe, {
      date: '2026-11-14',
      meal: 'lunch',
      photos: ['p'],
    })
    assert.equal(done.ok, true)
  })

  it('rejects clocks whose window would cross the 04:00 day line', () => {
    assert.match(
      validateMealClocks({ breakfast: '03:30', lunch: '12:00', dinner: '18:00' }) ?? '',
      /4 点/,
    )
    assert.equal(validateMealClocks({ breakfast: '05:00', lunch: '12:00', dinner: '18:00' }), null)
    assert.equal(validateMealClocks({ breakfast: '03:00', lunch: '12:00', dinner: '18:00' }), null)
    assert.match(
      validateMealClocks({ breakfast: '04:59', lunch: '12:00', dinner: '18:00' }) ?? '',
      /4 点/,
    )
  })
})

describe('tasks exist for every meal', () => {
  it('a user who never changed clocks still gets tasks, so a missed meal starves', async () => {
    const store = createMemoryStore()
    const now = new Date('2026-11-13T00:00:00.000Z')
    await syncUser(store, caller, now, { timeZone: SH })
    await store.savePet(pet({ hunger: 3 }))
    for (const day of ['2026-11-13', '2026-11-14']) {
      for (const meal of MEALS) assert.equal((await store.getJob('u', day, meal))?.status, 'pending')
    }
    await runDueJobs(store, new Date('2026-11-13T00:30:00.000Z')) // 早餐窗口 07:30 之后过了
    assert.equal((await mustPet(store)).hunger, 4)
  })

  it('syncUser creates the user from the device time zone and rejects bad zones', async () => {
    const store = createMemoryStore()
    const now = new Date('2026-11-13T02:00:00.000Z')
    const created = await syncUser(store, caller, now, { timeZone: 'America/New_York' })
    assert.equal(created.ok && created.created, true)
    assert.equal((await store.getUser('u'))?.timeZone, 'America/New_York')
    assert.deepEqual(await syncUser(store, caller, now, { timeZone: 'Not/AZone' }), {
      ok: false,
      error: 'tz_name:Not/AZone',
    })
    assert.equal((await syncUser(store, caller, now, { timeZone: '' })).error, 'tz_empty')
    assert.equal((await syncUser(store, caller, now, { timeZone: 'UTC+5:45' })).error, 'tz_offset:UTC+5:45')
    const moved = await syncUser(store, caller, now, { timeZone: SH })
    assert.equal(moved.ok && moved.created, false)
    assert.equal((await store.getUser('u'))?.timeZone, SH)
    const windows = await syncUser(store, { userId: 'win' }, now, { timeZone: '中国标准时间', nickname: '阿喵' })
    assert.equal(windows.ok, true)
    assert.equal((await store.getUser('win'))?.timeZone, SH)
    const offset = await syncUser(store, { userId: 'off' }, now, { timeZone: 'UTC+8', nickname: '阿喵' })
    assert.equal(offset.ok, true)
    assert.equal((await store.getUser('off'))?.timeZone, SH)
  })
})

describe('check-in', () => {
  it('does not change hunger, starts review pending, and rejects other users', async () => {
    const store = await seededStore({}, { hunger: 6 })
    const ok = await finishCheckin(store, caller, inLunchWindow, { ...lunch, photos: ['main', 'extra'] })
    assert.equal(ok.ok, true)
    assert.equal((await mustPet(store)).hunger, 6)
    const row = await store.getRecord('u', lunch.date, 'lunch')
    assert.equal(row?.review, 'pending')
    assert.deepEqual(row?.photoReviews, ['pending', 'pending'])
    await assert.rejects(() =>
      finishCheckin(store, { userId: 'other' }, inLunchWindow, { ...lunch, photos: ['x'] }),
    )
  })

  it('replacing photos resets review to pending', async () => {
    const store = await seededStore({}, {})
    await finishCheckin(store, caller, inLunchWindow, { ...lunch, photos: ['p1'] })
    await store.saveRecord({
      ...(await store.getRecord('u', lunch.date, 'lunch'))!,
      photoReviews: ['passed'],
      review: 'passed',
    })
    await finishCheckin(store, caller, new Date(inLunchWindow.getTime() + 60_000), {
      ...lunch,
      photos: ['p2'],
    })
    const row = await store.getRecord('u', lunch.date, 'lunch')
    assert.equal(row?.review, 'pending')
    assert.deepEqual(row?.photoReviews, ['pending'])
  })

  it('refuses to overwrite a staple record', async () => {
    const store = await seededStore({}, {})
    await useStaple(store, caller, inLunchWindow, lunch)
    const result = await finishCheckin(store, caller, inLunchWindow, { ...lunch, photos: ['p'] })
    assert.equal(result.ok, false)
    assert.equal((await store.getRecord('u', lunch.date, 'lunch'))?.status, 'exempt')
    assert.equal((await store.getUser('u'))?.stapleLeft, 1)
  })
})

describe('staple and delete', () => {
  it('staple is exempt, delete before settlement removes it and refunds the quota', async () => {
    const store = await seededStore({}, { hunger: 6 })
    const used = await useStaple(store, caller, inLunchWindow, lunch)
    assert.equal(used.ok && used.stapleLeft, 1)
    assert.equal((await store.getRecord('u', lunch.date, 'lunch'))?.status, 'exempt')
    assert.equal((await mustPet(store)).hunger, 6)

    const removed = await removeCheckin(store, caller, inLunchWindow, lunch)
    assert.equal(removed.ok && removed.effect, 'cancel')
    assert.equal(await store.getRecord('u', lunch.date, 'lunch'), null)
    assert.equal((await store.getUser('u'))?.stapleLeft, 2)
  })

  it('remove after settlement hides photos, keeps the record, and keeps the staple spent', async () => {
    const store = await seededStore({}, {})
    await store.saveRecord(record({ review: 'passed', photoReviews: ['passed'], photos: ['main'] }))
    await store.saveSettlement({
      subjectType: 'personal',
      subjectId: 'u',
      date: lunch.date,
      meal: 'lunch',
      outcome: 'fed',
      hungerBefore: 6,
      hungerAfter: 5,
    })
    const removed = await removeCheckin(store, caller, inLunchWindow, lunch)
    assert.equal(removed.ok && removed.effect, 'hide_photos')
    const row = await store.getRecord('u', lunch.date, 'lunch')
    assert.equal(row?.hidden, true)
    assert.deepEqual(row?.photos, ['main'])
  })

  it('deleting a check-in held for review lets the meal settle as missed', async () => {
    const store = await seededStore({}, { hunger: 4 })
    await saveMeals(store, caller, new Date('2026-11-13T02:00:00.000Z'), MEALS_DEFAULT)
    const at = new Date('2026-11-14T04:00:00.000Z') // 14 日 12:00
    await finishCheckin(store, caller, at, { date: '2026-11-14', meal: 'lunch', photos: ['p'] })
    await runDueJobs(store, new Date('2026-11-14T05:00:00.000Z'))
    assert.equal((await store.getJob('u', '2026-11-14', 'lunch'))?.status, 'waiting_review')

    const removed = await removeCheckin(store, caller, new Date('2026-11-14T05:10:00.000Z'), {
      date: '2026-11-14',
      meal: 'lunch',
    })
    assert.equal(removed.ok, true)
    const settlement = await store.getSettlement('u', '2026-11-14', 'lunch')
    assert.equal(settlement?.outcome, 'starved')
    assert.equal((await store.getJob('u', '2026-11-14', 'lunch'))?.status, 'settled')
  })

  it('staple needs a living pet', async () => {
    const store = await seededStore({}, null)
    const result = await useStaple(store, caller, inLunchWindow, lunch)
    assert.equal(result.ok, false)
    assert.equal(result.ok === false && result.error, '没有存活宠物')
    assert.equal((await store.getUser('u'))?.stapleLeft, user().stapleLeft)
  })

  it('staple alone without a meal does not kill the pet below 200 satiety', async () => {
    const meals = { ...MEALS_DEFAULT, lunch: '09:30' }
    const stapleAt = new Date('2026-11-13T00:30:00.000Z') // 上海 08:30，午餐窗口内
    const store = await seededStore({ meals }, {})
    const used = await useStaple(store, caller, stapleAt, { date: '2026-11-13', meal: 'lunch' })
    assert.equal(used.ok, true)
    assert.equal((await mustPet(store)).alive, true)
    assert.equal((await store.getUser('u'))?.diedOn, null)
  })

  it('kills when this staple crosses 200 and leaves a pet that is already there', async () => {
    const meals = { ...MEALS_DEFAULT, lunch: '09:30' }
    const breakfastAt = new Date('2026-11-13T00:29:00.000Z')
    const crossing = await seededStore({ meals }, {})
    await finishCheckin(crossing, caller, breakfastAt, {
      date: '2026-11-13',
      meal: 'breakfast',
      photos: ['m'],
    })
    await recordSnack(crossing, caller, new Date(breakfastAt.getTime() + 1_000), { photos: ['a'] })
    await recordSnack(crossing, caller, new Date(breakfastAt.getTime() + 2_000), { photos: ['b'] })
    await recordSnack(crossing, caller, new Date(breakfastAt.getTime() + 3_000), { photos: ['c'] })
    const stapleAt = new Date('2026-11-13T00:30:00.000Z')
    const used = await useStaple(crossing, caller, stapleAt, { date: '2026-11-13', meal: 'lunch' })
    assert.equal(used.ok, true)
    assert.equal((await mustPet(crossing)).alive, false)

    const already = await seededStore()
    const at = '2026-11-13T10:00:00.000Z'
    await already.saveRecord(record({
      date: '2026-11-13',
      meal: 'breakfast',
      status: 'checked_in',
      checkinAt: at,
      review: 'passed',
      photoReviews: ['passed'],
    }))
    await already.saveRecord(record({
      date: '2026-11-13',
      meal: 'lunch',
      status: 'exempt',
      checkinAt: new Date(Date.parse(at) + 1).toISOString(),
      photos: [],
      photoReviews: [],
      review: 'passed',
    }))
    await already.saveSnack({
      userId: 'u',
      date: '2026-11-13',
      startedAt: new Date(Date.parse(at) + 2).toISOString(),
      photos: ['s'],
      photoReviews: ['passed'],
      hidden: false,
      boosts: [2, 3].map((n) => new Date(Date.parse(at) + n).toISOString()),
    })
    const held = await useStaple(already, caller, new Date(Date.parse(at) + 10), {
      date: '2026-11-13',
      meal: 'dinner',
    })
    assert.equal(held.ok, true)
    assert.equal((await mustPet(already)).alive, true)
    assert.equal((await already.getUser('u'))?.diedOn, null)
  })
})
