import assert from 'node:assert/strict'
import { test } from 'node:test'
import { finishCheckin, removeCheckin, saveMeals, useStaple } from '../app/checkin.ts'
import { createMemoryStore } from '../app/store.ts'
import { MEALS, mealWindow } from '../domain/index.ts'

async function seeded(_now: Date) {
  const store = createMemoryStore()
  await store.saveUser({
    userId: 'u',
    nickname: '',
    timeZone: 'Asia/Shanghai',
    meals: { breakfast: '07:30', lunch: '12:00', dinner: '18:00' },
    pendingMeals: null,
    stapleLeft: 2,
    stapleMonth: '2026-11',
    cooldownUntil: null,
    adoptedOn: null,
    diedOn: null,
  })
  return store
}

const inLunchWindow = new Date('2026-11-13T04:10:00.000Z')

async function seededWithPet() {
  const store = await seeded(inLunchWindow)
  await store.savePet({
    userId: 'u',
    hunger: 6,
    alive: true,
    adoptedOn: '2026-11-01',
    endedOn: null,
    companyDays: 1,
    mealsEaten: 0,
  })
  return store
}

test('staple is exempt and delete before settlement removes the row', async () => {
  const store = await seededWithPet()
  const used = await useStaple(store, { userId: 'u' }, inLunchWindow, {
    date: '2026-11-13',
    meal: 'lunch',
  })
  assert.equal(used.ok && used.stapleLeft, 1)
  assert.equal((await store.getRecord('u', '2026-11-13', 'lunch'))?.status, 'exempt')
  assert.equal((await store.getPet('u'))?.hunger, 6)
  const removed = await removeCheckin(store, { userId: 'u' }, {
    date: '2026-11-13',
    meal: 'lunch',
  })
  assert.equal(removed.ok && removed.effect, 'cancel')
  assert.equal(await store.getRecord('u', '2026-11-13', 'lunch'), null)
})

test('remove after settlement hides photos but keeps the record', async () => {
  const store = await seededWithPet()
  await store.saveRecord({
    userId: 'u',
    date: '2026-11-13',
    meal: 'lunch',
    status: 'checked_in',
    review: 'approved',
    hidden: false,
    photos: ['main'],
    checkinAt: inLunchWindow.toISOString(),
  })
  await store.saveSettlement({
    subjectType: 'personal',
    subjectId: 'u',
    date: '2026-11-13',
    meal: 'lunch',
    outcome: 'fed',
    hungerBefore: 6,
    hungerAfter: 5,
  })
  const removed = await removeCheckin(store, { userId: 'u' }, {
    date: '2026-11-13',
    meal: 'lunch',
  })
  assert.equal(removed.ok && removed.effect, 'hide_photos')
  const record = await store.getRecord('u', '2026-11-13', 'lunch')
  assert.notEqual(record, null)
  assert.equal(record?.hidden, true)
  assert.deepEqual(record?.photos, ['main'])
})

test('second saveMeals on the same day refreshes pending job windows', async () => {
  const now = new Date('2026-11-13T00:00:00.000Z')
  const store = createMemoryStore()
  const originalMeals = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' }
  await store.saveUser({
    userId: 'u',
    nickname: '',
    timeZone: 'Asia/Shanghai',
    meals: originalMeals,
    pendingMeals: null,
    stapleLeft: 2,
    stapleMonth: '2026-11',
    cooldownUntil: null,
    adoptedOn: null,
    diedOn: null,
  })

  const first = { breakfast: '08:00', lunch: '12:00', dinner: '18:00' }
  const second = { breakfast: '09:00', lunch: '13:00', dinner: '19:00' }
  assert.equal((await saveMeals(store, { userId: 'u' }, now, first)).ok, true)
  assert.equal((await saveMeals(store, { userId: 'u' }, now, second)).ok, true)

  const user = await store.getUser('u')
  assert.deepEqual(user?.pendingMeals, { clocks: second, effectiveOn: '2026-11-14' })
  assert.deepEqual(user?.meals, originalMeals)

  for (const meal of MEALS) {
    const job = await store.getJob('u', '2026-11-14', meal)
    assert.equal(job?.status, 'pending')
    assert.equal(
      job?.windowEndAt,
      mealWindow('2026-11-14', second[meal], 'Asia/Shanghai').end.toISOString(),
    )
  }
})

test('second saveMeals does not change non-pending job windows', async () => {
  const now = new Date('2026-11-13T00:00:00.000Z')
  const store = createMemoryStore()
  await store.saveUser({
    userId: 'u',
    nickname: '',
    timeZone: 'Asia/Shanghai',
    meals: { breakfast: '07:30', lunch: '12:00', dinner: '18:00' },
    pendingMeals: null,
    stapleLeft: 2,
    stapleMonth: '2026-11',
    cooldownUntil: null,
    adoptedOn: null,
    diedOn: null,
  })

  await saveMeals(store, { userId: 'u' }, now, {
    breakfast: '08:00',
    lunch: '12:00',
    dinner: '18:00',
  })

  const lunchJobBefore = await store.getJob('u', '2026-11-14', 'lunch')
  assert.notEqual(lunchJobBefore, null)
  const frozenWindowEnd = '2099-01-01T00:00:00.000Z'
  await store.saveJob({ ...lunchJobBefore!, status: 'waiting_review', windowEndAt: frozenWindowEnd })

  await saveMeals(store, { userId: 'u' }, now, {
    breakfast: '09:00',
    lunch: '13:00',
    dinner: '19:00',
  })

  const lunchJobAfter = await store.getJob('u', '2026-11-14', 'lunch')
  assert.equal(lunchJobAfter?.status, 'waiting_review')
  assert.equal(lunchJobAfter?.windowEndAt, frozenWindowEnd)
})

test('meal changes start the next logical day', async () => {
  const now = new Date('2026-11-13T00:00:00.000Z') // 上海 08:00，逻辑日 11-13
  const store = createMemoryStore()
  await store.saveUser({
    userId: 'u',
    nickname: '',
    timeZone: 'Asia/Shanghai',
    meals: { breakfast: '07:30', lunch: '12:00', dinner: '18:00' },
    pendingMeals: null,
    stapleLeft: 2,
    stapleMonth: '2026-11',
    cooldownUntil: null,
    adoptedOn: null,
    diedOn: null,
  })
  const result = await saveMeals(store, { userId: 'u' }, now, {
    breakfast: '08:00',
    lunch: '12:00',
    dinner: '18:00',
  })
  assert.equal(result.ok && result.effectiveOn, '2026-11-14')
  assert.equal(await store.getJob('u', '2026-11-13', 'breakfast'), null)
  assert.equal((await store.getJob('u', '2026-11-14', 'breakfast'))?.status, 'pending')
})

test('finishing a check-in does not change hunger', async () => {
  const now = new Date('2026-11-13T04:10:00.000Z') // 上海 12:10，落在 12:00 的午餐窗口
  const store = await seeded(now)
  await store.savePet({
    userId: 'u',
    hunger: 6,
    alive: true,
    adoptedOn: '2026-11-01',
    endedOn: null,
    companyDays: 1,
    mealsEaten: 0,
  })
  const ok = await finishCheckin(store, { userId: 'u' }, now, {
    date: '2026-11-13',
    meal: 'lunch',
    photos: ['main', 'extra'],
  })
  assert.equal(ok.ok, true)
  assert.equal((await store.getPet('u')).hunger, 6)
  assert.equal((await store.getRecord('u', '2026-11-13', 'lunch')).review, 'pending')
  await assert.rejects(() =>
    finishCheckin(store, { userId: 'other' }, now, {
      date: '2026-11-13',
      meal: 'lunch',
      photos: ['x'],
    }),
  )
})
