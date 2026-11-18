import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Store } from '../app/ports.ts'
import { adoptView, galleryView, homeView } from '../app/views.ts'
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
})
