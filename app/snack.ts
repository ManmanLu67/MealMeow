import { logicalDate, snackMergeTarget } from '../domain/index.ts'
import { killPetIfSatietyAtLeast200 } from './settle.ts'
import type { Store } from './ports.ts'
import type { SnackDoc } from './types.ts'
import { requireUser } from './user.ts'

const MAX_SNACK_BOOSTS = 3

function nextBoosts(existing: string[] | undefined, now: Date): string[] | undefined {
  const boosts = existing ?? []
  if (boosts.length >= MAX_SNACK_BOOSTS) return existing
  return [...boosts, now.toISOString()]
}

type Fail = { ok: false; error: string }

/**
 * 打卡可以另记一份零食，饭点里也可以，不代替这一餐。一小时内的打卡并入同一份。
 * 零食不改宠物、不进结算、不算「一天三餐都完成」，也不占应急口粮额度。
 */
export async function recordSnack(
  store: Store,
  caller: { userId: string },
  now: Date,
  input: { photos: string[] },
): Promise<{ ok: true; merged: boolean } | Fail> {
  return store.runExclusive(caller.userId, async () => {
    const user = await requireUser(store, caller.userId)
    if (input.photos.length === 0) return { ok: false, error: '需要照片' }

    const day = logicalDate(now, user.timeZone)

    // 零食按逻辑日归档。04:00 前的零食属于前一个逻辑日，所以并入时要看当前这一天和前一天。
    const today = await store.listSnacks(caller.userId, day)
    const target = snackMergeTarget(today.map((s) => s.startedAt), now)
    if (target !== null) {
      const base = today.find((s) => s.startedAt === target) as SnackDoc
      await store.saveSnack({
        ...base,
        photos: [...base.photos, ...input.photos],
        photoReviews: [...base.photoReviews, ...input.photos.map(() => 'pending' as const)],
        boosts: nextBoosts(base.boosts, now),
      })
      await killPetIfSatietyAtLeast200(store, caller.userId, now)
      return { ok: true, merged: true }
    }
    await store.saveSnack({
      userId: caller.userId,
      date: day,
      startedAt: now.toISOString(),
      photos: [...input.photos],
      photoReviews: input.photos.map(() => 'pending' as const),
      hidden: false,
      boosts: nextBoosts([], now),
    })
    await killPetIfSatietyAtLeast200(store, caller.userId, now)
    return { ok: true, merged: false }
  })
}

/** 删除一份零食。零食不进结算，所以随时可以删，直接撤掉，不需要先看有没有结算。 */
export async function removeSnack(
  store: Store,
  caller: { userId: string },
  input: { date: string; startedAt: string },
): Promise<{ ok: true } | Fail> {
  return store.runExclusive(caller.userId, async () => {
    await requireUser(store, caller.userId)
    const found = (await store.listSnacks(caller.userId, input.date)).find(
      (s) => s.startedAt === input.startedAt,
    )
    if (found === undefined) return { ok: false, error: '无这份零食' }
    await store.deleteSnack(caller.userId, input.date, input.startedAt)
    return { ok: true }
  })
}

/** 零食回调：按照片 ID 对应。零食只用来决定图鉴里这张图能不能留，不影响宠物。 */
export async function applySnackReview(
  store: Store,
  caller: { userId: string },
  input: { date: string; startedAt: string; photo: string; review: 'passed' | 'rejected' },
): Promise<{ ok: true } | Fail> {
  return store.runExclusive(caller.userId, async () => {
    const snack = (await store.listSnacks(caller.userId, input.date)).find(
      (s) => s.startedAt === input.startedAt,
    )
    if (snack === undefined) return { ok: false, error: '无这份零食' }
    const index = snack.photos.indexOf(input.photo)
    if (index < 0) return { ok: false, error: '照片已替换' }
    const photoReviews = [...snack.photoReviews]
    photoReviews[index] = input.review
    await store.saveSnack({ ...snack, photoReviews })
    return { ok: true }
  })
}
