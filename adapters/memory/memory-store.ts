import { reviewDeadline } from '../../domain/settlement.ts'
import type { Store } from '../../app/ports.ts'
import type {
  MealRecordDoc,
  PetDoc,
  SettlementDoc,
  SettlementJobDoc,
  SnackDoc,
  UserDoc,
} from '../../app/types.ts'

function snackKey(userId: string, date: string, startedAt: string): string {
  return `${userId}\0${date}\0${startedAt}`
}

function recordKey(userId: string, date: string, meal: string): string {
  return `${userId}\0${date}\0${meal}`
}

function subjectMealKey(subjectId: string, date: string, meal: string): string {
  return `${subjectId}\0${date}\0${meal}`
}

/**
 * 内存实现。测试用，也可以作为手机端第一版的本地存储（进程退出就丢，只适合原型）。
 * 它是适配器，不属于命令层，所以放在 adapters/ 下。
 */
export function createMemoryStore(): Store {
  const users = new Map<string, UserDoc>()
  const pets = new Map<string, PetDoc>()
  const records = new Map<string, MealRecordDoc>()
  const jobs = new Map<string, SettlementJobDoc>()
  const settlements = new Map<string, SettlementDoc>()
  const snacks = new Map<string, SnackDoc>()
  const tails = new Map<string, Promise<unknown>>()

  return {
    runExclusive<T>(subjectId: string, fn: () => Promise<T>): Promise<T> {
      const previous = tails.get(subjectId) ?? Promise.resolve()
      const run = previous.then(fn, fn)
      tails.set(subjectId, run.catch(() => undefined))
      return run
    },
    async getUser(userId) {
      return users.get(userId) ?? null
    },
    async saveUser(doc) {
      users.set(doc.userId, doc)
    },
    async listUserIds() {
      return [...users.keys()]
    },
    async getPet(userId) {
      return pets.get(userId) ?? null
    },
    async savePet(doc) {
      pets.set(doc.userId, doc)
    },
    async getRecord(userId, date, meal) {
      return records.get(recordKey(userId, date, meal)) ?? null
    },
    async saveRecord(doc) {
      records.set(recordKey(doc.userId, doc.date, doc.meal), doc)
    },
    async deleteRecord(userId, date, meal) {
      records.delete(recordKey(userId, date, meal))
    },
    async listRecords(userId, date) {
      const out: MealRecordDoc[] = []
      for (const doc of records.values()) {
        if (doc.userId === userId && doc.date === date) out.push(doc)
      }
      return out
    },
    async listSnacks(userId, date) {
      const out: SnackDoc[] = []
      for (const doc of snacks.values()) {
        if (doc.userId === userId && doc.date === date) out.push(doc)
      }
      return out.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    },
    async saveSnack(doc) {
      snacks.set(snackKey(doc.userId, doc.date, doc.startedAt), doc)
    },
    async deleteSnack(userId, date, startedAt) {
      snacks.delete(snackKey(userId, date, startedAt))
    },
    async getJob(subjectId, date, meal) {
      return jobs.get(subjectMealKey(subjectId, date, meal)) ?? null
    },
    async saveJob(doc) {
      jobs.set(subjectMealKey(doc.subjectId, doc.date, doc.meal), doc)
    },
    async listPendingJobs(nowIso) {
      const out: SettlementJobDoc[] = []
      for (const job of jobs.values()) {
        if (job.status === 'pending' && job.windowEndAt <= nowIso) out.push(job)
      }
      return out
    },
    async listHeldJobs(nowIso) {
      const now = new Date(nowIso)
      const out: SettlementJobDoc[] = []
      for (const job of jobs.values()) {
        if (job.status !== 'waiting_review') continue
        if (now >= reviewDeadline(new Date(job.windowEndAt))) out.push(job)
      }
      return out
    },
    async listFrozenJobs(subjectId) {
      const out: SettlementJobDoc[] = []
      for (const job of jobs.values()) {
        if (job.subjectId !== subjectId) continue
        if (job.status === 'waiting_review' || job.status === 'manual_review') out.push(job)
      }
      return out
    },
    async getSettlement(subjectId, date, meal) {
      return settlements.get(subjectMealKey(subjectId, date, meal)) ?? null
    },
    async saveSettlement(doc) {
      settlements.set(subjectMealKey(doc.subjectId, doc.date, doc.meal), doc)
    },
  }
}
