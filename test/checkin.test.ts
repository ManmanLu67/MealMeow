import assert from 'node:assert/strict'
import { test } from 'node:test'
import { finishCheckin, saveMeals } from '../app/checkin.ts'
import { createMemoryStore } from '../app/store.ts'

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
