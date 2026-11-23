import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { exportBackup, importBackup } from '../app/backup.ts'
import { runDueJobs } from '../app/settle.ts'
import { createMemoryStore } from '../adapters/memory/memory-store.ts'
import { mustPet, record, seededStore, user } from './fixtures.ts'

const now = new Date('2026-11-13T00:00:00.000Z')

describe('backup', () => {
  it('round-trips documents and does not settle them again', async () => {
    const store = await seededStore({}, { hunger: 4 })
    await store.saveRecord(record({ review: 'passed', photoReviews: ['passed'], photos: ['wxfile://lunch.jpg'] }))
    await store.saveJob({
      subjectType: 'personal',
      subjectId: 'u',
      date: '2026-11-13',
      meal: 'lunch',
      windowEndAt: '2026-11-13T05:00:00.000Z',
      status: 'settled',
    })
    await store.saveSettlement({
      subjectType: 'personal',
      subjectId: 'u',
      date: '2026-11-13',
      meal: 'lunch',
      outcome: 'fed',
      hungerBefore: 5,
      hungerAfter: 4,
    })
    const backup = await exportBackup(store, 'u')
    assert.equal(JSON.stringify(backup).includes('base64'), false)
    assert.deepEqual(backup.records[0]?.photos, ['wxfile://lunch.jpg'])
    const fresh = createMemoryStore()
    await fresh.saveRecord(record({ date: '2026-01-01', meal: 'breakfast' }))
    assert.equal((await importBackup(fresh, backup, 'u')).ok, true)
    assert.equal(await fresh.getRecord('u', '2026-01-01', 'breakfast'), null)
    assert.equal((await fresh.getUser('u'))?.nickname, '')
    assert.equal((await mustPet(fresh)).hunger, 4)
    assert.equal((await fresh.getSettlement('u', '2026-11-13', 'lunch'))?.outcome, 'fed')
    await runDueJobs(fresh, now)
    assert.equal((await mustPet(fresh)).hunger, 4)
  })

  it('rejects a foreign file without writing', async () => {
    const store = await seededStore()
    const result = await importBackup(store, { version: 2 }, 'u')
    assert.deepEqual(result, { ok: false, error: '无法导入' })
    assert.equal((await store.getUser('u'))?.userId, 'u')
  })

  it('puts the backup on this phone and drops the other account', async () => {
    const source = await seededStore({ userId: 'other', nickname: '阿喵' }, { userId: 'other', hunger: 4 })
    await source.saveRecord(record({ userId: 'other', review: 'passed', photoReviews: ['passed'] }))
    const backup = await exportBackup(source, 'other')
    const phone = createMemoryStore()
    await phone.saveUser(user({ userId: 'phone', nickname: '本机' }))
    await phone.saveUser(user({ userId: 'other', nickname: '残留' }))
    await phone.saveRecord(record({ userId: 'phone', date: '2026-01-01', meal: 'breakfast' }))
    await phone.saveRecord(record({ userId: 'other' }))
    assert.equal((await importBackup(phone, backup, 'phone')).ok, true)
    assert.equal((await phone.getUser('phone'))?.nickname, '阿喵')
    assert.equal(await phone.getUser('other'), null)
    assert.equal(await phone.getRecord('phone', '2026-01-01', 'breakfast'), null)
    assert.equal((await phone.getRecord('phone', '2026-11-13', 'lunch'))?.review, 'passed')
    assert.equal(await phone.getRecord('other', '2026-11-13', 'lunch'), null)
    assert.equal((await mustPet(phone, 'phone')).hunger, 4)
  })

  it('keeps a missed meal settled when that day has no check-in', async () => {
    const store = await seededStore({}, { hunger: 5 })
    await store.saveJob({
      subjectType: 'personal',
      subjectId: 'u',
      date: '2026-11-13',
      meal: 'breakfast',
      windowEndAt: '2026-11-13T00:30:00.000Z',
      status: 'settled',
    })
    await store.saveSettlement({
      subjectType: 'personal',
      subjectId: 'u',
      date: '2026-11-13',
      meal: 'breakfast',
      outcome: 'starved',
      hungerBefore: 4,
      hungerAfter: 5,
    })
    const backup = await exportBackup(store, 'u')
    assert.equal(backup.settlements.length, 1)
    const phone = await seededStore({}, { hunger: 1 })
    assert.equal((await importBackup(phone, backup, 'u')).ok, true)
    await runDueJobs(phone, new Date('2026-11-13T01:00:00.000Z'))
    assert.equal((await mustPet(phone)).hunger, 5)
  })

  it('removes the pet when the backup has none', async () => {
    const store = await seededStore({}, { hunger: 4 })
    const backup = { ...(await exportBackup(store, 'u')), pet: null }
    const phone = await seededStore({}, { hunger: 3 })
    assert.equal((await importBackup(phone, backup, 'u')).ok, true)
    assert.equal(await phone.getPet('u'), null)
  })

  it('rejects a version-1 file that is not a backup', async () => {
    const store = await seededStore()
    await store.saveRecord(record())
    const result = await importBackup(store, {
      version: 1,
      user: { userId: 'u' },
      pet: null,
      records: [{}],
      snacks: [],
      jobs: [],
      settlements: [],
    }, 'u')
    assert.deepEqual(result, { ok: false, error: '无法导入' })
    assert.deepEqual((await store.getRecord('u', '2026-11-13', 'lunch'))?.photos, ['a'])
  })

  it('reads the export only after the user lock is free', async () => {
    const store = await seededStore()
    const order: string[] = []
    const held = store.runExclusive('u', async () => {
      order.push('hold')
      await new Promise((resolve) => setTimeout(resolve, 20))
      order.push('release')
    })
    const exported = exportBackup(store, 'u').then(() => order.push('export'))
    await Promise.all([held, exported])
    assert.deepEqual(order, ['hold', 'release', 'export'])
  })
})
