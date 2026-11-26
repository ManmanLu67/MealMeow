import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { handle, parseRequest, PAGE_ACTIONS } from '../app/handle.ts'
import { syncUser } from '../app/user.ts'
import { createMemoryStore } from '../adapters/memory/memory-store.ts'
import { record, seededStore, SH } from './fixtures.ts'

const now = new Date('2026-11-13T04:10:00.000Z') // 上海 12:10，午餐窗口内

describe('platform-neutral entry', () => {
  it('ignores a user id in the request body and acts as the logged-in caller', async () => {
    const store = await seededStore({ userId: 'self' }, { userId: 'self' })
    await store.saveUser({ ...(await store.getUser('self'))!, userId: 'other' })
    const result = await handle(store, { userId: 'self' }, now, {
      action: 'exempt',
      userId: 'other',
      meal: 'lunch',
    })
    assert.equal(result.ok, true)
    assert.notEqual(await store.getRecord('self', '2026-11-13', 'lunch'), null)
    assert.equal(await store.getRecord('other', '2026-11-13', 'lunch'), null)
  })

  it('closes the account and returns the photo files to delete', async () => {
    const store = await seededStore()
    await store.saveUser({
      userId: 'other',
      nickname: '别人',
      timeZone: SH,
      meals: { breakfast: '07:30', lunch: '12:00', dinner: '18:00' },
      pendingMeals: null,
      stapleLeft: 2,
      stapleMonth: '2026-11',
      cooldownUntil: null,
      adoptedOn: null,
      diedOn: null,
      pastPets: [],
    })
    await store.saveRecord(record({ photos: ['wxfile://lunch.jpg'] }))
    await store.saveSnack({
      userId: 'u',
      date: '2026-11-13',
      startedAt: '2026-11-13T01:00:00.000Z',
      photos: ['wxfile://snack.jpg'],
      photoReviews: ['pending'],
      hidden: false,
    })
    const result = await handle(store, { userId: 'u' }, now, { action: 'closeAccount' })
    assert.equal(result.ok, true)
    if (result.ok) assert.deepEqual(result.data, { photos: ['wxfile://lunch.jpg', 'wxfile://snack.jpg'] })
    assert.equal(await store.getUser('u'), null)
    assert.equal(await store.getPet('u'), null)
    assert.equal(await store.getRecord('u', '2026-11-13', 'lunch'), null)
    assert.deepEqual(await store.listSnacks('u', '2026-11-13'), [])
    assert.equal((await store.getUser('other'))?.nickname, '别人')
    assert.equal(parseRequest({ action: 'closeAccount', userId: 'other' })?.action, 'closeAccount')
  })

  it('has no page action that can write a review result', () => {
    assert.ok(!(PAGE_ACTIONS as readonly string[]).includes('review'))
    assert.equal(parseRequest({ action: 'review', review: 'passed' }), null)
    assert.equal(parseRequest({ action: 'applyReview' }), null)
  })

  it('rejects malformed input without touching the store', async () => {
    const store = await seededStore()
    for (const bad of [
      null,
      'sync',
      {},
      { action: 'checkin', meal: 'brunch', photos: ['a'] },
      { action: 'checkin', meal: 'lunch', photos: [] },
      { action: 'checkin', meal: 'lunch', photos: [1] },
      { action: 'exempt', meal: 'brunch' },
      { action: 'deleteCheckin', meal: 'lunch' },
      { action: 'saveMeals', clocks: { breakfast: '07:30' } },
      { action: 'sync' },
    ]) {
      assert.deepEqual(await handle(store, { userId: 'u' }, now, bad), { ok: false, error: 'bad_request' })
    }
    assert.deepEqual(await store.listRecords('u', '2026-11-13'), [])
  })

  it('runs the whole page flow through one function', async () => {
    const store = createMemoryStore()
    const who = { userId: 'u' }
    assert.deepEqual(await handle(store, who, now, { action: 'sync', timeZone: 'Asia/Shanghai' }), {
      ok: true,
      data: { created: true },
    })
    assert.equal((await handle(store, who, now, { action: 'adopt' })).ok, true)
    assert.equal((await handle(store, who, now, { action: 'checkin', meal: 'lunch', photos: ['a'] })).ok, true)
    const removed = await handle(store, who, now, {
      action: 'deleteCheckin',
      date: '2026-11-13',
      meal: 'lunch',
    })
    assert.deepEqual(removed, { ok: true, data: { effect: 'cancel' } })
  })

  it('accepts exactly the requests the mini program sends, with no date on check-in or staple', async () => {
    // 这些请求体和 miniprogram/pages 里 api.call 发出的一致。页面不传日期。
    const store = createMemoryStore()
    const who = { userId: 'u' }
    await handle(store, who, now, { action: 'sync', timeZone: 'Asia/Shanghai' })
    await handle(store, who, now, { action: 'adopt' })
    const sent = [
      { action: 'checkin', meal: 'lunch', photos: ['wxfile://tmp_a.jpg'] },
      { action: 'deleteCheckin', date: '2026-11-13', meal: 'lunch' },
      { action: 'exempt', meal: 'lunch' },
    ]
    for (const body of sent) {
      assert.equal((await handle(store, who, now, body)).ok, true, `${body.action} should be accepted`)
    }
  })

  it('takes the date from the user time zone, not from the client', async () => {
    const store = createMemoryStore()
    const who = { userId: 'u' }
    await handle(store, who, now, { action: 'sync', timeZone: 'Asia/Shanghai' })
    await handle(store, who, now, { action: 'adopt' })
    // 客户端想把打卡记到别的日子：多余的 date 字段会被丢掉，记录仍落在服务端算出的今天。
    const result = await handle(store, who, now, {
      action: 'checkin',
      date: '2026-01-01',
      meal: 'lunch',
      photos: ['a'],
    })
    assert.equal(result.ok, true)
    assert.notEqual(await store.getRecord('u', '2026-11-13', 'lunch'), null)
    assert.equal(await store.getRecord('u', '2026-01-01', 'lunch'), null)
  })

  it('serves the home, gallery, and adopt screens through the same entry', async () => {
    const store = createMemoryStore()
    const who = { userId: 'u' }
    assert.deepEqual(await handle(store, who, now, { action: 'home' }), { ok: false, error: 'no_user' })
    await handle(store, who, now, { action: 'sync', timeZone: 'Asia/Shanghai' })
    const home = await handle(store, who, now, { action: 'home' })
    assert.equal(home.ok, true)
    if (home.ok) assert.equal((home.data as { petView: string }).petView, 'pasture')
    const gallery = await handle(store, who, now, { action: 'gallery', date: '2026-11-13' })
    assert.equal(gallery.ok, true)
    const adopt = await handle(store, who, now, { action: 'adoptView' })
    assert.equal(adopt.ok, true)
    if (adopt.ok) assert.equal((adopt.data as { canAdopt: boolean }).canAdopt, true)
    const me = await handle(store, who, now, { action: 'me' })
    assert.equal(me.ok, true)
    if (me.ok) assert.match((me.data as { accountId: string }).accountId, /^cf-\d{4}-\d{4}$/)
    const memorial = await handle(store, who, now, { action: 'memorial' })
    assert.equal(memorial.ok, true)
    if (memorial.ok) assert.deepEqual((memorial.data as { pets: unknown[] }).pets, [])
    assert.equal(parseRequest({ action: 'gallery', date: 'yesterday' }), null)
  })

  it('stores a trimmed nickname and rejects a blank one', async () => {
    const store = await seededStore()
    const blank = await syncUser(store, { userId: 'new' }, now, { timeZone: SH, nickname: '  ' })
    assert.deepEqual(blank, { ok: false, error: '请设置你的昵称' })
    assert.equal(await store.getUser('new'), null)
    const named = await syncUser(store, { userId: 'new' }, now, { timeZone: SH, nickname: ' 阿喵 ' })
    assert.equal(named.ok, true)
    assert.equal((await store.getUser('new'))?.nickname, '阿喵')
    const through = await handle(store, { userId: 'other' }, now, { action: 'sync', timeZone: SH, nickname: '阿喵' })
    assert.equal(through.ok, true)
    assert.equal((await store.getUser('other'))?.nickname, '阿喵')
    const again = await syncUser(store, { userId: 'new' }, now, { timeZone: SH })
    assert.equal(again.ok, true)
    assert.equal((await store.getUser('new'))?.nickname, '阿喵')
  })

  it('answers no_user when the time zone was never synced', async () => {
    const store = createMemoryStore()
    const result = await handle(store, { userId: 'u' }, now, { action: 'checkin', meal: 'lunch', photos: ['a'] })
    assert.deepEqual(result, { ok: false, error: 'no_user' })
  })
})

describe('批注', () => {
  it('stores one annotation on a meal and updates or clears it', async () => {
    const store = await seededStore()
    await store.saveRecord(record({ review: 'passed', photoReviews: ['passed'], photos: ['wxfile://a.jpg'] }))
    const who = { userId: 'u' }
    const t0 = new Date('2026-11-13T04:00:00.000Z')
    assert.deepEqual(
      await handle(store, who, t0, {
        action: 'annotate',
        kind: 'meal',
        date: '2026-11-13',
        meal: 'lunch',
        text: '早饭',
      }),
      { ok: true },
    )
    let rec = await store.getRecord('u', '2026-11-13', 'lunch')
    assert.equal(rec?.note?.text, '早饭')
    assert.equal(rec?.note?.createdAt, t0.toISOString())
    assert.equal(rec?.note?.updatedAt, t0.toISOString())

    const t1 = new Date('2026-11-13T05:00:00.000Z')
    assert.deepEqual(
      await handle(store, who, t1, {
        action: 'annotate',
        kind: 'meal',
        date: '2026-11-13',
        meal: 'lunch',
        text: '加菜',
      }),
      { ok: true },
    )
    rec = await store.getRecord('u', '2026-11-13', 'lunch')
    assert.equal(rec?.note?.text, '加菜')
    assert.equal(rec?.note?.createdAt, t0.toISOString())
    assert.equal(rec?.note?.updatedAt, t1.toISOString())

    assert.deepEqual(
      await handle(store, who, t1, {
        action: 'annotate',
        kind: 'meal',
        date: '2026-11-13',
        meal: 'lunch',
        text: '   ',
      }),
      { ok: true },
    )
    rec = await store.getRecord('u', '2026-11-13', 'lunch')
    assert.equal(rec?.note, undefined)

    const t2 = new Date('2026-11-13T06:00:00.000Z')
    assert.deepEqual(
      await handle(store, who, t2, {
        action: 'annotate',
        kind: 'meal',
        date: '2026-11-13',
        meal: 'lunch',
        text: '又记',
      }),
      { ok: true },
    )
    rec = await store.getRecord('u', '2026-11-13', 'lunch')
    assert.equal(rec?.note?.text, '又记')
    assert.equal(rec?.note?.createdAt, t2.toISOString())

    const tooLong = '字'.repeat(201)
    assert.deepEqual(
      await handle(store, who, t2, {
        action: 'annotate',
        kind: 'meal',
        date: '2026-11-13',
        meal: 'lunch',
        text: tooLong,
      }),
      { ok: false, error: '批注太长' },
    )
    rec = await store.getRecord('u', '2026-11-13', 'lunch')
    assert.equal(rec?.note?.text, '又记')
  })

  it('rejects staple meals and missing snacks', async () => {
    const store = await seededStore()
    await store.saveRecord(
      record({
        status: 'exempt',
        photos: [],
        photoReviews: [],
        review: 'pending',
        checkinAt: '2026-11-13T04:00:00.000Z',
      }),
    )
    const who = { userId: 'u' }
    assert.deepEqual(
      await handle(store, who, now, {
        action: 'annotate',
        kind: 'meal',
        date: '2026-11-13',
        meal: 'lunch',
        text: '不该写',
      }),
      { ok: false, error: '口粮没有批注' },
    )
    assert.deepEqual(
      await handle(store, who, now, {
        action: 'annotate',
        kind: 'snack',
        date: '2026-11-13',
        startedAt: '2026-11-13T01:00:00.000Z',
        text: '零食记',
      }),
      { ok: false, error: '无这条记录' },
    )
  })
})
