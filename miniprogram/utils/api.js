// 本机入口。页面不直接碰存储。用户号存在这台手机上，不使用微信登录号。
const { createLocalStore } = require('../generated/adapters/local/local-store.js')
const { openLocal } = require('../generated/app/local-session.js')
const timeZoneOf = require('./time-zone.js')
const report = require('./report.js')

const PURGE_NOTED_KEY = 'photoPurgeNoted'
const PURGE_STASH_KEY = 'photoPurgeStash'
const GALLERY_HINT_KEY = 'galleryPhotoHint'

const NO_AFTER_PURGE = {
  checkin: true,
  snack: true,
  export: true,
  import: true,
  photoPurge: true,
  purgePhotos: true,
}

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

function readNoted() {
  try {
    const value = wx.getStorageSync(PURGE_NOTED_KEY)
    return value ? value : null
  } catch (err) {
    return null
  }
}

function writeNoted(month) {
  try {
    wx.setStorageSync(PURGE_NOTED_KEY, month)
  } catch (err) {
    /* ignore */
  }
}

function readStash() {
  try {
    const value = wx.getStorageSync(PURGE_STASH_KEY)
    return value && typeof value === 'object' ? value : null
  } catch (err) {
    return null
  }
}

function writeStash(notice) {
  try {
    if (notice) wx.setStorageSync(PURGE_STASH_KEY, notice)
    else wx.removeStorageSync(PURGE_STASH_KEY)
  } catch (err) {
    /* ignore */
  }
}

function galleryHintSeen() {
  try {
    return wx.getStorageSync(GALLERY_HINT_KEY) === '1'
  } catch (err) {
    return false
  }
}

function purgeModalText(month) {
  return Number(month.slice(5)) + '月的照片即将从图鉴去掉。打卡记录还在，可以先存进相册。'
}

function showPurgeModal(month) {
  return new Promise(function (resolve) {
    wx.showModal({
      title: '图鉴',
      content: purgeModalText(month),
      showCancel: false,
      confirmText: '确定',
      success(res) {
        resolve(!!res.confirm)
      },
      fail() {
        resolve(false)
      },
    })
  })
}

// 锁挂在这一个存储对象上。每次新建 store 会让两次结算同时改饥饿。
const store = createLocalStore(storage())

function dispatch(action, payload) {
  return openLocal(store, caller(), new Date(), Object.assign({}, payload, { action: action }), fileExists)
    .then(function (res) {
      const dropped = res && res.droppedPhotos ? res.droppedPhotos : []
      dropped.forEach(unlinkQuiet)
      const result = res || { ok: false, error: 'empty' }
      if (result.ok === false && result.error && result.error !== 'no_user') report.report(action, result.error)
      return result
    })
    .catch(function (err) {
      report.report(action, err)
      return { ok: false, error: '本机保存失败' }
    })
}

function runPurgePhotos(month) {
  return dispatch('purgePhotos', { month: month })
}

function confirmPurgeNotice(notice) {
  return showPurgeModal(notice.month).then(function (confirmed) {
    if (!confirmed) return
    writeNoted(notice.month)
    if (notice.deleteNow) return runPurgePhotos(notice.month)
  })
}

function runPhotoPurgeSide(action) {
  return dispatch('photoPurge', { noted: readNoted() }).then(function (purgeRes) {
    if (!purgeRes || purgeRes.ok !== true) return
    const notice = purgeRes.data && purgeRes.data.notice
    if (!notice) return
    const noted = readNoted()
    if (noted === notice.month && notice.deleteNow) return runPurgePhotos(notice.month)
    if (noted === notice.month) return
    if (action === 'gallery' && !galleryHintSeen()) {
      writeStash(notice)
      return
    }
    return confirmPurgeNotice(notice)
  })
}

function afterGalleryPhotoHint() {
  const stash = readStash()
  if (!stash || !stash.month) return Promise.resolve()
  writeStash(null)
  return confirmPurgeNotice(stash)
}

function call(action, payload) {
  return dispatch(action, payload).then(function (res) {
    if (!res || res.ok !== false || res.error !== 'no_user') {
      if (res && res.ok === true && !NO_AFTER_PURGE[action]) {
        return runPhotoPurgeSide(action).then(function () {
          return res
        })
      }
      return res
    }
    if (action === 'sync' || action === 'closeAccount') return res
    return dispatch('sync', { timeZone: timeZoneOf.deviceTimeZone() }).then(function (synced) {
      if (!synced.ok) return synced
      return dispatch(action, payload || {}).then(function (again) {
        if (again && again.ok === true && !NO_AFTER_PURGE[action]) {
          return runPhotoPurgeSide(action).then(function () {
            return again
          })
        }
        return again
      })
    })
  })
}

module.exports = { call: call, afterGalleryPhotoHint: afterGalleryPhotoHint }