import { reviewDeadline } from '../domain/settlement.ts'
import type {
  MealRecordDoc,
  PetDoc,
  SettlementDoc,
  SettlementJobDoc,
  UserDoc,
} from './types.ts'

export type Store = {
  getUser(userId: string): Promise<UserDoc | null>
  saveUser(doc: UserDoc): Promise<void>
  getPet(userId: string): Promise<PetDoc | null>
  savePet(doc: PetDoc): Promise<void>
  getRecord(userId: string, date: string, meal: MealRecordDoc['meal']): Promise<MealRecordDoc | null>
  saveRecord(doc: MealRecordDoc): Promise<void>
  deleteRecord(userId: string, date: string, meal: MealRecordDoc['meal']): Promise<void>
  listRecords(userId: string, date: string): Promise<MealRecordDoc[]>
  getJob(subjectId: string, date: string, meal: SettlementJobDoc['meal']): Promise<SettlementJobDoc | null>
  saveJob(doc: SettlementJobDoc): Promise<void>
  listPendingJobs(nowIso: string): Promise<SettlementJobDoc[]>
  listHeldJobs(nowIso: string): Promise<SettlementJobDoc[]>
  getSettlement(
    subjectId: string,
    date: string,
    meal: SettlementDoc['meal'],
  ): Promise<SettlementDoc | null>
  saveSettlement(doc: SettlementDoc): Promise<void>
}

function recordKey(userId: string, date: string, meal: string): string {
  return `${userId}\0${date}\0${meal}`
}

function subjectMealKey(subjectId: string, date: string, meal: string): string {
  return `${subjectId}\0${date}\0${meal}`
}

export function createMemoryStore(): Store {
  const users = new Map<string, UserDoc>()
  const pets = new Map<string, PetDoc>()
  const records = new Map<string, MealRecordDoc>()
  const jobs = new Map<string, SettlementJobDoc>()
  const settlements = new Map<string, SettlementDoc>()

  return {
    async getUser(userId) {
      return users.get(userId) ?? null
    },
    async saveUser(doc) {
      users.set(doc.userId, doc)
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
    async getSettlement(subjectId, date, meal) {
      return settlements.get(subjectMealKey(subjectId, date, meal)) ?? null
    },
    async saveSettlement(doc) {
      settlements.set(subjectMealKey(doc.subjectId, doc.date, doc.meal), doc)
    },
  }
}
