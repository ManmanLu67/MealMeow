import { createCloudStore } from '../adapters/cloud/cloud-store.ts'
import type { CloudDb, CloudQuery } from '../adapters/cloud/cloud-db.ts'
import { runStoreContract } from './store-contract.ts'

function createFakeCloudDb(): CloudDb {
  const tables = new Map<string, Map<string, unknown>>()
  let tail: Promise<unknown> = Promise.resolve()

  function table(name: string): Map<string, unknown> {
    let found = tables.get(name)
    if (!found) {
      found = new Map()
      tables.set(name, found)
    }
    return found
  }

  function matches(row: unknown, where: CloudQuery['where']): boolean {
    const doc = row as Record<string, unknown>
    for (const [key, expected] of Object.entries(where)) {
      const value = doc[key]
      if (expected !== null && typeof expected === 'object' && 'lte' in expected) {
        if (typeof value !== 'string' || value > expected.lte) return false
      } else if (value !== expected) {
        return false
      }
    }
    return true
  }

  const db: CloudDb = {
    async get(collection, id) {
      const row = table(collection).get(id)
      return row === undefined ? null : structuredClone(row) as Record<string, unknown>
    },
    async set(collection, id, data) {
      table(collection).set(id, structuredClone(data))
    },
    async remove(collection, id) {
      table(collection).delete(id)
    },
    async query(collection, query) {
      const rows = [...table(collection).values()].filter((row) => matches(row, query.where))
      const skip = query.skip ?? 0
      const limit = query.limit ?? rows.length
      return rows.slice(skip, skip + limit).map((row) => structuredClone(row) as Record<string, unknown>)
    },
    runTransaction(fn) {
      const run = tail.then(() => fn(db))
      tail = run.then(() => undefined, () => undefined)
      return run
    },
  }
  return db
}

runStoreContract('cloud store', () => createCloudStore(createFakeCloudDb()))
