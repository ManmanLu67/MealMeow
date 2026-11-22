import { applyReview } from './settle.ts'
import { applySnackReview } from './snack.ts'
import type { Store } from './ports.ts'
import type { MealType } from '../domain/index.ts'
import type { TraceDoc } from './types.ts'

export type MediaChecker = {
  submitMedia(photo: string): Promise<{ traceId: string }>
}

export type ReviewCallbackDeps = {
  store: Store
  now: Date
  verifySignature(body: unknown): boolean
}

/**
 * 打卡已经写好之后再提交。某一张提交失败就留下空的追踪号，不撤掉这餐。
 */
export async function submitPhotos(
  store: Store,
  checker: MediaChecker,
  caller: { userId: string },
  input: { date: string; meal: MealType },
): Promise<void> {
  await store.runExclusive(caller.userId, async () => {
    const record = await store.getRecord(caller.userId, input.date, input.meal)
    if (record === null || record.status !== 'checked_in') return
    const traceIds = await fillTraces(store, checker, caller.userId, {
      date: input.date,
      photos: record.photos,
      traceIds: record.traceIds,
      meal: input.meal,
      startedAt: null,
    })
    if (traceIds !== null) await store.saveRecord({ ...record, traceIds })
  })
}

/** 当天零食里还没提交成功的照片。合并进旧的一份时，只补新的那几张。 */
export async function submitSnackPhotos(
  store: Store,
  checker: MediaChecker,
  caller: { userId: string },
  input: { date: string },
): Promise<void> {
  await store.runExclusive(caller.userId, async () => {
    const snacks = await store.listSnacks(caller.userId, input.date)
    for (const snack of snacks) {
      const traceIds = await fillTraces(store, checker, caller.userId, {
        date: input.date,
        photos: snack.photos,
        traceIds: snack.traceIds,
        meal: null,
        startedAt: snack.startedAt,
      })
      if (traceIds !== null) await store.saveSnack({ ...snack, traceIds })
    }
  })
}

async function fillTraces(
  store: Store,
  checker: MediaChecker,
  userId: string,
  input: {
    date: string
    photos: readonly string[]
    traceIds: readonly string[] | undefined
    meal: MealType | null
    startedAt: string | null
  },
): Promise<string[] | null> {
  const traceIds = input.photos.map((_, index) => input.traceIds?.[index] ?? '')
  let changed = false
  for (let index = 0; index < input.photos.length; index += 1) {
    if (traceIds[index]) continue
    try {
      const { traceId } = await checker.submitMedia(input.photos[index])
      traceIds[index] = traceId
      const doc: TraceDoc = {
        traceId,
        userId,
        date: input.date,
        photo: input.photos[index],
        meal: input.meal,
        startedAt: input.startedAt,
      }
      await store.saveTrace(doc)
      changed = true
    } catch {
      // 这一张保持 pending，下次再提交。
    }
  }
  return changed ? traceIds : null
}

function readCallback(body: unknown): { traceId: string; suggest: string } | null {
  if (typeof body !== 'object' || body === null) return null
  const raw = body as Record<string, unknown>
  const traceId = typeof raw.traceId === 'string' ? raw.traceId : typeof raw.trace_id === 'string' ? raw.trace_id : ''
  let suggest = typeof raw.suggest === 'string' ? raw.suggest : ''
  if (!suggest && typeof raw.result === 'object' && raw.result !== null) {
    const value = (raw.result as Record<string, unknown>).suggest
    if (typeof value === 'string') suggest = value
  }
  if (!traceId || !suggest) return null
  return { traceId, suggest }
}

/**
 * 只由微信内容安全回调调用。签名不对就不读库。
 * 用户是追踪号上记的那一个，事件体里的 userId 不采用。
 */
export async function handleReviewCallback(
  body: unknown,
  deps: ReviewCallbackDeps,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!deps.verifySignature(body)) return { ok: false, error: 'bad_signature' }
  const parsed = readCallback(body)
  if (parsed === null) return { ok: false, error: 'bad_request' }
  const trace = await deps.store.getTrace(parsed.traceId)
  if (trace === null) return { ok: false, error: 'unknown_trace' }
  const review = parsed.suggest === 'pass' ? 'passed' : parsed.suggest === 'risky' ? 'rejected' : null
  if (review === null) return { ok: true }
  if (trace.meal !== null) {
    return applyReview(deps.store, { userId: trace.userId }, {
      date: trace.date,
      meal: trace.meal,
      photo: trace.photo,
      review,
    }, deps.now)
  }
  if (trace.startedAt !== null) {
    return applySnackReview(deps.store, { userId: trace.userId }, {
      date: trace.date,
      startedAt: trace.startedAt,
      photo: trace.photo,
      review,
    })
  }
  return { ok: false, error: 'unknown_trace' }
}
