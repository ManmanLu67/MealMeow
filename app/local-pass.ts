import { logicalDate } from '../domain/index.ts'
import type { Store } from './ports.ts'
import type { Caller } from './handle.ts'
import { applyReview } from './settle.ts'
import { applySnackReview } from './snack.ts'

/** 本机没有内容安全。把逻辑今日还在等待的照片标成通过，不改打卡命令的默认状态。 */
export async function acceptPendingPhotos(store: Store, caller: Caller, now: Date): Promise<void> {
  const user = await store.getUser(caller.userId)
  if (user === null) return
  const day = logicalDate(now, user.timeZone)
  const records = await store.listRecords(caller.userId, day)
  for (const record of records) {
    if (record.status !== 'checked_in') continue
    for (let index = 0; index < record.photos.length; index += 1) {
      if (record.photoReviews[index] !== 'pending') continue
      await applyReview(store, caller, {
        date: day,
        meal: record.meal,
        photo: record.photos[index],
        review: 'passed',
      }, now)
    }
  }
  const snacks = await store.listSnacks(caller.userId, day)
  for (const snack of snacks) {
    for (let index = 0; index < snack.photos.length; index += 1) {
      if (snack.photoReviews[index] !== 'pending') continue
      await applySnackReview(store, caller, {
        date: day,
        startedAt: snack.startedAt,
        photo: snack.photos[index],
        review: 'passed',
      })
    }
  }
}
