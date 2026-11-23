import { MEALS } from '../domain/index.ts'
import type { Store } from './ports.ts'
import type {
  MealRecordDoc,
  PetDoc,
  SettlementDoc,
  SettlementJobDoc,
  SnackDoc,
  UserDoc,
} from './types.ts'

export type LocalBackup = {
  version: 1
  user: UserDoc
  pet: PetDoc | null
  records: MealRecordDoc[]
  snacks: SnackDoc[]
  jobs: SettlementJobDoc[]
  settlements: SettlementDoc[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isMeal(value: unknown): value is MealRecordDoc['meal'] {
  return value === 'breakfast' || value === 'lunch' || value === 'dinner'
}

function isClock(value: unknown): boolean {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)
}

function isUser(value: unknown): value is UserDoc {
  if (!isObject(value)) return false
  if (typeof value.userId !== 'string' || value.userId === '') return false
  if (typeof value.timeZone !== 'string' || value.timeZone === '') return false
  if (typeof value.nickname !== 'string') return false
  if (!isObject(value.meals)) return false
  return isClock(value.meals.breakfast) && isClock(value.meals.lunch) && isClock(value.meals.dinner)
}

function isPet(value: unknown): value is PetDoc {
  if (!isObject(value)) return false
  return typeof value.userId === 'string'
    && typeof value.name === 'string'
    && typeof value.hunger === 'number'
    && typeof value.alive === 'boolean'
    && typeof value.adoptedOn === 'string'
}

function isRecord(value: unknown): value is MealRecordDoc {
  if (!isObject(value)) return false
  return typeof value.userId === 'string'
    && typeof value.date === 'string'
    && isMeal(value.meal)
    && typeof value.status === 'string'
    && typeof value.review === 'string'
    && Array.isArray(value.photos)
}

function isSnack(value: unknown): value is SnackDoc {
  if (!isObject(value)) return false
  return typeof value.userId === 'string' && typeof value.date === 'string' && typeof value.startedAt === 'string'
}

function isJob(value: unknown): value is SettlementJobDoc {
  if (!isObject(value)) return false
  return typeof value.subjectId === 'string'
    && typeof value.date === 'string'
    && isMeal(value.meal)
    && typeof value.windowEndAt === 'string'
    && typeof value.status === 'string'
}

function isSettlement(value: unknown): value is SettlementDoc {
  if (!isObject(value)) return false
  return typeof value.subjectId === 'string'
    && typeof value.date === 'string'
    && isMeal(value.meal)
    && (value.outcome === 'fed' || value.outcome === 'starved')
}

function isBackup(value: unknown): value is LocalBackup {
  if (!isObject(value) || value.version !== 1) return false
  if (!isUser(value.user)) return false
  if (value.pet !== null && !isPet(value.pet)) return false
  return Array.isArray(value.records) && value.records.every(isRecord)
    && Array.isArray(value.snacks) && value.snacks.every(isSnack)
    && Array.isArray(value.jobs) && value.jobs.every(isJob)
    && Array.isArray(value.settlements) && value.settlements.every(isSettlement)
}

function placed(backup: LocalBackup, userId: string): LocalBackup {
  return {
    version: 1,
    user: { ...backup.user, userId },
    pet: backup.pet === null ? null : { ...backup.pet, userId },
    records: backup.records.map((row) => ({ ...row, userId })),
    snacks: backup.snacks.map((row) => ({ ...row, userId })),
    jobs: backup.jobs.map((row) => ({ ...row, subjectId: userId })),
    settlements: backup.settlements.map((row) => ({ ...row, subjectId: userId })),
  }
}

async function clearAccount(store: Store, userId: string): Promise<void> {
  for (const date of await store.listDates(userId)) {
    for (const meal of MEALS) {
      await store.deleteRecord(userId, date, meal)
      await store.deleteJob(userId, date, meal)
      await store.deleteSettlement(userId, date, meal)
    }
    for (const snack of await store.listSnacks(userId, date)) {
      await store.deleteSnack(userId, date, snack.startedAt)
    }
  }
  await store.deletePet(userId)
  await store.deleteUser(userId)
}

async function accountPhotos(store: Store, userId: string): Promise<string[]> {
  const photos: string[] = []
  for (const date of await store.listDates(userId)) {
    for (const row of await store.listRecords(userId, date)) photos.push(...row.photos)
    for (const snack of await store.listSnacks(userId, date)) photos.push(...snack.photos)
  }
  return photos
}

/** 注销：删掉这个用户的记录、宠物和账号。照片路径交给调用方删文件。 */
export async function closeAccount(
  store: Store,
  userId: string,
): Promise<{ ok: true; photos: string[] } | { ok: false; error: string }> {
  return store.runExclusive(userId, async () => {
    if ((await store.getUser(userId)) === null) return { ok: false, error: 'no_user' }
    const photos = await accountPhotos(store, userId)
    await clearAccount(store, userId)
    return { ok: true, photos }
  })
}

export async function exportBackup(store: Store, userId: string): Promise<LocalBackup> {
  return store.runExclusive(userId, async () => {
    const found = await store.getUser(userId)
    if (found === null) throw new Error('no_user')
    const dates = await store.listDates(userId)
    const records: MealRecordDoc[] = []
    const snacks: SnackDoc[] = []
    const jobs: SettlementJobDoc[] = []
    const settlements: SettlementDoc[] = []
    for (const date of dates) {
      records.push(...await store.listRecords(userId, date))
      snacks.push(...await store.listSnacks(userId, date))
      for (const meal of MEALS) {
        const job = await store.getJob(userId, date, meal)
        if (job) jobs.push(job)
        const settlement = await store.getSettlement(userId, date, meal)
        if (settlement) settlements.push(settlement)
      }
    }
    return {
      version: 1,
      user: found,
      pet: await store.getPet(userId),
      records,
      snacks,
      jobs,
      settlements,
    }
  })
}

export async function importBackup(
  store: Store,
  backup: unknown,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof userId !== 'string' || userId === '' || !isBackup(backup)) return { ok: false, error: '无法导入' }
  const next = placed(backup, userId)
  const sourceId = backup.user.userId
  await store.runExclusive(userId, async () => {
    if (sourceId !== userId) await store.runExclusive(sourceId, () => clearAccount(store, sourceId))
    await clearAccount(store, userId)
    await store.saveUser(next.user)
    if (next.pet) await store.savePet(next.pet)
    for (const row of next.records) await store.saveRecord(row)
    for (const row of next.snacks) await store.saveSnack(row)
    for (const row of next.jobs) await store.saveJob(row)
    for (const row of next.settlements) await store.saveSettlement(row)
  })
  return { ok: true }
}
