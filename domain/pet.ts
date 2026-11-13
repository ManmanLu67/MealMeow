import { addIsoDays, logicalDate, logicalDayStart } from './time.ts'

export type PetBand = 'full' | 'peckish' | 'hungry' | 'critical' | 'dead'

/**
 * 唯一的饥饿算法，只在宠物域。策略不返回增减。
 * 进食按档恢复：6–8→5，3–5→2，1–2→0，0 不变。
 * 漏餐 +1。9 死亡后不再变。固定 ±1 不使用。
 */
export function applyMeal(hunger: number, outcome: 'fed' | 'starved'): number {
  if (hunger >= 9) return 9
  if (outcome === 'starved') return hunger + 1
  if (hunger <= 2) return 0
  if (hunger <= 5) return 2
  return 5
}

export function petBand(hunger: number): PetBand {
  if (hunger <= 0) return 'full'
  if (hunger <= 2) return 'peckish'
  if (hunger <= 5) return 'hungry'
  if (hunger <= 8) return 'critical'
  return 'dead'
}

export const PET_BAND_TEXT: Record<PetBand, string> = {
  full: '吃饱',
  peckish: '有点饿',
  hungry: '很饿',
  critical: '濒危',
  dead: '死亡',
}

/** 死亡当刻所在逻辑日起算 7 个逻辑日，截止日 04:00 可再领养。 */
export function cooldownUntil(diedAt: Date, timeZone: string): Date {
  const endDay = addIsoDays(logicalDate(diedAt, timeZone), 7)
  return logicalDayStart(endDay, timeZone)
}

export function canAdopt(cooldownUntilAt: Date | null, now: Date): boolean {
  if (!cooldownUntilAt) return true
  return now >= cooldownUntilAt
}

export type HomePetView = 'pasture' | 'living' | 'memorial'

/** 没有独立宠物页。死亡后冷却结束前，首页宠物区就是纪念页。 */
export function homePetView(
  pet: 'none' | 'alive' | 'dead',
  cooldownOver: boolean,
): HomePetView {
  if (pet === 'alive') return 'living'
  if (pet === 'dead' && !cooldownOver) return 'memorial'
  return 'pasture'
}
