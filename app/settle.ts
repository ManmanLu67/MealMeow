import {
  MEALS,
  aggregateReview,
  canAdopt,
  cooldownUntil,
  logicalDate,
  petBand,
  recordHungerDay,
  validatePetName,
} from '../domain/index.ts'
import type { MealType, PhotoReview } from '../domain/index.ts'
import { evaluateFeeding, nextHunger, settleStep } from '../domain/settlement.ts'
import { daysBetweenInclusive } from '../domain/time.ts'
import { topUpAllJobs } from './schedule.ts'
import type { Store } from './ports.ts'
import type { MealRecordDoc, PetDoc, PetSpecies, SettlementJobDoc, UserDoc } from './types.ts'

const mealRank = Object.fromEntries(MEALS.map((meal, index) => [meal, index])) as Record<
  MealType,
  number
>

function byWindowThenMeal(a: SettlementJobDoc, b: SettlementJobDoc): number {
  const byWindow = a.windowEndAt.localeCompare(b.windowEndAt)
  if (byWindow !== 0) return byWindow
  return mealRank[a.meal] - mealRank[b.meal]
}

/**
 * 宠物死亡：写 alive、结束日、用户的死亡日和冷却截止。
 * 陪伴天数取领养日到死亡日（含），在这里一次定下来。
 * 个人连续天数的算法读 user.adoptedOn 和 user.diedOn，所以这里一并写回。
 */
async function markDead(
  store: Store,
  user: UserDoc,
  pet: PetDoc,
  diedAt: Date,
): Promise<PetDoc> {
  const diedOn = logicalDate(diedAt, user.timeZone)
  const dead: PetDoc = {
    ...pet,
    alive: false,
    endedOn: diedOn,
    companyDays: daysBetweenInclusive(pet.adoptedOn, diedOn),
  }
  await store.savePet(dead)
  await store.saveUser({
    ...user,
    adoptedOn: pet.adoptedOn,
    diedOn,
    cooldownUntil: cooldownUntil(diedAt, user.timeZone).toISOString(),
  })
  return dead
}

/** 结算后给存活宠物累计吃到的餐数，陪伴天数在活着时按今天算。 */
function afterMeal(pet: PetDoc, outcome: 'fed' | 'starved', hunger: number, date: string): PetDoc {
  return {
    ...pet,
    hunger,
    mealsEaten: pet.mealsEaten + (outcome === 'fed' ? 1 : 0),
    hungerLog: recordHungerDay(pet.hungerLog ?? [], date, petBand(hunger)),
  }
}

/** 任务窗口在领养之前就结束的，宠物不为它挨饿也不进食。 */
function beforeAdoption(pet: PetDoc, windowEndAt: string): boolean {
  return windowEndAt <= pet.adoptedAt
}

/**
 * 结算一个用户名下已到期的任务。宠物整体冻结：
 * 只要这个用户还有任务在等审核，别的餐次也先不结算，
 * 这样饥饿值不依赖餐次的处理顺序。
 */
export async function runDueJobsFor(
  store: Store,
  userId: string,
  now: Date,
): Promise<{ settled: number; frozen: number }> {
  let settled = 0
  let frozen = 0
  const nowIso = now.toISOString()

  // 第一步：把等审核超过截止的转成人工复核。它们本来就是冻结的。
  for (const job of await store.listHeldJobs(nowIso)) {
    if (job.subjectId !== userId) continue
    await store.saveJob({ ...job, status: 'manual_review' })
    frozen += 1
  }

  // 第二步：逐条看窗口已到、仍 pending 的任务。
  const due = (await store.listPendingJobs(nowIso))
    .filter((job) => job.subjectId === userId)
    .sort(byWindowThenMeal)

  for (const job of due) {
    const record = await store.getRecord(job.subjectId, job.date, job.meal)
    const step = settleStep({
      now,
      windowEndAt: new Date(job.windowEndAt),
      record: record?.status ?? null,
      review: record === null ? null : reviewOf(record),
    })
    if (step.kind === 'not_due') continue

    if (step.kind === 'frozen') {
      await store.saveJob({ ...job, status: step.reason })
      frozen += 1
      continue
    }

    // 同一个用户有任务在冻结时，其余结算排队，等冻结解除再按窗口顺序跑。
    if ((await store.listFrozenJobs(userId)).length > 0) continue

    if ((await store.getSettlement(job.subjectId, job.date, job.meal)) !== null) {
      await store.saveJob({ ...job, status: 'settled' })
      continue
    }

    await settleOne(store, job, step.outcome, record)
    settled += 1
  }
  return { settled, frozen }
}

function reviewOf(record: MealRecordDoc): 'pending' | 'passed' | 'rejected' | 'manual' {
  if (record.status === 'exempt') return 'passed'
  if (record.review === 'manual') return 'manual'
  return aggregateReview(record.photoReviews)
}

async function settleOne(
  store: Store,
  job: SettlementJobDoc,
  outcome: 'fed' | 'starved',
  record: MealRecordDoc | null,
): Promise<void> {
  const participants = [{ status: outcome === 'fed' ? (record?.status ?? null) : null }]
  evaluateFeeding('personal', job.date, job.meal, participants)

  const pet = await store.getPet(job.subjectId)
  const user = await store.getUser(job.subjectId)
  const living = pet !== null && pet.alive && !beforeAdoption(pet, job.windowEndAt)
  const hungerBefore = pet?.hunger ?? 0
  let hungerAfter = hungerBefore

  if (living && pet !== null && user !== null) {
    const updated = nextHunger(pet.hunger, outcome) ?? hungerBefore
    hungerAfter = updated
    const next = afterMeal(pet, outcome, updated, job.date)
    if (updated >= 9) {
      // 死亡时刻取窗口结束，而不是扫描跑到的时刻，这样补跑也落在正确的逻辑日。
      await markDead(store, user, next, new Date(job.windowEndAt))
    } else {
      await store.savePet(next)
    }
  }

  await store.saveSettlement({
    subjectType: 'personal',
    subjectId: job.subjectId,
    date: job.date,
    meal: job.meal,
    outcome,
    hungerBefore,
    hungerAfter,
  })
  await store.saveJob({ ...job, status: 'settled' })
}

/**
 * 定时器入口：先给所有用户补任务，再逐个用户结算。
 * 同一个用户的结算用主体锁串行，和打卡、审核回调不会交错。
 */
export async function runDueJobs(
  store: Store,
  now: Date,
): Promise<{ settled: number; frozen: number }> {
  await topUpAllJobs(store, now)
  let settled = 0
  let frozen = 0
  for (const userId of await store.listUserIds()) {
    const result = await store.runExclusive(userId, () => runDueJobsFor(store, userId, now))
    settled += result.settled
    frozen += result.frozen
  }
  return { settled, frozen }
}

/**
 * 内容安全回调。每张照片单独收结果，按照片 ID 对应 photos。
 * 用户替换照片后，旧照片的迟到回调找不到对应项，直接拒绝，不会落到新照片上。
 * 窗口结束前也能收，只改记录，不动任务。窗口结束后任务在 waiting_review 或
 * manual_review 时，收到终态就放回 pending 再结算。
 * 页面事件体不会走到这里，只有云函数的回调入口调用它。
 */
export async function applyReview(
  store: Store,
  caller: { userId: string },
  input: { date: string; meal: MealType; photo: string; review: PhotoReview },
  now: Date,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return store.runExclusive(caller.userId, async () => {
    const job = await store.getJob(caller.userId, input.date, input.meal)
    if (job === null) return { ok: false, error: '无结算任务' }
    if (job.status === 'settled') return { ok: false, error: 'already_settled' }

    const record = await store.getRecord(caller.userId, input.date, input.meal)
    if (record === null) return { ok: false, error: '无打卡记录' }
    if (record.status !== 'checked_in') return { ok: false, error: '口粮没有图片审核' }
    const index = record.photos.indexOf(input.photo)
    if (index < 0) return { ok: false, error: '照片已替换' }
    if (input.review === 'pending') return { ok: false, error: '回调必须是终态' }

    const photoReviews = [...record.photoReviews]
    photoReviews[index] = input.review
    const verdict = aggregateReview(photoReviews)
    await store.saveRecord({
      ...record,
      photoReviews,
      review: verdict === 'pending' ? 'pending' : verdict,
    })

    // 没有终态，或窗口还没结束：任务不动，等定时器。
    if (verdict === 'pending') return { ok: true }
    if (job.status === 'waiting_review' || job.status === 'manual_review') {
      await store.saveJob({ ...job, status: 'pending' })
      await runDueJobsFor(store, caller.userId, now)
    }
    return { ok: true }
  })
}

/**
 * 领养。没有存活宠物、冷却已过才可以。名字在这里取，取了不能改。
 * 同时把 user.adoptedOn 写下来，连续天数靠它判断先领养还是先打卡。
 * 第二只宠物领养时，上一只的死亡日仍留在 user.diedOn，连续天数照旧按那一次减。
 */
const PET_SPECIES = ['cat', 'samoyed', 'parrot', 'goldfish'] as const

function chosenSpecies(value: PetSpecies | undefined): PetSpecies | null {
  if (value === undefined) return 'cat'
  return PET_SPECIES.includes(value) ? value : null
}

export async function adoptPet(
  store: Store,
  caller: { userId: string },
  now: Date,
  input: { name?: string; species?: PetSpecies } = {},
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  return store.runExclusive(caller.userId, async () => {
    const named = validatePetName(input.name)
    if (!named.ok) return named
    const species = chosenSpecies(input.species)
    if (species === null) return { ok: false, error: '没有这种动物' }
    const user = await store.getUser(caller.userId)
    if (user === null) throw new Error(`user not found: ${caller.userId}`)
    const pet = await store.getPet(caller.userId)
    if (pet?.alive === true) return { ok: false, error: '已有存活宠物' }
    const until = user.cooldownUntil === null ? null : new Date(user.cooldownUntil)
    if (!canAdopt(until, now)) return { ok: false, error: '冷却中' }

    const today = logicalDate(now, user.timeZone)
    await store.savePet({
      userId: caller.userId,
      name: named.name,
      hunger: 0,
      alive: true,
      adoptedOn: today,
      adoptedAt: now.toISOString(),
      endedOn: null,
      companyDays: 0,
      mealsEaten: 0,
      hungerLog: [],
      species,
    })
    await store.saveUser({
      ...user,
      adoptedOn: today,
      diedOn: null,
      cooldownUntil: null,
      pastPets: user.diedOn !== null && user.adoptedOn !== null
        ? [...user.pastPets, {
            adoptedOn: user.adoptedOn,
            diedOn: user.diedOn,
            name: pet !== null && pet.alive === false ? pet.name : undefined,
          }]
        : user.pastPets,
    })
    return { ok: true, name: named.name }
  })
}
