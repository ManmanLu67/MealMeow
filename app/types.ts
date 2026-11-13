import type { JobStatus, MealClocks, MealReview, MealType, RecordedStatus } from '../domain/index.ts'

export type MealRecordDoc = {
  userId: string
  date: string
  meal: MealType
  status: RecordedStatus
  checkinAt: string
  photos: string[]
  review: MealReview
  hidden: boolean
}

export type SettlementJobDoc = {
  subjectType: 'personal'
  subjectId: string
  date: string
  meal: MealType
  windowEndAt: string
  status: JobStatus
}

export type SettlementDoc = {
  subjectType: 'personal'
  subjectId: string
  date: string
  meal: MealType
  outcome: 'fed' | 'starved'
  hungerBefore: number
  hungerAfter: number
}

export type UserDoc = {
  userId: string
  nickname: string
  timeZone: string
  meals: MealClocks
  pendingMeals: { clocks: MealClocks; effectiveOn: string } | null
  stapleLeft: number
  stapleMonth: string
  cooldownUntil: string | null
  adoptedOn: string | null
  diedOn: string | null
}

export type PetDoc = {
  userId: string
  hunger: number
  alive: boolean
  adoptedOn: string
  endedOn: string | null
  companyDays: number
  mealsEaten: number
}
