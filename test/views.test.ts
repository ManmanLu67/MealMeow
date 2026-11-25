import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Store } from '../app/ports.ts'
import { adoptView, galleryView, homeView, meView, memorialView } from '../app/views.ts'
import { MEALS } from '../domain/index.ts'
import { record, seededStore } from './fixtures.ts'

async function markComplete(store: Store, dates: readonly string[]): Promise<void> {
  for (const date of dates) {
    for (const meal of MEALS) {
      await store.saveRecord(record({ date, meal, review: 'passed', photoReviews: ['passed'] }))
    }
  }
}

describe('home view', () => {
  it('starts at 0% hunger and full health before any meal', async () => {
    const now = new Date('2026-11-13T04:10:00.000Z')
    const bare = await seededStore({}, null)
    const empty = await homeView(bare, { userId: 'u' }, now)
    assert.equal(empty.petView, 'pasture')
    assert.equal(empty.hungerText, '0%')
    assert.equal(empty.healthText, '100')
    assert.equal(empty.levelText, '')

    const adopted = await seededStore({}, { hunger: 0 })
    const fresh = await homeView(adopted, { userId: 'u' }, now)
    assert.equal(fresh.hungerText, '0%')
    assert.equal(fresh.healthText, '100')
    assert.equal(fresh.levelText, '0')
  })

  it('a pending review is not a badge and does not change the band', async () => {
    const now = new Date('2026-11-13T04:10:00.000Z')
    const store = await seededStore({}, { hunger: 6 })
    await store.saveRecord(record({
      date: '2026-11-13',
      meal: 'lunch',
      status: 'checked_in',
      checkinAt: now.toISOString(),
      photos: ['a'],
      photoReviews: ['pending'],
      review: 'pending',
      hidden: false,
    }))
    const view = await homeView(store, { userId: 'u' }, now)
    assert.equal(view.badge, false)
    assert.equal(view.bandText, '濒危')
    assert.equal(view.petView, 'living')
    assert.equal(view.dateLabel, '11月13日 周五')
    assert.equal(view.petName, '小饭')
    assert.equal(view.chips[0].name, '早餐')
    assert.equal(view.chips[0].time, '07:30')
    assert.equal(view.chips[1].name, '午餐')
    assert.equal(view.hungerText, '0%')
    assert.equal(view.healthText, '33')
    assert.equal(view.levelText, '0')
    assert.equal(view.emotion, '饱足')
  })

  it('keeps today\'s checked-in photo on the home page', async () => {
    const now = new Date('2026-11-13T04:10:00.000Z')
    const store = await seededStore()
    await store.saveRecord(record({
      date: '2026-11-13',
      meal: 'breakfast',
      status: 'checked_in',
      photos: ['morning'],
      photoReviews: ['passed'],
      review: 'passed',
    }))
    const view = await homeView(store, { userId: 'u' }, now)
    assert.deepEqual(view.photos, [{ meal: 'breakfast', src: 'morning' }])
    assert.equal(view.species, 'cat')
  })

  it('keeps hunger at 100% after a missed meal until the next check-in', async () => {
    const store = await seededStore()
    await store.saveRecord(record({
      date: '2026-11-13',
      meal: 'breakfast',
      status: 'checked_in',
      checkinAt: '2026-11-12T23:30:00.000Z',
      review: 'passed',
      photoReviews: ['passed'],
    }))
    const later = await homeView(store, { userId: 'u' }, new Date('2026-11-16T02:00:00.000Z'))
    assert.equal(later.hungerText, '100%')
  })

  it('lists today\'s hunger and health changes on the status sheet', async () => {
    const now = new Date('2026-11-13T04:10:00.000Z')
    const store = await seededStore({}, { hunger: 1 })
    await store.saveRecord(record({
      date: '2026-11-13',
      meal: 'lunch',
      status: 'checked_in',
      checkinAt: now.toISOString(),
      review: 'passed',
      photoReviews: ['passed'],
    }))
    await store.saveSettlement({
      subjectType: 'personal',
      subjectId: 'u',
      date: '2026-11-13',
      meal: 'breakfast',
      outcome: 'starved',
      hungerBefore: 0,
      hungerAfter: 1,
    })
    const view = await homeView(store, { userId: 'u' }, now)
    assert.ok(view.statChanges.some((line) => line.includes('午餐打卡后') && line.includes('现在的 0%')))
    assert.ok(view.statChanges.some((line) => line.includes('早餐漏餐') && line.includes('漏了 0 餐，变成 1 餐') && line.includes('健康 100 → 89')))
  })

  it('lets a staple fall to 10% and rise again toward the next meal', async () => {
    const store = await seededStore()
    await store.saveRecord(record({
      date: '2026-11-13',
      meal: 'lunch',
      status: 'exempt',
      checkinAt: '2026-11-13T04:00:00.000Z',
      photos: [],
      photoReviews: [],
      review: 'passed',
    }))
    const used = await homeView(store, { userId: 'u' }, new Date('2026-11-13T04:00:00.000Z'))
    assert.equal(used.hungerText, '10%')
    const dinner = await homeView(store, { userId: 'u' }, new Date('2026-11-13T10:00:00.000Z'))
    assert.equal(dinner.hungerText, '100%')
  })

  it('puts a full bowl on a check-in and lets it empty by the next meal', async () => {
    const checked = new Date('2026-11-13T04:00:00.000Z')
    const store = await seededStore()
    await store.saveRecord(record({
      date: '2026-11-13',
      meal: 'lunch',
      status: 'checked_in',
      checkinAt: checked.toISOString(),
    }))
    const full = await homeView(store, { userId: 'u' }, checked)
    assert.equal(full.bowlFill, 100)
    const mid = await homeView(store, { userId: 'u' }, new Date('2026-11-13T07:00:00.000Z'))
    assert.equal(mid.bowlFill, 50)
    const gone = await homeView(store, { userId: 'u' }, new Date('2026-11-13T10:00:00.000Z'))
    assert.equal(gone.bowlFill, 0)
  })

  it('does not put meatballs in for a staple or a snack', async () => {
    const now = new Date('2026-11-13T04:10:00.000Z')
    const store = await seededStore()
    await store.saveRecord(record({
      date: '2026-11-13',
      meal: 'lunch',
      status: 'exempt',
      checkinAt: now.toISOString(),
      photos: [],
      photoReviews: [],
    }))
    await store.saveSnack({
      userId: 'u',
      date: '2026-11-13',
      startedAt: now.toISOString(),
      photos: ['snack'],
      photoReviews: ['passed'],
      hidden: false,
    })
    const view = await homeView(store, { userId: 'u' }, now)
    assert.equal(view.bowlFill, 0)
  })
})

describe('gallery and adoption', () => {
  it('check-in-first streak subtracts the pet days after death', async () => {
    const store = await seededStore(
      { adoptedOn: '2026-11-12', diedOn: '2026-11-12', cooldownUntil: '2026-11-18T20:00:00.000Z' },
      { alive: false, hunger: 9, adoptedOn: '2026-11-12', endedOn: '2026-11-12' },
    )
    await markComplete(store, ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'])
    const now = new Date('2026-11-13T15:00:00.000Z')
    const view = await galleryView(store, { userId: 'u' }, now)
    assert.equal(view.streak, 3)
    const adopt = await adoptView(store, { userId: 'u' }, now)
    assert.equal(adopt.canAdopt, false)
  })

  it('the streak does not drop to 0 before today is over', async () => {
    const store = await seededStore({}, { hunger: 0 })
    await markComplete(store, ['2026-11-10', '2026-11-11', '2026-11-12'])
    // 上海 11 月 13 日 06:00，早餐窗口还没开始。昨天的连续天数还在。
    const view = await galleryView(store, { userId: 'u' }, new Date('2026-11-12T22:00:00.000Z'))
    assert.equal(view.streak, 3)
  })

  it('only photos that were not rejected are shown', async () => {
    const store = await seededStore()
    await store.saveRecord(record({
      date: '2026-11-13',
      meal: 'lunch',
      photos: ['bad', 'good'],
      photoReviews: ['rejected', 'passed'],
      review: 'passed',
    }))
    const view = await galleryView(store, { userId: 'u' }, new Date('2026-11-13T15:00:00.000Z'))
    const lunch = view.meals.find((meal) => meal.meal === 'lunch')
    assert.equal(lunch?.photo, 'good')
    assert.equal(lunch?.exempt, false)
    assert.equal(view.days[0].key, '2026-11-09')
    assert.equal(view.days[view.todayIndex].key, '2026-11-13')
  })

  it('a living pet cannot be adopted over', async () => {
    const store = await seededStore({}, { hunger: 0 })
    const view = await adoptView(store, { userId: 'u' }, new Date('2026-11-13T15:00:00.000Z'))
    assert.equal(view.canAdopt, false)
    assert.equal(view.cooldownDays, 0)
  })

  it('a staple slot has no photo', async () => {
    const store = await seededStore()
    await store.saveRecord(record({
      date: '2026-11-13',
      meal: 'breakfast',
      status: 'exempt',
      photos: [],
      photoReviews: [],
      review: 'passed',
    }))
    const view = await galleryView(store, { userId: 'u' }, new Date('2026-11-13T15:00:00.000Z'))
    const breakfast = view.meals.find((meal) => meal.meal === 'breakfast')
    assert.equal(breakfast?.photo, null)
    assert.equal(breakfast?.exempt, true)
  })

  it('a hidden record is absent from the three slots', async () => {
    const store = await seededStore()
    await store.saveRecord(record({
      date: '2026-11-13',
      meal: 'dinner',
      photos: ['secret'],
      photoReviews: ['passed'],
      review: 'passed',
      hidden: true,
    }))
    const view = await galleryView(store, { userId: 'u' }, new Date('2026-11-13T15:00:00.000Z'))
    const dinner = view.meals.find((meal) => meal.meal === 'dinner')
    assert.equal(dinner?.photo, null)
    assert.equal(dinner?.exempt, false)
  })

  it('a second living pet does not count the previous pet days', async () => {
    const store = await seededStore(
      {
        adoptedOn: '2026-11-12',
        diedOn: null,
        pastPets: [{ adoptedOn: '2026-11-10', diedOn: '2026-11-11' }],
      },
      { hunger: 0, adoptedOn: '2026-11-12' },
    )
    await markComplete(store, ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'])
    const view = await galleryView(store, { userId: 'u' }, new Date('2026-11-13T15:00:00.000Z'))
    assert.equal(view.streak, 2)
  })

  it('snacks stay on their own row and do not extend the streak', async () => {
    const store = await seededStore({}, { hunger: 0 })
    await store.saveSnack({
      userId: 'u',
      date: '2026-11-13',
      startedAt: '2026-11-13T06:00:00.000Z',
      photos: ['snack-a', 'snack-b'],
      photoReviews: ['rejected', 'passed'],
      hidden: false,
    })
    const view = await galleryView(store, { userId: 'u' }, new Date('2026-11-13T15:00:00.000Z'))
    assert.equal(view.streak, 0)
    assert.deepEqual(view.snacks, [
      { startedAt: '2026-11-13T06:00:00.000Z', photo: 'snack-b', count: 1 },
    ])
  })

  it('shows the meals of a chosen day without moving the streak', async () => {
    const store = await seededStore({}, { hunger: 0 })
    await markComplete(store, ['2026-11-10', '2026-11-11', '2026-11-12'])
    await store.saveRecord(record({
      date: '2026-11-12',
      meal: 'dinner',
      photos: ['night'],
      photoReviews: ['passed'],
      review: 'passed',
    }))
    // 上海 11 月 13 日 06:00。连续天数停在昨天，但可以翻到昨天看照片。
    const now = new Date('2026-11-12T22:00:00.000Z')
    const today = await galleryView(store, { userId: 'u' }, now)
    const yesterday = await galleryView(store, { userId: 'u' }, now, '2026-11-12')
    assert.equal(today.streak, 3)
    assert.equal(yesterday.streak, 3)
    assert.equal(today.meals.find((meal) => meal.meal === 'dinner')?.photo, null)
    assert.equal(yesterday.meals.find((meal) => meal.meal === 'dinner')?.photo, 'night')
  })

  it('marks a partial day and stars a day when all three meals are checked in', async () => {
    const store = await seededStore({}, { hunger: 0 })
    await store.saveRecord(record({
      date: '2026-11-11',
      meal: 'breakfast',
      photos: ['early'],
      photoReviews: ['passed'],
      review: 'passed',
    }))
    await markComplete(store, ['2026-11-12'])
    const now = new Date('2026-11-13T04:10:00.000Z')
    const view = await galleryView(store, { userId: 'u' }, now)
    assert.equal(view.calendar, null)
    assert.equal(view.earliestMonth, '2026-11')
    const wednesday = view.days.find((day) => day.key === '2026-11-11')
    const thursday = view.days.find((day) => day.key === '2026-11-12')
    assert.equal(wednesday?.marked, true)
    assert.equal(wednesday?.star, false)
    assert.equal(thursday?.marked, true)
    assert.equal(thursday?.star, true)
    assert.equal(view.meals.find((meal) => meal.meal === 'lunch')?.face, 'window')
    assert.equal(view.meals.find((meal) => meal.meal === 'dinner')?.face, 'waiting')
  })

  it('returns one month of days without changing the week strip', async () => {
    const store = await seededStore({}, { hunger: 0 })
    await store.saveRecord(record({
      date: '2026-10-02',
      meal: 'breakfast',
      photos: ['oct'],
      photoReviews: ['passed'],
      review: 'passed',
    }))
    const now = new Date('2026-11-13T04:10:00.000Z')
    const view = await galleryView(store, { userId: 'u' }, now, undefined, '2026-10')
    assert.equal(view.calendar?.label, '2026年10月')
    assert.equal(view.calendar?.leading, 3)
    assert.equal(view.calendar?.days.find((day) => day.key === '2026-10-02')?.marked, true)
    assert.equal(view.days.some((day) => day.key.startsWith('2026-10')), false)
    assert.equal(view.earliestMonth, '2026-10')
  })

  it('starts month arrows at the earliest visible check-in or snack', async () => {
    const store = await seededStore({}, { hunger: 0 })
    const now = new Date('2026-11-13T04:10:00.000Z')
    assert.equal((await galleryView(store, { userId: 'u' }, now)).earliestMonth, null)
    await store.saveSettlement({
      subjectType: 'personal',
      subjectId: 'u',
      date: '2026-09-02',
      meal: 'lunch',
      outcome: 'starved',
      hungerBefore: 4,
      hungerAfter: 5,
    })
    assert.equal((await galleryView(store, { userId: 'u' }, now)).earliestMonth, null)
    await store.saveSnack({
      userId: 'u',
      date: '2026-08-03',
      startedAt: '2026-08-03T04:00:00.000Z',
      photos: ['s'],
      photoReviews: ['passed'],
      hidden: false,
    })
    assert.equal((await galleryView(store, { userId: 'u' }, now)).earliestMonth, '2026-08')
  })
})

describe('me and memorial', () => {
  it('shows the nickname and a stable account id', async () => {
    const store = await seededStore({ nickname: '' })
    const view = await meView(store, { userId: 'u' })
    assert.equal(view.nickname, '吃饭人')
    const again = await meView(store, { userId: 'u' })
    assert.equal(again.accountId, view.accountId)
    assert.match(view.accountId, /^cf-\d{4}-\d{4}$/)
  })

  it('lists nobody until a pet has died', async () => {
    const store = await seededStore()
    const now = new Date('2026-11-13T04:10:00.000Z')
    const home = await homeView(store, { userId: 'u' }, now)
    assert.equal(home.petView, 'living')
    const list = await memorialView(store, { userId: 'u' }, now)
    assert.equal('pets' in list && list.pets.length, 0)
  })

  it('lists the dead pet without a portrait', async () => {
    const store = await seededStore(
      { diedOn: '2026-11-12', cooldownUntil: '2026-11-19T20:00:00.000Z' },
      { alive: false, name: '小饭', adoptedOn: '2026-11-01', endedOn: '2026-11-12', companyDays: 12, mealsEaten: 30, hungerLog: [] },
    )
    const now = new Date('2026-11-13T04:10:00.000Z')
    const home = await homeView(store, { userId: 'u' }, now)
    assert.equal(home.petView, 'memorial')
    const list = await memorialView(store, { userId: 'u' }, now)
    assert.deepEqual(list, { pets: [{ id: '2026-11-01', name: '小饭', photo: '' }] })
    const detail = await memorialView(store, { userId: 'u' }, now, '2026-11-01')
    assert.equal('missing' in detail && detail.missing, false)
    if ('missing' in detail && !detail.missing) {
      assert.equal(detail.companyDays, 12)
      assert.equal(detail.mealsEaten, 30)
      assert.equal(detail.level, '16')
      assert.equal(detail.photo, '')
    }
  })
})
