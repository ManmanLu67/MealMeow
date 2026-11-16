import type {
  JobStatus,
  MealClocks,
  MealReview,
  MealType,
  PhotoReview,
  RecordedStatus,
} from '../domain/index.ts'

export type MealRecordDoc = {
  userId: string
  date: string
  meal: MealType
  status: RecordedStatus
  checkinAt: string
  photos: string[]
  /** 和 photos 一一对应。每张照片的内容安全结果。口粮没有照片，为空数组。 */
  photoReviews: PhotoReview[]
  /** 整餐的审核结论。驳回的记录保留，页面按「没有打卡」处理。 */
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
  /** 已经死亡的宠物的在世区间。领养新宠物时不会清掉，连续天数靠它扣除。 */
  pastPets: { adoptedOn: string; diedOn: string }[]
}

export type PetDoc = {
  userId: string
  hunger: number
  alive: boolean
  adoptedOn: string
  /** 领养的确切时刻。窗口在此之前结束的餐次不算这只宠物的。 */
  adoptedAt: string
  endedOn: string | null
  companyDays: number
  mealsEaten: number
}
