import { adoptPet } from './settle.ts'
import { finishCheckin, removeCheckin, saveMeals, useStaple } from './checkin.ts'
import { recordSnack, removeSnack } from './snack.ts'
import { setAnnotation } from './annotate.ts'
import { closeAccount } from './backup.ts'
import { syncUser } from './user.ts'
import { clearExpiredPhotos, photoPurgeNotice } from './retention.ts'
import { adoptView, galleryView, homeView, meView, memorialView } from './views.ts'
import { submitPhotos, submitSnackPhotos, type MediaChecker } from './media-check.ts'
import type { Store } from './ports.ts'
import type { MealClocks, MealType } from '../domain/index.ts'
import type { PetSpecies } from './types.ts'
import { MEALS, logicalDate } from '../domain/index.ts'

/**
 * 与平台无关的入口。云函数、手机 App 的本地服务、测试都调这一个函数，
 * 各自只负责三件事：认出调用者是谁、把原始请求变成 Request、把 Response 送回去。
 *
 * 调用者 ID 只能来自平台的登录态，不能来自请求体。
 * 请求体里的 userId 字段会被忽略。
 */
export type Caller = { userId: string }

export type Request =
  | { action: 'sync'; timeZone: string; nickname?: string }
  | { action: 'saveMeals'; clocks: MealClocks }
  | { action: 'checkin'; meal: MealType; photos: string[] }
  | { action: 'snack'; photos: string[] }
  | { action: 'exempt'; meal: MealType }
  | { action: 'deleteCheckin'; date: string; meal: MealType }
  | { action: 'deleteSnack'; date: string; startedAt: string }
  | { action: 'annotate'; kind: 'meal'; date: string; meal: MealType; text: string }
  | { action: 'annotate'; kind: 'snack'; date: string; startedAt: string; text: string }
  | { action: 'adopt'; name?: string; species?: PetSpecies }
  | { action: 'home' }
  | { action: 'gallery'; date?: string; month?: string }
  | { action: 'adoptView' }
  | { action: 'me' }
  | { action: 'memorial'; id?: string }
  | { action: 'closeAccount' }
  | { action: 'photoPurge'; noted: string | null }
  | { action: 'purgePhotos'; month: string }

export type Response =
  | { ok: true; data?: unknown }
  | { ok: false; error: string }

/** 页面可以发起的动作。审核结果不在里面，它只能由平台的内容安全回调写入。 */
export const PAGE_ACTIONS = [
  'sync',
  'saveMeals',
  'checkin',
  'snack',
  'exempt',
  'deleteCheckin',
  'deleteSnack',
  'annotate',
  'adopt',
  'home',
  'gallery',
  'adoptView',
  'me',
  'memorial',
  'closeAccount',
] as const

function isMeal(value: unknown): value is MealType {
  return typeof value === 'string' && (MEALS as readonly string[]).includes(value)
}

function isSpecies(value: unknown): value is PetSpecies {
  return value === 'cat' || value === 'samoyed' || value === 'parrot' || value === 'goldfish'
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isText(value: unknown): value is string {
  return typeof value === 'string'
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function isMonth(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return false
  const month = Number(value.slice(5))
  return month >= 1 && month <= 12
}

function parsePhotos(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isString)) return null
  return [...value]
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
    case 'sync': {
      if (!isString(body.timeZone)) return null
      if (body.nickname !== undefined && typeof body.nickname !== 'string') return null
      return {
        action: 'sync',
        timeZone: body.timeZone,
        nickname: typeof body.nickname === 'string' ? body.nickname : undefined,
      }
    }
    case 'saveMeals': {
      const clocks = parseClocks(body.clocks)
      return clocks === null ? null : { action: 'saveMeals', clocks }
    }
    case 'checkin': {
      // 打卡落在哪一天由服务端按用户时区算，不信客户端传来的日期。
      const photos = parsePhotos(body.photos)
      if (!isMeal(body.meal) || photos === null) return null
      return { action: 'checkin', meal: body.meal, photos }
    }
    case 'snack': {
      // 零食不带餐次也不带日期：窗口外的打卡，归属由服务端决定。
      const photos = parsePhotos(body.photos)
      return photos === null ? null : { action: 'snack', photos }
    }
    case 'exempt':
      if (!isMeal(body.meal)) return null
      return { action: 'exempt', meal: body.meal }
    case 'deleteCheckin':
      // 删除可以针对以前的日子（图鉴里删），所以要带日期。
      if (!isString(body.date) || !isMeal(body.meal)) return null
      return { action: 'deleteCheckin', date: body.date, meal: body.meal }
    case 'deleteSnack':
      if (!isString(body.date) || !isString(body.startedAt)) return null
      return { action: 'deleteSnack', date: body.date, startedAt: body.startedAt }
    case 'annotate':
      if (!isText(body.text)) return null
      if (body.kind === 'meal') {
        if (!isDate(body.date) || !isMeal(body.meal)) return null
        return { action: 'annotate', kind: 'meal', date: body.date, meal: body.meal, text: body.text }
      }
      if (body.kind === 'snack') {
        if (!isDate(body.date) || !isString(body.startedAt)) return null
        return {
          action: 'annotate',
          kind: 'snack',
          date: body.date,
          startedAt: body.startedAt,
          text: body.text,
        }
      }
      return null
    case 'adopt':
      // 名字可选。类型不对当作没填，具体长度和字符由领域层校验。
      // 物种写了但不是四种动物之一，整条请求无效。
      if (body.species !== undefined && !isSpecies(body.species)) return null
      return {
        action: 'adopt',
        name: typeof body.name === 'string' ? body.name : undefined,
        species: isSpecies(body.species) ? body.species : undefined,
      }
    case 'home':
      return { action: 'home' }
    case 'gallery':
      if (body.date !== undefined && !isDate(body.date)) return null
      if (body.month !== undefined && !isMonth(body.month)) return null
      return {
        action: 'gallery',
        date: isDate(body.date) ? body.date : undefined,
        month: isMonth(body.month) ? body.month : undefined,
      }
    case 'adoptView':
      return { action: 'adoptView' }
    case 'me':
      return { action: 'me' }
    case 'memorial':
      if (body.id !== undefined && !isString(body.id)) return null
      return { action: 'memorial', id: isString(body.id) ? body.id : undefined }
    case 'closeAccount':
      return { action: 'closeAccount' }
    case 'photoPurge': {
      const noted =
        body.noted === undefined || body.noted === null
          ? null
          : typeof body.noted === 'string'
            ? body.noted
            : null
      return { action: 'photoPurge', noted }
    }
    case 'purgePhotos':
      if (!isMonth(body.month)) return null
      return { action: 'purgePhotos', month: body.month }
    default:
      return null
  }
}

/** 今天是哪个逻辑日，由用户的时区决定。用户还没同步过时区就没有答案。 */
async function todayOf(store: Store, caller: Caller, now: Date): Promise<string | null> {
  const user = await store.getUser(caller.userId)
  return user === null ? null : logicalDate(now, user.timeZone)
}

export async function handle(
  store: Store,
  caller: Caller,
  now: Date,
  raw: unknown,
  media?: MediaChecker,
): Promise<Response> {
  const request = parseRequest(raw)
  if (request === null) return { ok: false, error: 'bad_request' }

  switch (request.action) {
    case 'sync': {
      const result = await syncUser(store, caller, now, {
        timeZone: request.timeZone,
        nickname: request.nickname,
      })
      return result.ok ? { ok: true, data: { created: result.created } } : result
    }
    case 'saveMeals': {
      const result = await saveMeals(store, caller, now, request.clocks)
      return result.ok ? { ok: true, data: { effectiveOn: result.effectiveOn } } : result
    }
    case 'checkin': {
      const date = await todayOf(store, caller, now)
      if (date === null) return { ok: false, error: 'no_user' }
      const result = await finishCheckin(store, caller, now, { date, meal: request.meal, photos: request.photos })
      if (result.ok && media) await submitPhotos(store, media, caller, { date, meal: request.meal })
      return result
    }
    case 'snack': {
      const result = await recordSnack(store, caller, now, { photos: request.photos })
      if (result.ok && media) {
        const date = await todayOf(store, caller, now)
        if (date !== null) await submitSnackPhotos(store, media, caller, { date })
      }
      return result.ok ? { ok: true, data: { merged: result.merged } } : result
    }
    case 'exempt': {
      const date = await todayOf(store, caller, now)
      if (date === null) return { ok: false, error: 'no_user' }
      const result = await useStaple(store, caller, now, { date, meal: request.meal })
      return result.ok ? { ok: true, data: { stapleLeft: result.stapleLeft } } : result
    }
    case 'deleteCheckin': {
      const result = await removeCheckin(store, caller, now, {
        date: request.date,
        meal: request.meal,
      })
      return result.ok ? { ok: true, data: { effect: result.effect } } : result
    }
    case 'deleteSnack':
      return removeSnack(store, caller, { date: request.date, startedAt: request.startedAt })
    case 'annotate':
      if (request.kind === 'meal') {
        return setAnnotation(store, caller, now, {
          kind: 'meal',
          date: request.date,
          meal: request.meal,
          text: request.text,
        })
      }
      return setAnnotation(store, caller, now, {
        kind: 'snack',
        date: request.date,
        startedAt: request.startedAt,
        text: request.text,
      })
    case 'adopt': {
      const result = await adoptPet(store, caller, now, { name: request.name, species: request.species })
      return result.ok ? { ok: true, data: { name: result.name } } : result
    }
    case 'closeAccount': {
      const result = await closeAccount(store, caller.userId)
      return result.ok ? { ok: true, data: { photos: result.photos } } : result
    }
    case 'photoPurge': {
      if ((await store.getUser(caller.userId)) === null) return { ok: false, error: 'no_user' }
      const notice = await photoPurgeNotice(store, caller, now, request.noted)
      return { ok: true, data: { notice } }
    }
    case 'purgePhotos': {
      if ((await store.getUser(caller.userId)) === null) return { ok: false, error: 'no_user' }
      await clearExpiredPhotos(store, caller, now, request.month)
      return { ok: true }
    }
    case 'home':
    case 'gallery':
    case 'adoptView':
    case 'me':
    case 'memorial': {
      if ((await store.getUser(caller.userId)) === null) return { ok: false, error: 'no_user' }
      if (request.action === 'home') return { ok: true, data: await homeView(store, caller, now) }
      if (request.action === 'gallery') {
        return { ok: true, data: await galleryView(store, caller, now, request.date, request.month) }
      }
      if (request.action === 'me') return { ok: true, data: await meView(store, caller) }
      if (request.action === 'memorial') return { ok: true, data: await memorialView(store, caller, now, request.id) }
      return { ok: true, data: await adoptView(store, caller, now) }
    }
  }
}
