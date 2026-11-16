import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { finishCheckin } from '../app/checkin.ts'
import { adoptPet, applyReview, runDueJobs } from '../app/settle.ts'
import { createMemoryStore } from '../adapters/memory/memory-store.ts'
import type { Store } from '../app/ports.ts'
import { MEALS_DEFAULT, SH, mustPet, pet, record, seededStore, user } from './fixtures.ts'

const caller = { userId: 'u' }
const end = new Date('2026-11-13T04:00:00.000Z')
const later = new Date(end.getTime() + 2 * 60 * 60 * 1000)
const day = '2026-11-13'

async function job(
  store: Store,
  meal: 'breakfast' | 'lunch' | 'dinner',
  windowEndAt: Date,
  status: 'pending' | 'waiting_review' | 'manual_review' = 'pending',
) {
  // 扫描会给当天缺的任务补上。这里先把其余餐次占成已结算，只留要测的那一餐。
  for (const other of ['breakfast', 'lunch', 'dinner'] as const) {
    if (other !== meal && (await store.getJob('u', day, other)) === null) {
      await store.saveJob({
        subjectType: 'personal',
        subjectId: 'u',
        date: day,
        meal: other,
        windowEndAt: '2026-11-13T00:00:00.000Z',
        status: 'settled',
      })
    }
  }
  await store.saveJob({
    subjectType: 'personal',
    subjectId: 'u',
    date: day,
    meal,
    windowEndAt: windowEndAt.toISOString(),
    status,
  })
}

describe('settlement', () => {
  it('a missing record starves and a pending review freezes the whole pet', async () => {
    const store = await seededStore({}, { hunger: 4 })
    await job(store, 'breakfast', end)
    await job(store, 'lunch', end)
    await store.saveRecord(record({ meal: 'lunch' }))
    const first = await runDueJobs(store, end)
    // 早餐和午餐窗口同时结束。早餐排在前面，先按漏餐结算；午餐等审核，冻结。
    assert.equal((await mustPet(store)).hunger, 5)
    assert.equal((await store.getJob('u', day, 'lunch'))?.status, 'waiting_review')
    assert.equal(first.settled, 1)
    assert.equal(first.frozen, 1)

    await runDueJobs(store, later)
    assert.equal((await mustPet(store)).hunger, 5)
    assert.equal((await store.getJob('u', day, 'lunch'))?.status, 'manual_review')
  })

  it('does not settle other meals while one is waiting for review', async () => {
    const store = await seededStore({}, { hunger: 4 })
    // 早餐窗口 03:30 结束，审核截止 05:30，04:00 还在等。
    await job(store, 'breakfast', new Date('2026-11-13T03:30:00.000Z'))
    await job(store, 'lunch', end)
    await store.saveRecord(record({ meal: 'breakfast', checkinAt: '2026-11-13T03:00:00.000Z' }))
    await runDueJobs(store, end)
    assert.equal((await store.getJob('u', day, 'breakfast'))?.status, 'waiting_review')
    assert.equal((await store.getJob('u', day, 'lunch'))?.status, 'pending')
    assert.equal((await mustPet(store)).hunger, 4)
  })

  it('the result does not depend on the order the review arrives', async () => {
    async function run(reviewFirst: boolean): Promise<number> {
      const store = await seededStore({}, { hunger: 4 })
      await job(store, 'breakfast', new Date('2026-11-13T00:30:00.000Z'), 'waiting_review')
      await store.saveRecord(
        record({ meal: 'breakfast', checkinAt: '2026-11-13T00:00:00.000Z' }),
      )
      await job(store, 'lunch', end)
      if (reviewFirst) {
        await applyReview(store, caller, { date: day, meal: 'breakfast', photo: 'a', review: 'passed' }, end)
        await runDueJobs(store, end)
      } else {
        await runDueJobs(store, end)
        await applyReview(store, caller, { date: day, meal: 'breakfast', photo: 'a', review: 'passed' }, end)
      }
      return (await mustPet(store)).hunger
    }
    assert.equal(await run(true), await run(false))
  })

  it('a rejected check-in starves at settlement', async () => {
    const store = await seededStore({}, { hunger: 8 })
    await job(store, 'breakfast', end)
    await store.saveRecord(record({ meal: 'breakfast', review: 'rejected', photoReviews: ['rejected'] }))
    await runDueJobs(store, end)
    assert.equal((await mustPet(store)).hunger, 9)
    assert.equal((await store.getSettlement('u', day, 'breakfast'))?.outcome, 'starved')
  })

  it('a pending job with an existing settlement only closes the job', async () => {
    const store = await seededStore({}, { hunger: 6 })
    await job(store, 'breakfast', end)
    await store.saveSettlement({
      subjectType: 'personal',
      subjectId: 'u',
      date: day,
      meal: 'breakfast',
      outcome: 'fed',
      hungerBefore: 6,
      hungerAfter: 5,
    })
    await runDueJobs(store, end)
    assert.equal((await mustPet(store)).hunger, 6)
    assert.equal((await store.getJob('u', day, 'breakfast'))?.status, 'settled')
  })

  it('a staple settles as fed without any review', async () => {
    const store = await seededStore({}, { hunger: 7 })
    await job(store, 'lunch', end)
    await store.saveRecord(record({ status: 'exempt', photos: [], photoReviews: [], review: 'passed' }))
    await runDueJobs(store, end)
    assert.equal((await mustPet(store)).hunger, 5)
    assert.equal((await mustPet(store)).mealsEaten, 1)
  })
})

describe('death, cooldown, and adoption', () => {
  it('hunger 9 kills the pet, records the end day, and starts the cooldown', async () => {
    const store = await seededStore({ adoptedOn: '2026-11-01' }, { hunger: 8 })
    await job(store, 'breakfast', end)
    await runDueJobs(store, end)
    const dead = await mustPet(store)
    assert.equal(dead.alive, false)
    assert.equal(dead.endedOn, day)
    assert.equal(dead.companyDays, 13)
    const owner = await store.getUser('u')
    assert.equal(owner?.diedOn, day)
    assert.equal(owner?.cooldownUntil, '2026-11-19T20:00:00.000Z') // 11-13 起 7 个逻辑日，11-20 04:00 上海
  })

  it('a dead pet is not changed by later meals', async () => {
    const store = await seededStore({}, { hunger: 8 })
    await job(store, 'breakfast', end)
    await job(store, 'lunch', new Date(end.getTime() + 3_600_000))
    await runDueJobs(store, new Date(end.getTime() + 3_600_000))
    const dead = await mustPet(store)
    assert.equal(dead.alive, false)
    assert.equal(dead.hunger, 9)
    assert.equal((await store.getSettlement('u', day, 'lunch'))?.hungerAfter, 9)
  })

  it('cannot adopt while a pet lives or during the cooldown, and can after', async () => {
    const store = await seededStore({}, { hunger: 8 })
    assert.equal((await adoptPet(store, caller, end)).ok, false)
    await job(store, 'breakfast', end)
    await runDueJobs(store, end)
    const during = await adoptPet(store, caller, new Date('2026-11-19T19:59:00.000Z'))
    assert.equal(during.ok === false && during.error, '冷却中')
    const after = await adoptPet(store, caller, new Date('2026-11-19T20:00:00.000Z'))
    assert.equal(after.ok, true)
    const fresh = await mustPet(store)
    assert.equal(fresh.alive, true)
    assert.equal(fresh.hunger, 0)
    assert.equal(fresh.adoptedOn, '2026-11-20')
    assert.equal((await store.getUser('u'))?.diedOn, null)
  })

  it('meals that ended before adoption do not feed or starve the new pet', async () => {
    const store = await seededStore({}, null)
    await adoptPet(store, caller, new Date('2026-11-13T05:00:00.000Z'))
    await job(store, 'lunch', end) // 窗口 04:00 结束，早于领养时刻 05:00
    await runDueJobs(store, new Date('2026-11-13T06:00:00.000Z'))
    assert.equal((await mustPet(store)).hunger, 0)
    assert.equal((await store.getSettlement('u', day, 'lunch'))?.hungerAfter, 0)
  })
})

describe('review callbacks', () => {
  it('takes a result before the window ends, then settles when it ends', async () => {
    const store = await seededStore({}, { hunger: 8 })
    await job(store, 'lunch', end)
    await store.saveRecord(record())
    const early = new Date('2026-11-13T03:05:00.000Z')
    const got = await applyReview(store, caller, { date: day, meal: 'lunch', photo: 'a', review: 'passed' }, early)
    assert.equal(got.ok, true)
    assert.equal((await store.getRecord('u', day, 'lunch'))?.review, 'passed')
    assert.equal((await store.getJob('u', day, 'lunch'))?.status, 'pending')
    assert.equal((await mustPet(store)).hunger, 8)
    await runDueJobs(store, end)
    assert.equal((await mustPet(store)).hunger, 5)
    assert.equal((await store.getSettlement('u', day, 'lunch'))?.outcome, 'fed')
  })

  it('one passed photo feeds without waiting for the others', async () => {
    const store = await seededStore({}, { hunger: 4 })
    await job(store, 'lunch', end)
    await store.saveRecord(record({ photos: ['a', 'b'], photoReviews: ['pending', 'pending'] }))
    await applyReview(store, caller, { date: day, meal: 'lunch', photo: 'a', review: 'passed' }, end)
    assert.equal((await store.getRecord('u', day, 'lunch'))?.review, 'passed')
    await runDueJobs(store, end) // 第二张还没回，也照样结算
    assert.equal((await store.getSettlement('u', day, 'lunch'))?.outcome, 'fed')
    assert.equal((await mustPet(store)).hunger, 2)
  })

  it('a meal starves only when every photo is rejected, and waits while one is still out', async () => {
    const store = await seededStore({}, { hunger: 4 })
    await job(store, 'lunch', end)
    await store.saveRecord(record({ photos: ['a', 'b'], photoReviews: ['pending', 'pending'] }))
    await applyReview(store, caller, { date: day, meal: 'lunch', photo: 'a', review: 'rejected' }, end)
    assert.equal((await store.getRecord('u', day, 'lunch'))?.review, 'pending')
    await runDueJobs(store, end)
    assert.equal((await store.getJob('u', day, 'lunch'))?.status, 'waiting_review')
    await applyReview(store, caller, { date: day, meal: 'lunch', photo: 'b', review: 'rejected' }, end)
    assert.equal((await store.getSettlement('u', day, 'lunch'))?.outcome, 'starved')
    assert.equal((await mustPet(store)).hunger, 5)
  })

  it('a late result for a replaced photo is refused and does not touch the new one', async () => {
    const store = await seededStore({}, { hunger: 8 })
    await job(store, 'lunch', end)
    await store.saveRecord(record({ photos: ['new'], photoReviews: ['pending'] }))
    const late = await applyReview(
      store,
      caller,
      { date: day, meal: 'lunch', photo: 'old', review: 'rejected' },
      end,
    )
    assert.equal(late.ok === false && late.error, '照片已替换')
    assert.deepEqual((await store.getRecord('u', day, 'lunch'))?.photoReviews, ['pending'])
  })

  it('a held check-in settles once after review, and a repeat is refused', async () => {
    const store = await seededStore({}, { hunger: 8 })
    await job(store, 'lunch', end, 'waiting_review')
    await store.saveRecord(record())
    const input = { date: day, meal: 'lunch' as const, photo: 'a', review: 'passed' as const }
    await applyReview(store, caller, input, end)
    assert.equal((await mustPet(store)).hunger, 5)
    const again = await applyReview(store, caller, input, end)
    assert.equal(again.ok === false && again.error, 'already_settled')
    assert.equal((await mustPet(store)).hunger, 5)
  })

  it('end to end: check in, review passes before the window ends, pet is fed', async () => {
    const store = createMemoryStore()
    await store.saveUser(user({ meals: MEALS_DEFAULT }))
    await store.savePet(pet({ hunger: 8 }))
    // 前一天夜里的扫描已经补好了当天的任务，和线上一致。
    await runDueJobs(store, new Date('2026-11-12T20:00:00.000Z'))
    // 早餐已经在自己的窗口里打过卡并通过，只看午餐。
    await store.saveRecord(
      record({ meal: 'breakfast', checkinAt: '2026-11-12T23:30:00.000Z', review: 'passed', photoReviews: ['passed'] }),
    )
    const at = new Date('2026-11-13T03:05:00.000Z') // 上海 11:05，午餐窗口 11:00–13:00
    const made = await finishCheckin(store, caller, at, { date: day, meal: 'lunch', photos: ['p'] })
    assert.equal(made.ok, true)
    await applyReview(
      store,
      caller,
      { date: day, meal: 'lunch', photo: 'p', review: 'passed' },
      new Date(at.getTime() + 5000),
    )
    await runDueJobs(store, new Date('2026-11-13T05:00:00.000Z'))
    // 早餐通过 8→5，午餐通过 5→2。
    assert.equal((await mustPet(store)).hunger, 2)
    assert.equal((await store.getJob('u', day, 'lunch'))?.status, 'settled')
    assert.equal((await store.getJob('u', day, 'breakfast'))?.status, 'settled')
    assert.equal(SH, 'Asia/Shanghai')
  })
})

describe('concurrency', () => {
  it('two scans at once settle each meal once', async () => {
    const store = await seededStore({}, { hunger: 4 })
    await job(store, 'breakfast', new Date('2026-11-13T00:30:00.000Z'))
    await job(store, 'lunch', end)
    await Promise.all([runDueJobs(store, end), runDueJobs(store, end)])
    assert.equal((await mustPet(store)).hunger, 6)
  })

  it('a scan and a review at the same time give the serial result', async () => {
    const store = await seededStore({}, { hunger: 4 })
    await job(store, 'breakfast', new Date('2026-11-13T00:30:00.000Z'), 'manual_review')
    await store.saveRecord(record({ meal: 'breakfast', checkinAt: '2026-11-13T00:00:00.000Z' }))
    await job(store, 'lunch', end)
    await Promise.all([
      runDueJobs(store, end),
      applyReview(store, caller, { date: day, meal: 'breakfast', photo: 'a', review: 'passed' }, end),
    ])
    // 早餐通过 4→2，午餐漏餐 2→3。整体冻结后顺序固定，不会得 2。
    assert.equal((await mustPet(store)).hunger, 3)
  })
})
