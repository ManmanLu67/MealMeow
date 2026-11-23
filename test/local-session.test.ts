import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createMemoryStore } from '../adapters/memory/memory-store.ts'
import { openLocal } from '../app/local-session.ts'
import { mustPet, record, seededStore, user } from './fixtures.ts'

const inside = new Date('2026-11-13T04:10:00.000Z')
const after = new Date('2026-11-13T05:00:00.000Z')
const caller = { userId: 'u' }

describe('local session', () => {
  it('passes a check-in before any later settlement', async () => {
    const store = await seededStore({}, { hunger: 4 })
    const checked = await openLocal(store, caller, inside, { action: 'checkin', meal: 'lunch', photos: ['p'] })
    assert.equal(checked.ok, true)
    assert.equal((await store.getRecord('u', '2026-11-13', 'lunch'))?.review, 'passed')
    const home = await openLocal(store, caller, after, { action: 'home' })
    assert.equal(home.ok, true)
    assert.equal((await store.getSettlement('u', '2026-11-13', 'lunch'))?.outcome, 'fed')
    assert.equal((await mustPet(store)).hunger, 2)
  })

  it('answers no_user without settling', async () => {
    const home = await openLocal(createMemoryStore(), caller, inside, { action: 'home' })
    assert.deepEqual(home, { ok: false, error: 'no_user' })
  })

  it('hides a missing file without forgetting the stored path', async () => {
    const store = await seededStore()
    await openLocal(store, caller, inside, { action: 'checkin', meal: 'lunch', photos: ['p'] })
    const home = await openLocal(store, caller, inside, { action: 'home' }, () => false)
    assert.equal(home.ok, true)
    if (home.ok) {
      const photos = (home.data as { photos: { src: string }[] }).photos
      assert.deepEqual(photos, [])
    }
    assert.deepEqual((await store.getRecord('u', '2026-11-13', 'lunch'))?.photos, ['p'])
  })

  it('exports and imports through the same entry', async () => {
    const store = await seededStore()
    const exported = await openLocal(store, caller, inside, { action: 'export' })
    assert.equal(exported.ok, true)
    if (!exported.ok) return
    const empty = createMemoryStore()
    const imported = await openLocal(empty, caller, inside, { action: 'import', backup: exported.data })
    assert.equal(imported.ok, true)
    assert.equal((await empty.getUser('u'))?.userId, 'u')
  })

  it('imports a backup onto the caller even when the file names someone else', async () => {
    const source = await seededStore({ userId: 'other', nickname: '阿喵' }, { userId: 'other' })
    const exported = await openLocal(source, { userId: 'other' }, inside, { action: 'export' })
    assert.equal(exported.ok, true)
    if (!exported.ok) return
    const phone = createMemoryStore()
    await phone.saveUser(user({ userId: 'phone' }))
    const imported = await openLocal(phone, { userId: 'phone' }, inside, { action: 'import', backup: exported.data })
    assert.equal(imported.ok, true)
    assert.equal((await phone.getUser('phone'))?.nickname, '阿喵')
    assert.equal(await phone.getUser('other'), null)
  })

  it('deletes the account and hands its photos back for removal', async () => {
    const store = await seededStore()
    await store.saveRecord(record({ photos: ['wxfile://lunch.jpg'] }))
    const result = await openLocal(store, caller, inside, { action: 'closeAccount' })
    assert.equal(result.ok, true)
    if (result.ok) assert.deepEqual(result.droppedPhotos, ['wxfile://lunch.jpg'])
    assert.equal(await store.getUser('u'), null)
    assert.equal(await store.getPet('u'), null)
  })
})
