import type { MealType, RecordedStatus } from './meal.ts'
import { applyMeal } from './pet.ts'

/** 窗口结束才可以结算。打卡本身不改饥饿值。没有记录算漏餐。 */
export function settlementOutcome(status: RecordedStatus | null): 'fed' | 'starved' {
  if (status === 'checked_in' || status === 'exempt') return 'fed'
  return 'starved'
}

/** 没有存活宠物时不产生新的饥饿值。增减只走宠物域。 */
export function nextHunger(
  hunger: number | null,
  outcome: 'fed' | 'starved',
): number | null {
  if (hunger === null) return null
  return applyMeal(hunger, outcome)
}

export type SubjectType = 'personal' | 'group'

export interface FeedingEvaluation {
  outcome: 'fed' | 'starved'
}

/**
 * 只回答这一餐算不算吃到。不返回饥饿增减。
 * 当前主体拒绝 group。参与者列表必须由任务层先组装好。
 */
export function evaluateFeeding(
  subjectType: SubjectType,
  date: string,
  meal: MealType,
  participants: readonly { status: RecordedStatus | null }[],
): FeedingEvaluation {
  void date
  void meal
  if (subjectType !== 'personal') {
    throw new Error('当前主体不能结算小组')
  }
  return { outcome: settlementOutcome(participants[0]?.status ?? null) }
}

export const REVIEW_WAIT_MS = 2 * 60 * 60 * 1000

export type MealReview = 'pending' | 'passed' | 'rejected' | 'manual'

export type SettleStep =
  | { kind: 'not_due' }
  | { kind: 'frozen'; reason: 'waiting_review' | 'manual_review' }
  | { kind: 'settle'; outcome: 'fed' | 'starved' }

export function reviewDeadline(windowEndAt: Date): Date {
  return new Date(windowEndAt.getTime() + REVIEW_WAIT_MS)
}

/**
 * 窗口结束只表示可以开始。审核未终态时宠物冻结。
 * 到截止时间不自动通过，也不自动驳回。
 */
export function settleStep(input: {
  now: Date
  windowEndAt: Date
  record: RecordedStatus | null
  review: MealReview | null
}): SettleStep {
  if (input.now < input.windowEndAt) return { kind: 'not_due' }
  if (input.record === 'exempt' || input.record === null) {
    return { kind: 'settle', outcome: settlementOutcome(input.record) }
  }
  const review = input.review ?? 'pending'
  if (review === 'passed') return { kind: 'settle', outcome: 'fed' }
  if (review === 'rejected') return { kind: 'settle', outcome: 'starved' }
  const waiting = review === 'pending' && input.now < reviewDeadline(input.windowEndAt)
  return { kind: 'frozen', reason: waiting ? 'waiting_review' : 'manual_review' }
}

export type JobStatus = 'pending' | 'waiting_review' | 'manual_review' | 'settled'

/** 定时器只捞窗口已过、仍 pending 的任务。挂起和已结算都不在这里。 */
export function jobReady(status: JobStatus, windowEndAt: Date, now: Date): boolean {
  return status === 'pending' && now >= windowEndAt
}
