import type { MealClocks } from '../domain/index.ts'
import { STAPLE_PER_MONTH, stapleMonth } from '../domain/index.ts'
import { topUpJobs } from './schedule.ts'
import type { Store } from './ports.ts'
import type { UserDoc } from './types.ts'

export const DEFAULT_MEALS: MealClocks = {
  breakfast: '07:30',
  lunch: '12:00',
  dinner: '18:00',
}

export async function requireUser(store: Store, userId: string): Promise<UserDoc> {
  const user = await store.getUser(userId)
  if (user === null) throw new Error(`user not found: ${userId}`)
  return user
}

function validTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/**
 * 页面每次进入时调用。第一次建用户，之后按设备当前时区更新。
 * 服务端不用服务器时区，时区只来自这里。
 */
export async function syncUser(
  store: Store,
  caller: { userId: string },
  now: Date,
  input: { timeZone: string; nickname?: string },
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  if (!validTimeZone(input.timeZone)) return { ok: false, error: '时区无效' }
  let nickname: string | undefined
  if (input.nickname !== undefined) {
    nickname = input.nickname.trim()
    if (nickname.length === 0) return { ok: false, error: '请设置你的昵称' }
  }

  const found = await store.getUser(caller.userId)
  const created = found === null
  const user: UserDoc = found === null
    ? {
        userId: caller.userId,
        nickname: nickname ?? '',
        timeZone: input.timeZone,
        meals: DEFAULT_MEALS,
        pendingMeals: null,
        stapleLeft: STAPLE_PER_MONTH,
        stapleMonth: stapleMonth(now, input.timeZone),
        cooldownUntil: null,
        adoptedOn: null,
        diedOn: null,
        pastPets: [],
      }
    : { ...found, timeZone: input.timeZone, ...(nickname !== undefined ? { nickname } : {}) }

  await store.saveUser(user)
  await topUpJobs(store, user, now, { refresh: true })
  return { ok: true, created }
}
