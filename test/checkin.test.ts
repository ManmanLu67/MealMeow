import assert from 'node:assert/strict'
import { test } from 'node:test'
import { saveMeals } from '../app/checkin.ts'
import { createMemoryStore } from '../app/store.ts'

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
