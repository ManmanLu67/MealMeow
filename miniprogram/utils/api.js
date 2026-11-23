// 本机入口。页面不直接碰存储。用户号存在这台手机上，不使用微信登录号。
const { createLocalStore } = require('../generated/adapters/local/local-store.js')
const { openLocal } = require('../generated/app/local-session.js')

function storage() {
  return {
    get(key) {
      const value = wx.getStorageSync(key)
      return Promise.resolve(value ? value : null)
    },
    set(key, value) {
      wx.setStorageSync(key, value)
      return Promise.resolve()
    },
    remove(key) {
      wx.removeStorageSync(key)
      return Promise.resolve()
    },
  }
}

function caller() {
  let userId = wx.getStorageSync('localUserId')
  if (!userId) {
    userId = 'local-' + Date.now()
    wx.setStorageSync('localUserId', userId)
  }
  return { userId: userId }
}

function fileExists(path) {
  try {
    wx.getFileSystemManager().accessSync(path)
    return true
  } catch (err) {
    return false
  }
}

function unlinkQuiet(path) {
  try {
    wx.getFileSystemManager().unlinkSync(path)
  } catch (err) {
    // 文件已经不在，记录里的路径已经清掉。
  }
}

// 锁挂在这一个存储对象上。每次新建 store 会让两次结算同时改饥饿。
const store = createLocalStore(storage())

function call(action, payload) {
  return openLocal(store, caller(), new Date(), Object.assign({}, payload, { action: action }), fileExists)
    .then(function (res) {
      const dropped = res && res.droppedPhotos ? res.droppedPhotos : []
      dropped.forEach(unlinkQuiet)
      if (res && res.ok === false && res.error === 'no_user' && action !== 'sync') {
        wx.redirectTo({ url: '/pages/start/start' })
      }
      return res || { ok: false, error: 'empty' }
    })
    .catch(function () {
      return { ok: false, error: '本机保存失败' }
    })
}

module.exports = { call: call }
