import { MEALS } from '../../domain/index.ts'
import { reviewDeadline } from '../../domain/settlement.ts'
import type { Store } from '../../app/ports.ts'
import type {
  MealRecordDoc,
  PetDoc,
  SettlementDoc,
  SettlementJobDoc,
  SnackDoc,
  TraceDoc,
  UserDoc,
} from '../../app/types.ts'

/** 小程序本地缓存。一个文档一个 key，单条不超过 1MB。 */
export type KeyValue = {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

const LIMIT = 1_000_000
const queues = new WeakMap<KeyValue, Map<string, Promise<unknown>>>()

function tailsFor(kv: KeyValue): Map<string, Promise<unknown>> {
  const found = queues.get(kv)
  if (found) return found
  const created = new Map<string, Promise<unknown>>()
  queues.set(kv, created)
  return created
}

function utf8Length(value: string): number {
  let size = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code < 0x80) size += 1
    else if (code < 0x800) size += 2
    else if (code >= 0xd800 && code <= 0xdbff) {
      size += 4
      index += 1
    } else size += 3
  }
  return size
}

function id(...parts: string[]): string {
  return parts.map((part) => encodeURIComponent(part)).join(':')
}

export function createLocalStore(kv: KeyValue): Store {
  const tails = tailsFor(kv)

  async function read<T>(key: string): Promise<T | null> {
    const raw = await kv.get(key)
    if (raw === null) return null
    return JSON.parse(raw) as T
  }

  async function write(key: string, value: unknown): Promise<void> {
    const raw = JSON.stringify(value)
    if (utf8Length(raw) > LIMIT) throw new Error('storage_full')
    await kv.set(key, raw)
  }

  async function readList(key: string): Promise<string[]> {
    return (await read<string[]>(key)) ?? []
  }

  async function addUnique(key: string, value: string): Promise<void> {
    const list = await readList(key)
    if (!list.includes(value)) await write(key, [...list, value])
  }

  async function rememberDate(userId: string, date: string): Promise<void> {
    await addUnique(id('idx-dates', userId), date)
  }

  async function forgetDateIfEmpty(userId: string, date: string): Promise<void> {
    const meals = await Promise.all(MEALS.map((meal) => read(id('rec', userId, date, meal))))
    const snacks = await readList(id('idx-snacks', userId, date))
    const jobs = await Promise.all(MEALS.map((meal) => read(id('job', userId, date, meal))))
    const settlements = await Promise.all(MEALS.map((meal) => read(id('stl', userId, date, meal))))
    const kept = meals.some((meal) => meal !== null)
      || snacks.length > 0
      || jobs.some((job) => job !== null)
      || settlements.some((row) => row !== null)
    if (kept) return
    const dates = (await readList(id('idx-dates', userId))).filter((item) => item !== date)
    await write(id('idx-dates', userId), dates)
  }

  async function loadJobs(): Promise<SettlementJobDoc[]> {
    const keys = await readList(id('idx-jobs'))
    const jobs = await Promise.all(keys.map((key) => read<SettlementJobDoc>(key)))
    return jobs.filter((job): job is SettlementJobDoc => job !== null)
  }

  return {
    runExclusive<T>(subjectId: string, fn: () => Promise<T>): Promise<T> {
      const previous = tails.get(subjectId) ?? Promise.resolve()
      const run = previous.then(fn, fn)
      tails.set(subjectId, run.catch(() => undefined))
      return run
    },

    async getUser(userId) {
      return read<UserDoc>(id('user', userId))
    },
    async saveUser(doc) {
      await write(id('user', doc.userId), doc)
      await addUnique(id('idx-users'), doc.userId)
    },
    async deleteUser(userId) {
      await kv.remove(id('user', userId))
      const ids = (await readList(id('idx-users'))).filter((item) => item !== userId)
      await write(id('idx-users'), ids)
    },
    async listUserIds() {
      return readList(id('idx-users'))
    },

    async getPet(userId) {
      return read<PetDoc>(id('pet', userId))
    },
    async savePet(doc) {
      await write(id('pet', doc.userId), doc)
    },
    async deletePet(userId) {
      await kv.remove(id('pet', userId))
    },

    async getRecord(userId, date, meal) {
      return read<MealRecordDoc>(id('rec', userId, date, meal))
    },
    async saveRecord(doc) {
      await write(id('rec', doc.userId, doc.date, doc.meal), doc)
      await rememberDate(doc.userId, doc.date)
    },
    async deleteRecord(userId, date, meal) {
      await kv.remove(id('rec', userId, date, meal))
      await forgetDateIfEmpty(userId, date)
    },
    async listRecords(userId, date) {
      const rows = await Promise.all(MEALS.map((meal) => read<MealRecordDoc>(id('rec', userId, date, meal))))
      return rows.filter((row): row is MealRecordDoc => row !== null)
    },
    async listDates(userId) {
      return readList(id('idx-dates', userId))
    },

    async listSnacks(userId, date) {
      const starts = await readList(id('idx-snacks', userId, date))
      const rows = await Promise.all(starts.map((startedAt) => read<SnackDoc>(id('snack', userId, date, startedAt))))
      return rows.filter((row): row is SnackDoc => row !== null).sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    },
    async saveSnack(doc) {
      await write(id('snack', doc.userId, doc.date, doc.startedAt), doc)
      await addUnique(id('idx-snacks', doc.userId, doc.date), doc.startedAt)
      await rememberDate(doc.userId, doc.date)
    },
    async deleteSnack(userId, date, startedAt) {
      await kv.remove(id('snack', userId, date, startedAt))
      const starts = (await readList(id('idx-snacks', userId, date))).filter((item) => item !== startedAt)
      await write(id('idx-snacks', userId, date), starts)
      await forgetDateIfEmpty(userId, date)
    },

    async getJob(subjectId, date, meal) {
      return read<SettlementJobDoc>(id('job', subjectId, date, meal))
    },
    async saveJob(doc) {
      const key = id('job', doc.subjectId, doc.date, doc.meal)
      await write(key, doc)
      await addUnique(id('idx-jobs'), key)
      await rememberDate(doc.subjectId, doc.date)
    },
    async deleteJob(subjectId, date, meal) {
      const key = id('job', subjectId, date, meal)
      await kv.remove(key)
      const left = (await readList(id('idx-jobs'))).filter((item) => item !== key)
      await write(id('idx-jobs'), left)
      await forgetDateIfEmpty(subjectId, date)
    },
    async listPendingJobs(nowIso) {
      const jobs = await loadJobs()
      return jobs.filter((job) => job.status === 'pending' && job.windowEndAt <= nowIso)
    },
    async listHeldJobs(nowIso) {
      const now = new Date(nowIso)
      const jobs = await loadJobs()
      return jobs.filter((job) => job.status === 'waiting_review' && now >= reviewDeadline(new Date(job.windowEndAt)))
    },
    async listFrozenJobs(subjectId) {
      const jobs = await loadJobs()
      return jobs.filter((job) => job.subjectId === subjectId && (job.status === 'waiting_review' || job.status === 'manual_review'))
    },

    async getSettlement(subjectId, date, meal) {
      return read<SettlementDoc>(id('stl', subjectId, date, meal))
    },
    async saveSettlement(doc) {
      await write(id('stl', doc.subjectId, doc.date, doc.meal), doc)
      await rememberDate(doc.subjectId, doc.date)
    },
    async deleteSettlement(subjectId, date, meal) {
      await kv.remove(id('stl', subjectId, date, meal))
      await forgetDateIfEmpty(subjectId, date)
    },

    async getTrace(traceId) {
      return read<TraceDoc>(id('trace', traceId))
    },
    async saveTrace(doc) {
      await write(id('trace', doc.traceId), doc)
    },
  }
}
