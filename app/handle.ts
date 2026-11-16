import { adoptPet } from './settle.ts'
import { finishCheckin, removeCheckin, saveMeals, useStaple } from './checkin.ts'
import { syncUser } from './user.ts'
import type { Store } from './ports.ts'
import type { MealClocks, MealType } from '../domain/index.ts'
import { MEALS } from '../domain/index.ts'

/**
 * 与平台无关的入口。云函数、手机 App 的本地服务、测试都调这一个函数，
 * 各自只负责三件事：认出调用者是谁、把原始请求变成 Request、把 Response 送回去。
 *
 * 调用者 ID 只能来自平台的登录态，不能来自请求体。
 * 请求体里的 userId 字段会被忽略。
 */
export type Caller = { userId: string }

export type Request =
  | { action: 'sync'; timeZone: string }
  | { action: 'saveMeals'; clocks: MealClocks }
  | { action: 'checkin'; date: string; meal: MealType; photos: string[] }
  | { action: 'exempt'; date: string; meal: MealType }
  | { action: 'deleteCheckin'; date: string; meal: MealType }
  | { action: 'adopt' }

export type Response =
  | { ok: true; data?: unknown }
  | { ok: false; error: string }

/** 页面可以发起的动作。审核结果不在里面，它只能由平台的内容安全回调写入。 */
export const PAGE_ACTIONS = ['sync', 'saveMeals', 'checkin', 'exempt', 'deleteCheckin', 'adopt'] as const

function isMeal(value: unknown): value is MealType {
  return typeof value === 'string' && (MEALS as readonly string[]).includes(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function parseClocks(value: unknown): MealClocks | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  if (!isString(raw.breakfast) || !isString(raw.lunch) || !isString(raw.dinner)) return null
  return { breakfast: raw.breakfast, lunch: raw.lunch, dinner: raw.dinner }
}

/** 把平台传来的任意输入收窄成 Request。不认识的动作和多余字段一律丢掉。 */
export function parseRequest(raw: unknown): Request | null {
  if (typeof raw !== 'object' || raw === null) return null
  const body = raw as Record<string, unknown>
  switch (body.action) {
    case 'sync':
      return isString(body.timeZone) ? { action: 'sync', timeZone: body.timeZone } : null
    case 'saveMeals': {
      const clocks = parseClocks(body.clocks)
      return clocks === null ? null : { action: 'saveMeals', clocks }
    }
    case 'checkin': {
      const photos = body.photos
      if (!isString(body.date) || !isMeal(body.meal)) return null
      if (!Array.isArray(photos) || photos.length === 0 || !photos.every(isString)) return null
      return { action: 'checkin', date: body.date, meal: body.meal, photos: [...photos] }
    }
    case 'exempt':
    case 'deleteCheckin':
      if (!isString(body.date) || !isMeal(body.meal)) return null
      return { action: body.action, date: body.date, meal: body.meal }
    case 'adopt':
      return { action: 'adopt' }
    default:
      return null
  }
}

export async function handle(
  store: Store,
  caller: Caller,
  now: Date,
  raw: unknown,
): Promise<Response> {
  const request = parseRequest(raw)
  if (request === null) return { ok: false, error: 'bad_request' }

  switch (request.action) {
    case 'sync': {
      const result = await syncUser(store, caller, now, { timeZone: request.timeZone })
      return result.ok ? { ok: true, data: { created: result.created } } : result
    }
    case 'saveMeals': {
      const result = await saveMeals(store, caller, now, request.clocks)
      return result.ok ? { ok: true, data: { effectiveOn: result.effectiveOn } } : result
    }
    case 'checkin':
      return finishCheckin(store, caller, now, {
        date: request.date,
        meal: request.meal,
        photos: request.photos,
      })
    case 'exempt': {
      const result = await useStaple(store, caller, now, { date: request.date, meal: request.meal })
      return result.ok ? { ok: true, data: { stapleLeft: result.stapleLeft } } : result
    }
    case 'deleteCheckin': {
      const result = await removeCheckin(store, caller, now, {
        date: request.date,
        meal: request.meal,
      })
      return result.ok ? { ok: true, data: { effect: result.effect } } : result
    }
    case 'adopt':
      return adoptPet(store, caller, now)
  }
}
