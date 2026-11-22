import type {
  JobStatus,
  MealClocks,
  MealReview,
  MealType,
  PhotoReview,
  RecordedStatus,
} from '../domain/index.ts'
import type { HungerDay } from '../domain/index.ts'

export type MealRecordDoc = {
  userId: string
  date: string
  meal: MealType
  status: RecordedStatus
  checkinAt: string
  photos: string[]
  /** 和 photos 一一对应。每张照片的内容安全结果。口粮没有照片，为空数组。 */
  photoReviews: PhotoReview[]
  /** 和 photos 一一对应。空字符串表示这张还没提交成功。 */
  traceIds?: string[]
  /** 整餐的审核结论。驳回的记录保留，页面按「没有打卡」处理。 */
  review: MealReview
  hidden: boolean
}

/**
 * 零食：窗口外的打卡。和三餐的记录分开存，因为它不属于任何一餐、没有结算任务、
 * 不影响宠物，也不计入「一天三餐都完成」和连续天数。
 * 一小时内的打卡并入同一份，以这一份的第一次打卡为起点。按逻辑日归档，每日 04:00 换日。
 */
export type SnackDoc = {
  userId: string
  /** 起点所在的逻辑日。 */
  date: string
  /** 这一份的第一次打卡时刻（ISO）。同一天内唯一，和 userId、date 一起定位。 */
  startedAt: string
  photos: string[]
  /** 和 photos 一一对应。零食也走内容安全，但结果不影响宠物，只决定这张图能不能留在图鉴里。 */
  photoReviews: PhotoReview[]
  /** 和 photos 一一对应。空字符串表示这张还没提交成功。 */
  traceIds?: string[]
  hidden: boolean
}

/** 内容安全的追踪号。回调只认这个号，不认事件体里的用户。 */
export type TraceDoc = {
  traceId: string
  userId: string
  date: string
  photo: string
  meal: MealType | null
  startedAt: string | null
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
  /** 已经死亡的宠物的在世区间。领养新宠物时不会清掉，连续天数靠它扣除。名字在下一次领养时从当时的宠物抄下来。 */
  pastPets: { adoptedOn: string; diedOn: string; name?: string }[]
}

export type PetSpecies = 'cat' | 'samoyed' | 'parrot' | 'goldfish'

export type PetDoc = {
  userId: string
  /** 领养时取的名字，之后不能改，死亡后仍留在纪念页。 */
  name: string
  /** 没写的旧档按黑猫画。新领养一定会写上。 */
  species?: PetSpecies
  hunger: number
  alive: boolean
  adoptedOn: string
  /** 领养的确切时刻。窗口在此之前结束的餐次不算这只宠物的。 */
  adoptedAt: string
  endedOn: string | null
  companyDays: number
  mealsEaten: number
  /** 每个逻辑日结算后的饥饿档。扣等级只看已经结束的那些天。 */
  hungerLog: HungerDay[]
}
