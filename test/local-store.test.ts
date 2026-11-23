import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createLocalStore, type KeyValue } from '../adapters/local/local-store.ts'
import { record } from './fixtures.ts'
import { runStoreContract } from './store-contract.ts'

function mapKv(): KeyValue {
  const map = new Map<string, string>()
  return {
    async get(key) { return map.get(key) ?? null },
    async set(key, value) { map.set(key, value) },
    async remove(key) { map.delete(key) },
  }
}

runStoreContract('local store', () => createLocalStore(mapKv()))

describe('local store limits', () => {
  it('refuses a value over one megabyte and keeps the old one', async () => {
    const store = createLocalStore(mapKv())
    await store.saveRecord(record())
    await assert.rejects(
      () => store.saveRecord(record({ photos: ['x'.repeat(1_000_001)], photoReviews: ['pending'] })),
      (error: unknown) => error instanceof Error && error.message === 'storage_full',
    )
    assert.deepEqual((await store.getRecord('u', '2026-11-13', 'lunch'))?.photos, ['a'])
  })

  it('serializes two stores that share the same keys', async () => {
    const kv = mapKv()
    const left = createLocalStore(kv)
    const right = createLocalStore(kv)
    let inside = 0
    let peak = 0
    async function hold() {
      inside += 1
      peak = Math.max(peak, inside)
      await new Promise((resolve) => setTimeout(resolve, 20))
      inside -= 1
    }
    await Promise.all([left.runExclusive('u', hold), right.runExclusive('u', hold)])
    assert.equal(peak, 1)
  })
})
