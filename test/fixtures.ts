import { createMemoryStore } from '../adapters/memory/memory-store.ts'
import type { Store } from '../app/ports.ts'
import type { MealRecordDoc, PetDoc, UserDoc } from '../app/types.ts'

export const SH = 'Asia/Shanghai'
export const MEALS_DEFAULT = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' }

export function user(patch: Partial<UserDoc> = {}): UserDoc {
  return {
    userId: 'u',
    nickname: '',
    timeZone: SH,
    meals: MEALS_DEFAULT,
    pendingMeals: null,
    stapleLeft: 2,
    stapleMonth: '2026-11',
    cooldownUntil: null,
    adoptedOn: null,
    diedOn: null,
    pastPets: [],
    ...patch,
  }
}

export function pet(patch: Partial<PetDoc> = {}): PetDoc {
  return {
    userId: 'u',
    name: '小饭',
    hunger: 4,
    alive: true,
    adoptedOn: '2026-11-01',
    adoptedAt: '2026-10-31T16:00:00.000Z',
    endedOn: null,
    companyDays: 1,
    mealsEaten: 0,
    hungerLog: [],
    ...patch,
  }
}

export function record(patch: Partial<MealRecordDoc> = {}): MealRecordDoc {
  return {
    userId: 'u',
    date: '2026-11-13',
    meal: 'lunch',
    status: 'checked_in',
    checkinAt: '2026-11-13T04:00:00.000Z',
    photos: ['a'],
    photoReviews: ['pending'],
    review: 'pending',
    hidden: false,
    ...patch,
  }
}

/** 有用户、有存活宠物的仓库。 */
export async function seededStore(
  userPatch: Partial<UserDoc> = {},
  petPatch: Partial<PetDoc> | null = {},
): Promise<Store> {
  const store = createMemoryStore()
  await store.saveUser(user(userPatch))
  if (petPatch !== null) await store.savePet(pet(petPatch))
  return store
}

export async function mustPet(store: Store, userId = 'u'): Promise<PetDoc> {
  const found = await store.getPet(userId)
  if (found === null) throw new Error('pet missing')
  return found
}
