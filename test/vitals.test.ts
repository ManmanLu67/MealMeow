import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bowlFill,
  bowlSatiety,
  emotionFromHunger,
  feedingHungerPercent,
  healthScore,
  levelFromCheckinHours,
  levelPenalty,
  nextMealAt,
  petLevel,
  recordHungerDay,
  satietyAt,
} from '../domain/index.ts'

const clocks = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' }
const SH = 'Asia/Shanghai'

describe('feeding hunger', () => {
  const start = new Date('2026-11-13T23:30:00.000Z')
  const next = new Date('2026-11-14T04:00:00.000Z')

  it('starts at 0 right after a check-in and reaches 100 at the next meal time', () => {
    assert.equal(feedingHungerPercent(start, start, next, false), 0)
    assert.equal(feedingHungerPercent(next, start, next, false), 100)
    assert.equal(feedingHungerPercent(new Date(next.getTime() + 60_000), start, next, false), 100)
  })

  it('is halfway between the check-in and the next meal time', () => {
    const mid = new Date(start.getTime() + (next.getTime() - start.getTime()) / 2)
    assert.equal(feedingHungerPercent(mid, start, next, false), 50)
  })

  it('drops to 10 at a staple and climbs to 100 by the next meal', () => {
    assert.equal(feedingHungerPercent(start, start, next, true), 10)
    const mid = new Date(start.getTime() + (next.getTime() - start.getTime()) / 2)
    assert.equal(feedingHungerPercent(mid, start, next, true), 55)
    assert.equal(feedingHungerPercent(next, start, next, true), 100)
    assert.equal(feedingHungerPercent(new Date(next.getTime() + 60_000), start, next, true), 100)
  })

  it('fills the bowl at a check-in and empties it at the next meal time', () => {
    assert.equal(bowlFill(start, start, next), 100)
    const mid = new Date(start.getTime() + (next.getTime() - start.getTime()) / 2)
    assert.equal(bowlFill(mid, start, next), 50)
    assert.equal(bowlFill(next, start, next), 0)
    assert.equal(bowlFill(new Date(next.getTime() + 60_000), start, next), 0)
  })

  it('points dinner at the next breakfast', () => {
    assert.equal(
      nextMealAt('2026-11-13', 'dinner', clocks, SH).toISOString(),
      '2026-11-13T23:30:00.000Z',
    )
    assert.equal(
      nextMealAt('2026-11-13', 'lunch', clocks, SH).toISOString(),
      '2026-11-13T10:00:00.000Z',
    )
  })
})

describe('health and level', () => {
  it('maps the old hunger points onto a score of 100', () => {
    assert.equal(healthScore(0), 100)
    assert.equal(healthScore(6), 33)
    assert.equal(healthScore(9), 0)
  })

  it('uses a square curve and never goes below 0', () => {
    assert.equal(levelFromCheckinHours(0), 0)
    assert.equal(levelFromCheckinHours(0.5), 0)
    assert.equal(levelFromCheckinHours(1), 1)
    assert.equal(levelFromCheckinHours(4), 2)
    assert.equal(levelFromCheckinHours(9), 3)
  })

  it('records the band for the day and deducts after the day is over', () => {
    const log = recordHungerDay(
      recordHungerDay([], '2026-11-12', 'hungry'),
      '2026-11-12',
      'critical',
    )
    assert.deepEqual(log, [{ date: '2026-11-12', band: 'critical', meals: 2 }])
    assert.equal(levelPenalty([{ date: '2026-11-11', band: 'full', meals: 3 }]), 0)
    assert.equal(levelPenalty([{ date: '2026-11-11', band: 'peckish', meals: 3 }]), 1)
    assert.equal(levelPenalty([{ date: '2026-11-11', band: 'hungry', meals: 2 }]), 1)
    assert.equal(levelPenalty([{ date: '2026-11-11', band: 'critical', meals: 3 }]), 3)
    assert.equal(petLevel(9, [{ date: '2026-11-11', band: 'critical', meals: 2 }]), 1)
    assert.equal(petLevel(1, [{ date: '2026-11-11', band: 'hungry', meals: 3 }]), 0)
  })

  it('labels emotion from satiety percent', () => {
    assert.equal(emotionFromHunger(100), '饱足')
    assert.equal(emotionFromHunger(70), '饱足')
    assert.equal(emotionFromHunger(69), '满足')
    assert.equal(emotionFromHunger(40), '满足')
    assert.equal(emotionFromHunger(39), '有点饿')
    assert.equal(emotionFromHunger(15), '有点饿')
    assert.equal(emotionFromHunger(14), '饿扁了')
  })
})

describe('satiety', () => {
  const clocksFor = () => clocks
  const breakfast = {
    kind: 'meal' as const,
    at: '2026-11-12T23:30:00.000Z',
    meal: 'breakfast' as const,
    date: '2026-11-13',
  }

  it('is 0 with no events and 100 at a meal, then 50 halfway to lunch', () => {
    assert.equal(satietyAt(new Date('2026-11-12T23:30:00.000Z'), [], clocksFor, SH), 0)
    assert.equal(satietyAt(new Date('2026-11-12T23:30:00.000Z'), [breakfast], clocksFor, SH), 100)
    assert.equal(satietyAt(new Date('2026-11-13T01:45:00.000Z'), [breakfast], clocksFor, SH), 50)
    assert.equal(satietyAt(new Date('2026-11-13T04:00:00.000Z'), [breakfast], clocksFor, SH), 0)
  })

  it('adds at a meal instant against the following meal, not zero', () => {
    const snack = { kind: 'snack' as const, at: '2026-11-13T04:00:00.000Z' }
    assert.equal(satietyAt(new Date('2026-11-13T04:00:00.000Z'), [breakfast, snack], clocksFor, SH), 5)
  })

  it('adds 90 for a staple and a later meal sets 100', () => {
    const staple = {
      kind: 'staple' as const,
      at: '2026-11-13T04:00:00.000Z',
      meal: 'lunch' as const,
      date: '2026-11-13',
    }
    assert.equal(satietyAt(new Date('2026-11-13T04:00:00.000Z'), [staple], clocksFor, SH), 90)
    assert.equal(satietyAt(new Date('2026-11-13T07:00:00.000Z'), [staple], clocksFor, SH), 45)
    assert.equal(satietyAt(new Date('2026-11-13T10:00:00.000Z'), [staple], clocksFor, SH), 0)
    const again = {
      kind: 'meal' as const,
      at: '2026-11-13T04:30:00.000Z',
      meal: 'lunch' as const,
      date: '2026-11-13',
    }
    assert.equal(satietyAt(new Date('2026-11-13T04:30:00.000Z'), [staple, again], clocksFor, SH), 100)
  })

  it('lets three snacks add 15 on top of a full meal and ignores the bowl for staples', () => {
    const at = '2026-11-12T23:30:00.000Z'
    const staple = {
      kind: 'staple' as const,
      at,
      meal: 'breakfast' as const,
      date: '2026-11-13',
    }
    const snacks = [1, 2, 3].map((n) => ({
      kind: 'snack' as const,
      at: new Date(Date.parse(at) + n).toISOString(),
    }))
    assert.equal(
      satietyAt(new Date(Date.parse(at) + 3), [breakfast, staple, ...snacks], clocksFor, SH),
      205,
    )
    assert.equal(bowlSatiety(new Date(at), [staple], clocksFor, SH), 0)
    assert.equal(
      bowlSatiety(new Date(Date.parse(at) + 3), [breakfast, staple, ...snacks], clocksFor, SH),
      100,
    )
  })
})
