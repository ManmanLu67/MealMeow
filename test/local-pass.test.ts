import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { finishCheckin } from '../app/checkin.ts'
import { acceptPendingPhotos } from '../app/local-pass.ts'
import { recordSnack } from '../app/snack.ts'
import { runDueJobs } from '../app/settle.ts'
import { mustPet, seededStore } from './fixtures.ts'

const inside = new Date('2026-11-13T04:10:00.000Z')
const after = new Date('2026-11-13T05:00:00.000Z')

describe('accept pending photos', () => {
  it('marks today photos passed and feeds once the window has ended', async () => {
    const store = await seededStore({}, { hunger: 4 })
    const caller = { userId: 'u' }
    await finishCheckin(store, caller, inside, { date: '2026-11-13', meal: 'lunch', photos: ['p'] })
    await recordSnack(store, caller, inside, { photos: ['s'] })
    assert.equal((await store.getRecord('u', '2026-11-13', 'lunch'))?.review, 'pending')
    await acceptPendingPhotos(store, caller, inside)
    const meal = await store.getRecord('u', '2026-11-13', 'lunch')
    assert.equal(meal?.review, 'passed')
    assert.deepEqual(meal?.photoReviews, ['passed'])
    const snacks = await store.listSnacks('u', '2026-11-13')
    assert.deepEqual(snacks[0]?.photoReviews, ['passed'])
    await runDueJobs(store, after)
    assert.equal((await mustPet(store)).hunger, 2)
  })

  it('still feeds when acceptance happens after the window ended', async () => {
    const store = await seededStore({}, { hunger: 4 })
    const caller = { userId: 'u' }
    await finishCheckin(store, caller, inside, { date: '2026-11-13', meal: 'lunch', photos: ['p'] })
    await acceptPendingPhotos(store, caller, after)
    await runDueJobs(store, after)
    assert.equal((await store.getSettlement('u', '2026-11-13', 'lunch'))?.outcome, 'fed')
    assert.equal((await mustPet(store)).hunger, 2)
  })
})
