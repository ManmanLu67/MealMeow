import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  aggregateReview,
  applyMeal,
  cameraAction,
  canAdopt,
  canUseStaple,
  chipLabel,
  chipState,
  cooldownUntil,
  dayComplete,
  daysBetweenInclusive,
  deleteCheckin,
  effectiveClocks,
  evaluateFeeding,
  homeBadge,
  homePetView,
  inAnyWindow,
  jobReady,
  logicalDate,
  mealInstant,
  mealWindow,
  nextHunger,
  openMeals,
  personalStreak,
  petBand,
  reviewDeadline,
  settleStep,
  settlementOutcome,
  snackMergeTarget,
  stapleMonth,
  streakAnchor,
  streakEndingAt,
  validateMealClocks,
  validatePetName,
} from '../domain/index.ts'

const SH = 'Asia/Shanghai'
const clocks = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' }

describe('logical day', () => {
  it('04:00 starts the new day in Shanghai', () => {
    assert.equal(logicalDate(new Date('2026-11-12T19:59:00Z'), SH), '2026-11-12')
    assert.equal(logicalDate(new Date('2026-11-12T20:00:00Z'), SH), '2026-11-13')
  })

  it('places a pre-04:00 clock on the next calendar morning', () => {
    const at = mealInstant('2026-11-13', '03:00', SH)
    assert.equal(at.toISOString(), '2026-11-13T19:00:00.000Z')
  })

  it('converts a New York wall clock', () => {
    const at = mealInstant('2026-11-13', '12:00', 'America/New_York')
    assert.equal(at.toISOString(), '2026-11-13T17:00:00.000Z')
  })
})

describe('meal windows', () => {
  it('uses a half-open two-hour window', () => {
    const window = mealWindow('2026-11-13', '07:30', SH)
    assert.equal(chipState(new Date('2026-11-12T22:29:00Z'), window, null), 'upcoming')
    assert.equal(chipState(new Date('2026-11-12T22:30:00Z'), window, null), 'due')
    assert.equal(chipState(new Date('2026-11-13T00:29:00Z'), window, null), 'due')
    assert.equal(chipState(new Date('2026-11-13T00:30:00Z'), window, null), 'missed')
    assert.equal(chipState(new Date('2026-11-13T00:00:00Z'), window, 'checked_in'), 'checked_in')
  })

  it('allows a gap of exactly two hours and rejects less', () => {
    assert.equal(validateMealClocks({ breakfast: '07:30', lunch: '09:30', dinner: '18:00' }), null)
    assert.equal(
      validateMealClocks({ breakfast: '07:30', lunch: '09:29', dinner: '18:00' }),
      '打卡时间不能重合',
    )
  })

  it('rejects a wrap-around gap under two hours', () => {
    assert.equal(
      validateMealClocks({ breakfast: '04:30', lunch: '12:00', dinner: '03:00' }),
      '打卡时间不能重合',
    )
  })

  it('labels chips the way the home page does', () => {
    assert.equal(chipLabel('breakfast', 'due'), '早 · 待打卡')
    assert.equal(chipLabel('lunch', 'exempt'), '中 · 口粮')
    assert.equal(chipLabel('dinner', 'missed'), '晚 · 漏')
  })

  it('opens only the meal whose window contains now', () => {
    const now = new Date('2026-11-12T22:40:00Z')
    assert.deepEqual(openMeals(now, clocks, {}, SH), ['breakfast'])
  })

  it('offers each due meal or a snack, and snacks when nothing is due', () => {
    assert.deepEqual(cameraAction(['breakfast']), { type: 'pick', meals: ['breakfast'], snack: true })
    assert.deepEqual(cameraAction(['lunch', 'dinner']), {
      type: 'pick',
      meals: ['lunch', 'dinner'],
      snack: true,
    })
    assert.deepEqual(cameraAction([]), { type: 'snack' })
  })

  it('shows the home badge only while a meal is due', () => {
    assert.equal(homeBadge(['upcoming', 'due', 'missed']), true)
    assert.equal(homeBadge(['checked_in', 'missed', 'upcoming']), false)
  })

  it('keeps saved clocks until the next logical day', () => {
    const pending = {
      clocks: { breakfast: '08:00', lunch: '12:30', dinner: '18:30' },
      effectiveOn: '2026-11-14',
    }
    assert.equal(effectiveClocks(clocks, pending, '2026-11-13').breakfast, '07:30')
    assert.equal(effectiveClocks(clocks, pending, '2026-11-14').breakfast, '08:00')
  })
})

describe('pet hunger', () => {
  it('recovers one band per meal and starves by one point', () => {
    assert.equal(applyMeal(8, 'fed'), 5)
    assert.equal(applyMeal(5, 'fed'), 2)
    assert.equal(applyMeal(2, 'fed'), 0)
    assert.equal(applyMeal(0, 'fed'), 0)
    assert.equal(applyMeal(8, 'starved'), 9)
    assert.equal(applyMeal(9, 'fed'), 9)
  })

  it('maps hunger to the five words', () => {
    assert.equal(petBand(0), 'full')
    assert.equal(petBand(2), 'peckish')
    assert.equal(petBand(5), 'hungry')
    assert.equal(petBand(8), 'critical')
    assert.equal(petBand(9), 'dead')
  })

  it('settles at window end and skips a missing pet', () => {
    assert.equal(settlementOutcome('exempt'), 'fed')
    assert.equal(settlementOutcome(null), 'starved')
    assert.equal(nextHunger(6, 'fed'), 5)
    assert.equal(nextHunger(null, 'starved'), null)
  })

  it('blocks adoption until seven logical days later at 04:00', () => {
    const died = new Date('2026-11-13T07:00:00Z')
    const until = cooldownUntil(died, SH)
    assert.equal(until.toISOString(), '2026-11-19T20:00:00.000Z')
    assert.equal(canAdopt(until, new Date('2026-11-19T19:59:00Z')), false)
    assert.equal(canAdopt(until, until), true)
  })
})

describe('staple, gallery delete, streak', () => {
  it('rolls the staple month at 04:00 on the 1st', () => {
    assert.equal(stapleMonth(new Date('2026-09-30T19:59:00Z'), SH), '2026-09')
    assert.equal(stapleMonth(new Date('2026-09-30T20:00:00Z'), SH), '2026-10')
  })

  it('hides staple when there is no living pet', () => {
    assert.equal(canUseStaple({
      livingPet: false,
      inWindow: true,
      settled: false,
      stapleLeft: 2,
      alreadyRecorded: false,
    }), false)
  })

  it('cancels an unsettled check-in and only hides photos after settlement', () => {
    assert.equal(deleteCheckin(false), 'cancel')
    assert.equal(deleteCheckin(true), 'hide_photos')
  })

  it('counts a day only when all three meals are done', () => {
    assert.equal(dayComplete(['checked_in', 'exempt', 'checked_in']), true)
    assert.equal(dayComplete(['checked_in', null, 'checked_in']), false)
    assert.equal(streakEndingAt(['2026-11-11', '2026-11-12', '2026-11-13'], '2026-11-13'), 3)
    assert.equal(streakEndingAt(['2026-11-11', '2026-11-13'], '2026-11-13'), 1)
  })

  it('keeps shared days while the pet lives, then starts personal time after death', () => {
    const dates = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']
    assert.equal(personalStreak({
      completeDates: dates,
      endDate: '2026-11-13',
      adoptedOn: '2026-11-10',
      diedOn: null,
    }), 4)
    assert.equal(personalStreak({
      completeDates: dates,
      endDate: '2026-11-13',
      adoptedOn: '2026-11-10',
      diedOn: '2026-11-12',
    }), 1)
  })

  it('a second pet does not inherit the days the first pet lived', () => {
    const dates = []
    for (let d = 1; d <= 20; d += 1) dates.push(`2026-11-${String(d).padStart(2, '0')}`)
    const past = [{ adoptedOn: '2026-11-01', diedOn: '2026-11-05' }]
    // 先领养：第一只 11-01 领养、11-05 死亡；11-13 领养第二只，活着。
    // 活着只算第二只领养日之后的共度：11-13 到 11-20，共 8 天。
    // 第一只在世的 11-01 到 11-05 不会因为领养新宠物而被算回来。
    assert.equal(personalStreak({
      completeDates: dates,
      endDate: '2026-11-20',
      adoptedOn: '2026-11-13',
      diedOn: null,
      pastPets: past,
    }), 8)
    // 第二只 11-16 死亡后，个人时间从 11-17 起重计：11-17 到 11-20，共 4 天。
    assert.equal(personalStreak({
      completeDates: dates,
      endDate: '2026-11-20',
      adoptedOn: '2026-11-13',
      diedOn: '2026-11-16',
      pastPets: past,
    }), 4)
  })

  it('subtracts pet days from a check-in-first streak only after death', () => {
    const dates = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']
    assert.equal(personalStreak({
      completeDates: dates,
      endDate: '2026-11-13',
      adoptedOn: '2026-11-12',
      diedOn: null,
    }), 4)
    assert.equal(personalStreak({
      completeDates: dates,
      endDate: '2026-11-13',
      adoptedOn: '2026-11-12',
      diedOn: '2026-11-12',
    }), 3)
  })

  it('anchors the streak on today only once today is complete', () => {
    assert.equal(streakAnchor('2026-11-13', ['checked_in', 'exempt', 'checked_in']), '2026-11-13')
    assert.equal(streakAnchor('2026-11-13', ['checked_in', 'due', 'upcoming']), '2026-11-12')
    assert.equal(streakAnchor('2026-11-13', ['upcoming', 'upcoming', 'upcoming']), '2026-11-12')
    assert.equal(streakAnchor('2026-11-13', ['checked_in', 'missed', 'upcoming']), null)
  })

  it('counts company days from adoption to death inclusive', () => {
    assert.equal(daysBetweenInclusive('2026-11-01', '2026-11-13'), 13)
    assert.equal(daysBetweenInclusive('2026-11-13', '2026-11-13'), 1)
    assert.equal(daysBetweenInclusive('2026-11-14', '2026-11-13'), 0)
  })
})

describe('photo review and clock safety', () => {
  it('one passed photo passes the meal, only all rejected rejects it', () => {
    assert.equal(aggregateReview(['passed', 'passed']), 'passed')
    assert.equal(aggregateReview(['passed', 'pending']), 'passed')
    assert.equal(aggregateReview(['passed', 'rejected']), 'passed')
    assert.equal(aggregateReview(['rejected', 'rejected']), 'rejected')
    assert.equal(aggregateReview(['pending', 'rejected']), 'pending')
    assert.equal(aggregateReview(['pending', 'pending']), 'pending')
    assert.equal(aggregateReview([]), 'pending')
  })

  it('refuses a meal clock whose window would cross the 04:00 day line', () => {
    assert.match(
      validateMealClocks({ breakfast: '03:30', lunch: '12:00', dinner: '18:00' }) ?? '',
      /4 点/,
    )
    assert.equal(validateMealClocks({ breakfast: '03:00', lunch: '12:00', dinner: '18:00' }), null)
    assert.equal(validateMealClocks({ breakfast: '05:00', lunch: '12:00', dinner: '18:00' }), null)
  })
})

describe('settlement job and review', () => {
  const end = new Date('2026-11-13T04:00:00Z')

  it('answers fed or starved and refuses a group subject', () => {
    assert.deepEqual(evaluateFeeding('personal', '2026-11-13', 'lunch', [{ status: 'exempt' }]), {
      outcome: 'fed',
    })
    assert.deepEqual(evaluateFeeding('personal', '2026-11-13', 'lunch', []), {
      outcome: 'starved',
    })
    assert.throws(
      () => evaluateFeeding('group', '2026-11-13', 'lunch', [{ status: 'checked_in' }]),
      /不能结算小组/,
    )
  })

  it('freezes the pet until review finishes, and never auto-decides', () => {
    assert.deepEqual(settleStep({
      now: new Date(end.getTime() - 1),
      windowEndAt: end,
      record: 'checked_in',
      review: 'passed',
    }), { kind: 'not_due' })
    assert.deepEqual(settleStep({
      now: end,
      windowEndAt: end,
      record: 'exempt',
      review: null,
    }), { kind: 'settle', outcome: 'fed' })
    assert.deepEqual(settleStep({
      now: end,
      windowEndAt: end,
      record: null,
      review: null,
    }), { kind: 'settle', outcome: 'starved' })
    assert.deepEqual(settleStep({
      now: new Date(end.getTime() + 60 * 60 * 1000),
      windowEndAt: end,
      record: 'checked_in',
      review: 'pending',
    }), { kind: 'frozen', reason: 'waiting_review' })
    assert.equal(reviewDeadline(end).toISOString(), '2026-11-13T06:00:00.000Z')
    assert.deepEqual(settleStep({
      now: reviewDeadline(end),
      windowEndAt: end,
      record: 'checked_in',
      review: 'pending',
    }), { kind: 'frozen', reason: 'manual_review' })
    assert.deepEqual(settleStep({
      now: new Date(end.getTime() + 3 * 60 * 60 * 1000),
      windowEndAt: end,
      record: 'checked_in',
      review: 'manual',
    }), { kind: 'frozen', reason: 'manual_review' })
    assert.deepEqual(settleStep({
      now: end,
      windowEndAt: end,
      record: 'checked_in',
      review: 'passed',
    }), { kind: 'settle', outcome: 'fed' })
    assert.deepEqual(settleStep({
      now: end,
      windowEndAt: end,
      record: 'checked_in',
      review: 'rejected',
    }), { kind: 'settle', outcome: 'starved' })
  })

  it('scans pending jobs whose window has ended', () => {
    assert.equal(jobReady('pending', end, end), true)
    assert.equal(jobReady('pending', end, new Date(end.getTime() - 1)), false)
    assert.equal(jobReady('waiting_review', end, end), false)
    assert.equal(jobReady('settled', end, end), false)
  })

  it('puts the memorial on the home pet area and drops it after cooldown', () => {
    assert.equal(homePetView('none', true), 'pasture')
    assert.equal(homePetView('alive', false), 'living')
    assert.equal(homePetView('dead', false), 'memorial')
    assert.equal(homePetView('dead', true), 'pasture')
  })
})

describe('snack window and merge', () => {
  // 饭点 07:30 / 12:00 / 18:00，窗口是饭点前后 1 小时。
  it('is in a window only during one meal window', () => {
    assert.equal(inAnyWindow(new Date('2026-11-12T22:00:00Z'), clocks, SH), false) // 06:00
    assert.equal(inAnyWindow(new Date('2026-11-12T23:00:00Z'), clocks, SH), true) // 07:00
    assert.equal(inAnyWindow(new Date('2026-11-13T00:00:00Z'), clocks, SH), true) // 08:00
    assert.equal(inAnyWindow(new Date('2026-11-13T00:30:00Z'), clocks, SH), false) // 08:30
    assert.equal(inAnyWindow(new Date('2026-11-13T04:00:00Z'), clocks, SH), true) // 12:00
  })

  it('merges into the latest snack started within one hour', () => {
    const now = new Date('2026-11-13T03:00:00Z') // 11:00
    const starts = ['2026-11-13T02:10:00Z', '2026-11-13T02:30:00Z'] // 10:10, 10:30
    assert.equal(snackMergeTarget(starts, now), '2026-11-13T02:30:00Z')
  })

  it('opens a new snack once the anchor is an hour old', () => {
    const now = new Date('2026-11-13T03:30:00Z')
    const starts = ['2026-11-13T02:30:00Z'] // 正好一小时前
    assert.equal(snackMergeTarget(starts, now), null)
  })

  it('ignores a future start and picks the nearest eligible one', () => {
    const now = new Date('2026-11-13T03:00:00Z')
    const starts = ['2026-11-13T02:59:00Z', '2026-11-13T04:00:00Z']
    assert.equal(snackMergeTarget(starts, now), '2026-11-13T02:59:00Z')
  })
})

describe('pet name', () => {
  it('defaults an empty name to 小饭', () => {
    assert.deepEqual(validatePetName(undefined), { ok: true, name: '小饭' })
    assert.deepEqual(validatePetName('   '), { ok: true, name: '小饭' })
  })

  it('trims and keeps a valid name', () => {
    assert.deepEqual(validatePetName('  咪咪 '), { ok: true, name: '咪咪' })
    assert.deepEqual(validatePetName('🐱饭饭'), { ok: true, name: '🐱饭饭' })
  })

  it('caps the name at six characters', () => {
    assert.deepEqual(validatePetName('一二三四五六'), { ok: true, name: '一二三四五六' })
    assert.deepEqual(validatePetName('一二三四五六七'), {
      ok: false,
      error: '名字最多 6 个字',
    })
  })

  it('rejects control characters and line breaks', () => {
    assert.equal(validatePetName('饭\n饭').ok, false)
    assert.equal(validatePetName('饭\t饭').ok, false)
  })
})
