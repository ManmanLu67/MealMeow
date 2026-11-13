import { evaluateFeeding, nextHunger, settleStep } from '../domain/settlement.ts'
import { MEALS } from '../domain/meal.ts'
import type { MealType } from '../domain/meal.ts'
import type { Store } from './store.ts'

const mealRank = Object.fromEntries(MEALS.map((meal, index) => [meal, index])) as Record<
  MealType,
  number
>

export async function runDueJobs(
  store: Store,
  now: Date,
): Promise<{ settled: number; frozen: number }> {
  const jobs = await store.listPendingJobs(now.toISOString())
  jobs.sort((a, b) => {
    const byWindow = a.windowEndAt.localeCompare(b.windowEndAt)
    if (byWindow !== 0) return byWindow
    return mealRank[a.meal] - mealRank[b.meal]
  })

  let settled = 0
  let frozen = 0

  for (const job of jobs) {
    const record = await store.getRecord(job.subjectId, job.date, job.meal)
    const step = settleStep({
      now,
      windowEndAt: new Date(job.windowEndAt),
      record: record?.status ?? null,
      review: record?.review ?? null,
    })

    if (step.kind === 'not_due') continue

    if (step.kind === 'frozen') {
      await store.saveJob({ ...job, status: step.reason })
      frozen += 1
      continue
    }

    const existing = await store.getSettlement(job.subjectId, job.date, job.meal)
    if (existing !== null) {
      if (job.status !== 'settled') {
        await store.saveJob({ ...job, status: 'settled' })
        settled += 1
      }
      continue
    }

    const participants =
      step.outcome === 'starved'
        ? [{ status: null as const }]
        : [{ status: record!.status }]
    evaluateFeeding('personal', job.date, job.meal, participants)

    const pet = await store.getPet(job.subjectId)
    const hungerBefore = pet?.hunger ?? 0
    let hungerAfter = hungerBefore

    if (pet !== null && pet.alive) {
      const updated = nextHunger(pet.hunger, step.outcome)
      hungerAfter = updated ?? hungerBefore
    }

    await store.saveSettlement({
      subjectType: 'personal',
      subjectId: job.subjectId,
      date: job.date,
      meal: job.meal,
      outcome: step.outcome,
      hungerBefore,
      hungerAfter,
    })

    if (pet !== null && pet.alive) {
      await store.savePet({ ...pet, hunger: hungerAfter })
    }

    await store.saveJob({ ...job, status: 'settled' })
    settled += 1
  }

  return { settled, frozen }
}
