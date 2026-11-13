import type { MealClocks, MealType } from '../domain/index.ts'
import {
  MEALS,
  effectiveClocks,
  logicalDate,
  mealWindow,
  tomorrowLogicalDate,
  validateMealClocks,
} from '../domain/index.ts'
import type { Store } from './store.ts'

export async function saveMeals(
  store: Store,
  caller: { userId: string },
  now: Date,
  clocks: MealClocks,
): Promise<{ ok: true; effectiveOn: string } | { ok: false; error: string }> {
  const user = await store.getUser(caller.userId)
  if (user === null) {
    throw new Error(`user not found: ${caller.userId}`)
  }

  const validationError = validateMealClocks(clocks)
  if (validationError !== null) {
    return { ok: false, error: validationError }
  }

  const logicalToday = logicalDate(now, user.timeZone)
  const effectiveOn = tomorrowLogicalDate(logicalToday)

  await store.saveUser({
    ...user,
    pendingMeals: { clocks, effectiveOn },
  })

  for (const meal of MEALS) {
    const existing = await store.getJob(caller.userId, effectiveOn, meal)
    if (existing !== null) continue

    const window = mealWindow(effectiveOn, clocks[meal], user.timeZone)
    await store.saveJob({
      subjectType: 'personal',
      subjectId: caller.userId,
      date: effectiveOn,
      meal,
      windowEndAt: window.end.toISOString(),
      status: 'pending',
    })
  }

  return { ok: true, effectiveOn }
}

export async function finishCheckin(
  store: Store,
  caller: { userId: string },
  now: Date,
  input: { date: string; meal: MealType; photos: string[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await store.getUser(caller.userId)
  if (user === null) {
    throw new Error(`user not found: ${caller.userId}`)
  }

  const logicalToday = logicalDate(now, user.timeZone)
  if (input.date !== logicalToday) {
    return { ok: false, error: '日期不符' }
  }

  if (input.photos.length === 0) {
    return { ok: false, error: '需要照片' }
  }

  const settlement = await store.getSettlement(caller.userId, input.date, input.meal)
  if (settlement !== null) {
    return { ok: false, error: '已结算' }
  }

  const clocks = effectiveClocks(user.meals, user.pendingMeals, logicalToday)
  const window = mealWindow(input.date, clocks[input.meal], user.timeZone)
  if (now < window.start || now >= window.end) {
    return { ok: false, error: '不在打卡窗口' }
  }

  await store.saveRecord({
    userId: caller.userId,
    date: input.date,
    meal: input.meal,
    status: 'checked_in',
    review: 'pending',
    hidden: false,
    photos: [...input.photos],
    checkinAt: now.toISOString(),
  })

  return { ok: true }
}
