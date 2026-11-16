import type { MealClocks, MealType } from '../domain/index.ts'
import {
  MEALS,
  addIsoDays,
  effectiveClocks,
  logicalDate,
  mealWindow,
} from '../domain/index.ts'
import type { Store } from './ports.ts'
import type { UserDoc } from './types.ts'

/**
 * 某个逻辑日生效的饭点。待生效的改动到了生效日就取新值，
 * 不要求先把它并入 meals。
 */
export function clocksOn(user: UserDoc, logicalDay: string): MealClocks {
  return effectiveClocks(user.meals, user.pendingMeals, logicalDay)
}

/**
 * 把已到生效日的待生效饭点并入 meals。
 * 再保存饭点前必须先并入，否则新改动覆盖 pendingMeals 时，
 * 已经生效的那一次就丢了。
 */
export function rollMeals(user: UserDoc, logicalToday: string): UserDoc {
  const pending = user.pendingMeals
  if (pending === null || logicalToday < pending.effectiveOn) return user
  return { ...user, meals: pending.clocks, pendingMeals: null }
}

/** 这一餐在所属逻辑日的窗口结束时刻。 */
export function windowEndIso(user: UserDoc, logicalDay: string, meal: MealType): string {
  const clocks = clocksOn(user, logicalDay)
  return mealWindow(logicalDay, clocks[meal], user.timeZone).end.toISOString()
}

/**
 * 给指定逻辑日的每一餐补一条结算任务。每个该结算的餐次都要有任务，
 * 漏餐才扣得到饥饿。已有任务的挂起和已结算状态一律不动。
 * refresh 为 true 时，仍是 pending 的任务按当前饭点重算窗口。
 * 改饭点和换时区用 refresh，定时扫描只补缺，不改已有任务。
 */
export async function ensureJobs(
  store: Store,
  user: UserDoc,
  days: readonly string[],
  options: { refresh: boolean },
): Promise<void> {
  for (const day of days) {
    for (const meal of MEALS) {
      const existing = await store.getJob(user.userId, day, meal)
      const windowEndAt = windowEndIso(user, day, meal)
      if (existing === null) {
        await store.saveJob({
          subjectType: 'personal',
          subjectId: user.userId,
          date: day,
          meal,
          windowEndAt,
          status: 'pending',
        })
        continue
      }
      if (
        options.refresh
        && existing.status === 'pending'
        && existing.windowEndAt !== windowEndAt
      ) {
        await store.saveJob({ ...existing, windowEndAt })
      }
    }
  }
}

/** 保证当天和次日的任务都在。 */
export async function topUpJobs(
  store: Store,
  user: UserDoc,
  now: Date,
  options: { refresh: boolean },
): Promise<void> {
  const today = logicalDate(now, user.timeZone)
  await ensureJobs(store, user, [today, addIsoDays(today, 1)], options)
}

/** 每次结算扫描先给所有用户补任务，没改过饭点的用户也有任务可结算。 */
export async function topUpAllJobs(store: Store, now: Date): Promise<void> {
  for (const userId of await store.listUserIds()) {
    const user = await store.getUser(userId)
    if (user !== null) await topUpJobs(store, user, now, { refresh: false })
  }
}
