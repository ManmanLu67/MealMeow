// 没填昵称时拦住拍照、领养和保存饭点。判断必须同步，拍照才能留在这次点击里。
const api = require('./api.js')
const config = require('./config.js')
const timeZoneOf = require('./time-zone.js')

function storedNickname() {
  try {
    const userId = wx.getStorageSync('localUserId')
    if (!userId) return ''
    const raw = wx.getStorageSync('user:' + encodeURIComponent(userId))
    if (!raw) return ''
    const doc = typeof raw === 'string' ? JSON.parse(raw) : raw
    return doc && typeof doc.nickname === 'string' ? doc.nickname.trim() : ''
  } catch (err) {
    return ''
  }
}

function gate(page, next) {
  if (config.usePreviewData || storedNickname()) {
    next()
    return
  }
  page._afterNickname = next
  page.setData({ nicknameOpen: true, nicknameDraft: '' })
}

function save(page, nickname) {
  const name = String(nickname || '').trim()
  if (!name) {
    wx.showToast({ title: '请设置你的昵称', icon: 'none' })
    return
  }
  const next = page._afterNickname
  const wait = page._nicknameSyncFirst === true
  page._afterNickname = null
  page._nicknameSyncFirst = false
  page.setData({ nicknameOpen: false })
  function persist(done) {
    api.call('sync', { timeZone: timeZoneOf.deviceTimeZone(), nickname: name }).then(function (res) {
      if (!res.ok) {
        wx.showToast({ title: res.error || '请设置你的昵称', icon: 'none' })
        return
      }
      if (done) done()
    })
  }
  // 拍照要在这次点击里直接打开。先继续刚才的操作，再把昵称写入本机。
  if (wait) persist(typeof next === 'function' ? next : null)
  else {
    if (typeof next === 'function') next()
    persist(null)
  }
}

function cancel(page) {
  page._afterNickname = null
  page.setData({ nicknameOpen: false })
}

function shown(raw) {
  const name = String(raw || '').trim()
  if (!name) return { nickname: '点击填写昵称', nicknameSet: false, initial: '名' }
  return { nickname: name, nicknameSet: true, initial: name.slice(0, 1) }
}

module.exports = { gate: gate, save: save, cancel: cancel, shown: shown }
