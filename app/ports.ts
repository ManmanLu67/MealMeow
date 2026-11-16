import type {
  MealRecordDoc,
  PetDoc,
  SettlementDoc,
  SettlementJobDoc,
  UserDoc,
} from './types.ts'

/**
 * 命令层需要的存储，只有接口。云数据库、手机本地数据库、后端服务各写一个实现，
 * 放在 adapters/ 下。app/ 不 import 任何实现，也不知道数据放在哪。
 */
export type Store = {
  /**
   * 同一个主体的写命令串行执行。云数据库适配器用事务或锁文档实现，
   * 手机本地库用单写入队列。命令内部不能再对同一个主体调用它，否则死锁。
   */
  runExclusive<T>(subjectId: string, fn: () => Promise<T>): Promise<T>
  getUser(userId: string): Promise<UserDoc | null>
  saveUser(doc: UserDoc): Promise<void>
  listUserIds(): Promise<string[]>
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
  /** 这个主体名下仍在等审核的任务。有它在，活着的宠物整体冻结。 */
  listFrozenJobs(subjectId: string): Promise<SettlementJobDoc[]>
  getSettlement(
    subjectId: string,
    date: string,
    meal: SettlementDoc['meal'],
  ): Promise<SettlementDoc | null>
  saveSettlement(doc: SettlementDoc): Promise<void>
}
