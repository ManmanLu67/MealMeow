import { handle, type Caller, type Response } from './handle.ts'
import { acceptPendingPhotos } from './local-pass.ts'
import { clearExpiredPhotos } from './retention.ts'
import { runDueJobs } from './settle.ts'
import { exportBackup, importBackup } from './backup.ts'
import type { Store } from './ports.ts'

export type LocalResponse =
  | { ok: true; data?: unknown; droppedPhotos: string[] }
  | { ok: false; error: string }

function actionOf(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null
  const action = (raw as { action?: unknown }).action
  return typeof action === 'string' ? action : null
}

function hideMissing(data: unknown, fileExists: (path: string) => boolean): unknown {
  if (typeof data !== 'object' || data === null) return data
  const body = { ...(data as Record<string, unknown>) }
  if (Array.isArray(body.photos)) {
    body.photos = body.photos.filter((item) => {
      if (typeof item !== 'object' || item === null || !('src' in item)) return true
      return fileExists((item as { src: string }).src)
    })
  }
  if (Array.isArray(body.meals)) {
    body.meals = body.meals.map((item) => {
      if (typeof item !== 'object' || item === null) return item
      const meal = item as { photo?: string | null; face?: string }
      if (typeof meal.photo !== 'string' || fileExists(meal.photo)) return meal
      return { ...meal, photo: null, face: meal.face === 'photo' ? 'kept' : meal.face }
    })
  }
  if (Array.isArray(body.snacks)) {
    body.snacks = body.snacks.filter((item) => {
      if (typeof item !== 'object' || item === null) return true
      const photo = (item as { photo?: unknown }).photo
      return typeof photo !== 'string' || fileExists(photo)
    })
  }
  return body
}

function finish(result: Response, droppedPhotos: string[], fileExists?: (path: string) => boolean): LocalResponse {
  if (!result.ok) return result
  const data = fileExists && result.data !== undefined ? hideMissing(result.data, fileExists) : result.data
  return { ok: true, data, droppedPhotos }
}

/** 小程序入口。打卡先标通过再结算；打开页面时先结算再清过期照片。 */
export async function openLocal(
  store: Store,
  caller: Caller,
  now: Date,
  raw: unknown,
  fileExists?: (path: string) => boolean,
): Promise<LocalResponse> {
  const action = actionOf(raw)
  if (action === 'export') {
    if ((await store.getUser(caller.userId)) === null) return { ok: false, error: 'no_user' }
    return { ok: true, data: await exportBackup(store, caller.userId), droppedPhotos: [] }
  }
  if (action === 'import') {
    const backup = typeof raw === 'object' && raw !== null ? (raw as { backup?: unknown }).backup : undefined
    const result = await importBackup(store, backup, caller.userId)
    return result.ok ? { ok: true, droppedPhotos: [] } : result
  }

  if (action === 'checkin' || action === 'snack') {
    const result = await handle(store, caller, now, raw)
    if (result.ok) await acceptPendingPhotos(store, caller, now)
    if (result.ok) await runDueJobs(store, now)
    return finish(result, [])
  }

  if ((await store.getUser(caller.userId)) === null) {
    return finish(await handle(store, caller, now, raw), [])
  }
  await runDueJobs(store, now)
  const droppedPhotos = await clearExpiredPhotos(store, caller, now)
  return finish(await handle(store, caller, now, raw), droppedPhotos, fileExists)
}
