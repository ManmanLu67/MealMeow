import type { MealClocks } from '../domain/index.ts'
import {
  MEALS,
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
