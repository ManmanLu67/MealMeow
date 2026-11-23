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
import type { CloudDb, CloudQuery } from './cloud-db.ts'

const USERS = 'users'
const PETS = 'pets'
const RECORDS = 'meal_records'
const SNACKS = 'snacks'
const JOBS = 'settlement_jobs'
const SETTLEMENTS = 'settlements'
const LOCKS = 'locks'
const TRACES = 'traces'
const PAGE = 100
const LOCK_MS = 15_000
const WAIT_MS = 5_000

function docId(...parts: string[]): string {
  // 前缀避开 24 位纯十六进制。微信把那种 _id 当成 Mongo ObjectId。
  const body = parts.map((part) => part.replace(/[^A-Za-z0-9-]/g, '_')).join('__')
  return `r_${body}`
}

function stored<T>(doc: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(doc)) as Record<string, unknown>
}

async function collect(
  db: CloudDb,
  collection: string,
  where: CloudQuery['where'],
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let skip = 0; ; skip += PAGE) {
    const rows = await db.query(collection, { where, limit: PAGE, skip })
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 云数据库上的 Store。文档 ID 由用户、日期、餐次拼成，一餐一行。
 * 零食在计划写成之后才加入 Store，单独放 snacks，ID 再加起点时刻。
 * runExclusive 抢 locks 文档，带过期时间，函数崩溃后不会一直占着。
 */
export function createCloudStore(db: CloudDb): Store {
  return {
    async runExclusive(subjectId, fn) {
      const id = docId(subjectId)
      const deadline = Date.now() + WAIT_MS
      while (Date.now() <= deadline) {
        const acquired = await db.runTransaction(async (tx) => {
          const lock = await tx.get(LOCKS, id)
          const now = Date.now()
          const until = typeof lock?.until === 'number' ? lock.until : 0
          if (until > now) return false
          await tx.set(LOCKS, id, { until: now + LOCK_MS })
          return true
        })
        if (acquired) {
          try {
            return await fn()
          } finally {
            await db.remove(LOCKS, id)
          }
        }
        await sleep(5)
      }
      throw new Error('lock_timeout')
    },

    async getUser(userId) {
      return (await db.get(USERS, docId(userId))) as UserDoc | null
    },
    async saveUser(doc) {
      await db.set(USERS, docId(doc.userId), stored(doc))
    },
    async deleteUser(userId) {
      await db.remove(USERS, docId(userId))
    },
    async listUserIds() {
      const rows = await collect(db, USERS, {})
      return rows.map((row) => (row as UserDoc).userId)
    },

    async getPet(userId) {
      return (await db.get(PETS, docId(userId))) as PetDoc | null
    },
    async savePet(doc) {
      await db.set(PETS, docId(doc.userId), stored(doc))
    },
    async deletePet(userId) {
      await db.remove(PETS, docId(userId))
    },

    async getRecord(userId, date, meal) {
      return (await db.get(RECORDS, docId(userId, date, meal))) as MealRecordDoc | null
    },
    async saveRecord(doc) {
      await db.set(RECORDS, docId(doc.userId, doc.date, doc.meal), stored(doc))
    },
    async deleteRecord(userId, date, meal) {
      await db.remove(RECORDS, docId(userId, date, meal))
    },
    async listRecords(userId, date) {
      const rows = await collect(db, RECORDS, { userId, date })
      return rows as MealRecordDoc[]
    },
    async listDates(userId) {
      const meals = (await collect(db, RECORDS, { userId })) as MealRecordDoc[]
      const snacks = (await collect(db, SNACKS, { userId })) as SnackDoc[]
      const jobs = (await collect(db, JOBS, { subjectId: userId })) as SettlementJobDoc[]
      const settlements = (await collect(db, SETTLEMENTS, { subjectId: userId })) as SettlementDoc[]
      return [...new Set([
        ...meals.map((row) => row.date),
        ...snacks.map((row) => row.date),
        ...jobs.map((row) => row.date),
        ...settlements.map((row) => row.date),
      ])]
    },

    async listSnacks(userId, date) {
      const rows = (await collect(db, SNACKS, { userId, date })) as SnackDoc[]
      return rows.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    },
    async saveSnack(doc) {
      await db.set(SNACKS, docId(doc.userId, doc.date, doc.startedAt), stored(doc))
    },
    async deleteSnack(userId, date, startedAt) {
      await db.remove(SNACKS, docId(userId, date, startedAt))
    },

    async getJob(subjectId, date, meal) {
      return (await db.get(JOBS, docId(subjectId, date, meal))) as SettlementJobDoc | null
    },
    async saveJob(doc) {
      await db.set(JOBS, docId(doc.subjectId, doc.date, doc.meal), stored(doc))
    },
    async deleteJob(subjectId, date, meal) {
      await db.remove(JOBS, docId(subjectId, date, meal))
    },
    async listPendingJobs(nowIso) {
      const rows = await collect(db, JOBS, { status: 'pending', windowEndAt: { lte: nowIso } })
      return rows as SettlementJobDoc[]
    },
    async listHeldJobs(nowIso) {
      const now = new Date(nowIso)
      const rows = (await collect(db, JOBS, { status: 'waiting_review' })) as SettlementJobDoc[]
      return rows.filter((job) => now >= reviewDeadline(new Date(job.windowEndAt)))
    },
    async listFrozenJobs(subjectId) {
      const rows = (await collect(db, JOBS, { subjectId })) as SettlementJobDoc[]
      return rows.filter((job) => job.status === 'waiting_review' || job.status === 'manual_review')
    },

    async getSettlement(subjectId, date, meal) {
      return (await db.get(SETTLEMENTS, docId(subjectId, date, meal))) as SettlementDoc | null
    },
    async saveSettlement(doc) {
      await db.set(SETTLEMENTS, docId(doc.subjectId, doc.date, doc.meal), stored(doc))
    },
    async deleteSettlement(subjectId, date, meal) {
      await db.remove(SETTLEMENTS, docId(subjectId, date, meal))
    },
    async getTrace(traceId) {
      return (await db.get(TRACES, docId(traceId))) as TraceDoc | null
    },
    async saveTrace(doc) {
      await db.set(TRACES, docId(doc.traceId), stored(doc))
    },
  }
}
