import type { MealType } from '../domain/index.ts'
import type { Store } from './ports.ts'
import type { Annotation, MealRecordDoc, SnackDoc } from './types.ts'
import { requireUser } from './user.ts'

const MAX_ANNOTATION = 200

type Input =
  | { kind: 'meal'; date: string; meal: MealType; text: string }
  | { kind: 'snack'; date: string; startedAt: string; text: string }

type Fail = { ok: false; error: string }

function annotationLength(text: string): number {
  return [...text.trim()].length
}

function withoutNote<T extends MealRecordDoc | SnackDoc>(doc: T): T {
  const { note: _note, ...rest } = doc
  return rest as T
}

export async function setAnnotation(
  store: Store,
  caller: { userId: string },
  now: Date,
  input: Input,
): Promise<{ ok: true } | Fail> {
  return store.runExclusive(caller.userId, async () => {
    await requireUser(store, caller.userId)
    const at = now.toISOString()

    if (input.kind === 'meal') {
      const record = await store.getRecord(caller.userId, input.date, input.meal)
      if (record === null) return { ok: false, error: '无这条记录' }
      if (record.status === 'exempt') return { ok: false, error: '口粮没有批注' }
      if (annotationLength(input.text) > MAX_ANNOTATION) return { ok: false, error: '批注太长' }
      if (input.text.trim().length === 0) {
        await store.saveRecord(withoutNote(record))
        return { ok: true }
      }
      const text = input.text.trim()
      const note: Annotation = record.note
        ? { text, createdAt: record.note.createdAt, updatedAt: at }
        : { text, createdAt: at, updatedAt: at }
      await store.saveRecord({ ...record, note })
      return { ok: true }
    }

    const found = (await store.listSnacks(caller.userId, input.date)).find(
      (s) => s.startedAt === input.startedAt,
    )
    if (found === undefined) return { ok: false, error: '无这条记录' }
    if (annotationLength(input.text) > MAX_ANNOTATION) return { ok: false, error: '批注太长' }
    if (input.text.trim().length === 0) {
      await store.saveSnack(withoutNote(found))
      return { ok: true }
    }
    const text = input.text.trim()
    const note: Annotation = found.note
      ? { text, createdAt: found.note.createdAt, updatedAt: at }
      : { text, createdAt: at, updatedAt: at }
    await store.saveSnack({ ...found, note })
    return { ok: true }
  })
}