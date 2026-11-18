import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bowlFill,
  emotionFromHunger,
  feedingHungerPercent,
  healthScore,
  levelFromCheckinHours,
  levelPenalty,
  nextMealAt,
  petLevel,
  recordHungerDay,
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

  it('stays at 10 when the meal was a staple', () => {
    assert.equal(feedingHungerPercent(next, start, next, true), 10)
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

  it('labels emotion from the hunger percent', () => {
    assert.equal(emotionFromHunger(0), '饱足')
    assert.equal(emotionFromHunger(30), '饱足')
    assert.equal(emotionFromHunger(31), '满足')
    assert.equal(emotionFromHunger(85), '有点饿')
    assert.equal(emotionFromHunger(86), '饿扁了')
  })
})
