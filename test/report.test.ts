import assert from 'node:assert/strict'
import fs from 'node:fs'
import { afterEach, describe, it } from 'node:test'
import vm from 'node:vm'

const box: { wx?: Wx; module: { exports: { report?: (scope: string, err: unknown) => void } }; exports: object } = {
  module: { exports: {} },
  exports: {},
}
box.exports = box.module.exports
vm.runInNewContext(
  fs.readFileSync(new URL('../miniprogram/utils/report.js', import.meta.url), 'utf8'),
  box,
  { filename: 'miniprogram/utils/report.js' },
)
const report = box.module.exports.report as (scope: string, err: unknown) => void

type Wx = {
  getRealtimeLogManager?: () => { error: (...args: unknown[]) => void }
  getStorageSync?: (key: string) => unknown
}

afterEach(() => {
  delete box.wx
})

function install(logError: (...args: unknown[]) => void, stored: unknown | (() => unknown)) {
  box.wx = {
    getRealtimeLogManager: () => ({ error: logError }),
    getStorageSync: (key) => {
      assert.equal(key, 'localUserId')
      if (typeof stored === 'function') return stored()
      return stored
    },
  }
}

describe('realtime error report', () => {
  it('sends the action, the wx error text, and the local user id', () => {
    const calls: unknown[][] = []
    install((...args) => { calls.push(args) }, 'local-1')
    report('adopt', {
      errMsg: 'setStorageSync:fail quota',
      message: 'other',
      nickname: '乐乐',
      name: '乐乐',
    })
    assert.deepEqual(calls, [['adopt', 'setStorageSync:fail quota', 'local-1']])
  })

  it('uses Error.message when the platform did not set errMsg', () => {
    const calls: unknown[][] = []
    install((...args) => { calls.push(args) }, 'local-1')
    report('checkin.photo', new Error('saveFile:fail'))
    assert.deepEqual(calls, [['checkin.photo', 'saveFile:fail', 'local-1']])
  })

  it('repeats the same failure once per user', () => {
    const calls: unknown[][] = []
    install((...args) => { calls.push(args) }, 'local-1')
    report('guide.read', 'getStorageSync:fail')
    report('guide.read', 'getStorageSync:fail')
    assert.equal(calls.length, 1)
  })

  it('still reports when reading the local user id throws', () => {
    const calls: unknown[][] = []
    install((...args) => { calls.push(args) }, () => { throw new Error('getStorageSync:fail') })
    report('adopt', 'setStorageSync:fail')
    assert.deepEqual(calls, [['adopt', 'setStorageSync:fail', '']])
  })

  it('does not throw when realtime log is missing or rejects', () => {
    box.wx = {}
    assert.doesNotThrow(() => { report('onError', 'boom') })
    install(() => { throw new Error('log down') }, 'local-1')
    assert.doesNotThrow(() => { report('onError', 'boom-2') })
  })
})
