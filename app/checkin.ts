import type { MealClocks, MealType } from '../domain/index.ts'
import {
  canUseStaple,
  deleteCheckin,
  logicalDate,
  mealWindow,
  stapleMonth,
  tomorrowLogicalDate,
  validateMealClocks,
  STAPLE_PER_MONTH,
} from '../domain/index.ts'
import { clocksOn, rollMeals, topUpJobs } from './schedule.ts'
import { killPetIfSatietyAtLeast200, runDueJobsFor } from './settle.ts'
import type { Store } from './ports.ts'
import type { UserDoc } from './types.ts'
import { requireUser } from './user.ts'

type Fail = { ok: false; error: string }

export async function saveMeals(
  store: Store,
  caller: { userId: string },
  now: Date,
  clocks: MealClocks,
): Promise<{ ok: true; effectiveOn: string } | Fail> {
  return store.runExclusive(caller.userId, async () => {
    const user = await requireUser(store, caller.userId)
    const invalid = validateMealClocks(clocks)
    if (invalid !== null) return { ok: false, error: invalid }

    const today = logicalDate(now, user.timeZone)
    const effectiveOn = tomorrowLogicalDate(today)
    // 先把已经生效的上一次改动并入 meals，再放新的待生效饭点。
    // 否则连改两天，第一次的改动会被覆盖掉。
    const next = { ...rollMeals(user, today), pendingMeals: { clocks, effectiveOn } }
    await store.saveUser(next)
    await topUpJobs(store, next, now, { refresh: true })
    return { ok: true, effectiveOn }
  })
}

function windowOf(user: UserDoc, day: string, meal: MealType) {
  return mealWindow(day, clocksOn(user, day)[meal], user.timeZone)
}

export async function finishCheckin(
  store: Store,
  caller: { userId: string },
  now: Date,
  input: { date: string; meal: MealType; photos: string[] },
): Promise<{ ok: true } | Fail> {
  return store.runExclusive(caller.userId, async () => {
    const user = await requireUser(store, caller.userId)
    if (input.date !== logicalDate(now, user.timeZone)) return { ok: false, error: '日期不符' }
    if (input.photos.length === 0) return { ok: false, error: '需要照片' }
    if ((await store.getSettlement(caller.userId, input.date, input.meal)) !== null) {
      return { ok: false, error: '已结算' }
    }
    const window = windowOf(user, input.date, input.meal)
    if (now < window.start || now >= window.end) return { ok: false, error: '不在打卡窗口' }

    const existing = await store.getRecord(caller.userId, input.date, input.meal)
    if (existing?.status === 'exempt') {
      return { ok: false, error: '这一餐已用应急口粮，先删除再打卡' }
    }

    // 有记录就必须有任务，否则窗口结束后没人结算它。
    await topUpJobs(store, user, now, { refresh: false })
    await store.saveRecord({
      userId: caller.userId,
      date: input.date,
      meal: input.meal,
      status: 'checked_in',
      review: 'pending',
      photoReviews: input.photos.map(() => 'pending' as const),
      hidden: false,
      photos: [...input.photos],
      checkinAt: now.toISOString(),
    })
    return { ok: true }
  })
}

export async function useStaple(
  store: Store,
  caller: { userId: string },
  now: Date,
  input: { date: string; meal: MealType },
): Promise<{ ok: true; stapleLeft: number } | Fail> {
  return store.runExclusive(caller.userId, async () => {
    const user = await requireUser(store, caller.userId)
    if (input.date !== logicalDate(now, user.timeZone)) return { ok: false, error: '日期不符' }

    const month = stapleMonth(now, user.timeZone)
    const stapleLeft = month === user.stapleMonth ? user.stapleLeft : STAPLE_PER_MONTH

    const settlement = await store.getSettlement(caller.userId, input.date, input.meal)
    const existing = await store.getRecord(caller.userId, input.date, input.meal)
    const pet = await store.getPet(caller.userId)
    const window = windowOf(user, input.date, input.meal)
    const inWindow = now >= window.start && now < window.end

    if (!canUseStaple({
      livingPet: pet?.alive === true,
      inWindow,
      settled: settlement !== null,
      stapleLeft,
      alreadyRecorded: existing !== null,
    })) {
      if (settlement !== null) return { ok: false, error: '已结算' }
      if (existing !== null) return { ok: false, error: '已有打卡' }
      if (!inWindow) return { ok: false, error: '不在打卡窗口' }
      if (pet?.alive !== true) return { ok: false, error: '没有存活宠物' }
      return { ok: false, error: '口粮不足' }
    }

    await topUpJobs(store, user, now, { refresh: false })
    await store.saveRecord({
      userId: caller.userId,
      date: input.date,
      meal: input.meal,
      status: 'exempt',
      review: 'passed',
      photoReviews: [],
      hidden: false,
      photos: [],
      checkinAt: now.toISOString(),
    })
    await store.saveUser({ ...user, stapleLeft: stapleLeft - 1, stapleMonth: month })
    await killPetIfSatietyAtLeast200(store, caller.userId, now)
    return { ok: true, stapleLeft: stapleLeft - 1 }
  })
}

/**
 * 结算前删除撤掉记录，结算后只隐藏照片。
 * 撤掉记录后，挂起的任务要放回 pending，这一餐才会按漏餐结算。
 * 结算前撤掉的口粮把额度退回，因为它没有被「吃」。
 */
export async function removeCheckin(
  store: Store,
  caller: { userId: string },
  now: Date,
  input: { date: string; meal: MealType },
): Promise<{ ok: true; effect: 'cancel' | 'hide_photos' } | Fail> {
  return store.runExclusive(caller.userId, async () => {
    const user = await requireUser(store, caller.userId)
    const record = await store.getRecord(caller.userId, input.date, input.meal)
    if (record === null) return { ok: false, error: '无打卡记录' }

    const settled = (await store.getSettlement(caller.userId, input.date, input.meal)) !== null
    const effect = deleteCheckin(settled)

    if (effect === 'hide_photos') {
      await store.saveRecord({ ...record, hidden: true })
      return { ok: true, effect }
    }

    await store.deleteRecord(caller.userId, input.date, input.meal)
    if (record.status === 'exempt') {
      const month = stapleMonth(new Date(record.checkinAt), user.timeZone)
      if (month === user.stapleMonth) {
        await store.saveUser({
          ...user,
          stapleLeft: Math.min(user.stapleLeft + 1, STAPLE_PER_MONTH),
        })
      }
    }
    const job = await store.getJob(caller.userId, input.date, input.meal)
    if (job !== null && (job.status === 'waiting_review' || job.status === 'manual_review')) {
      await store.saveJob({ ...job, status: 'pending' })
      await runDueJobsFor(store, caller.userId, now)
    }
    return { ok: true, effect }
  })
}
