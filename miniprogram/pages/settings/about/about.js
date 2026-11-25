const api = require('../../../utils/api.js')
const timeZoneOf = require('../../../utils/time-zone.js')
const privacy = require('../../../utils/privacy.js')
const guide = require('../../../utils/guide.js')
const report = require('../../../utils/report.js')

function timeZone() {
  return timeZoneOf.deviceTimeZone()
}

Page({
  data: { shareReady: false, dialog: '', privacyName: '《隐私保护指引》', guideId: '', guide: null, hole: null, bubble: null },

  onShow() {
    this.syncGuide()
    const page = this
    if (!wx.getPrivacySetting) return
    wx.getPrivacySetting({
      success(res) {
        page.needPrivacy = !!res.needAuthorization
        if (res.privacyContractName) page.setData({ privacyName: res.privacyContractName })
      },
    })
  },

  syncGuide() {
    const step = guide.current()
    if (step !== 'backup') {
      this.setData({ guideId: '', guide: null, hole: null, bubble: null })
      return
    }
    const page = this
    this.setData({ guideId: 'backup', guide: guide.view('backup') }, function () { page.placeGuide() })
  },

  placeGuide(attempt) {
    const step = guide.view('backup')
    const page = this
    this.createSelectorQuery().select(step.selector).boundingClientRect(function (rect) {
      if (!rect || !rect.width) {
        if ((attempt || 0) < 6) setTimeout(function () { page.placeGuide((attempt || 0) + 1) }, 40)
        return
      }
      let winW = 375
      let winH = 667
      try {
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        if (info && info.windowWidth) winW = info.windowWidth
        if (info && info.windowHeight) winH = info.windowHeight
      } catch (err) {
        winW = 375
      }
      const spot = guide.spotlight(rect, winW, winH)
      page.setData({ hole: spot.hole, bubble: spot.bubble })
    }).exec()
  },

  finishGuide() {
    guide.advance('backup')
    this.setData({ guideId: '', guide: null, hole: null, bubble: null })
    wx.navigateBack()
  },

  showPrivacy(resolve) { privacy.show(this, resolve) },
  agreePrivacy() {
    privacy.agree(this)
    if (!this.pendingImport) return
    this.pendingImport = false
    this.needPrivacy = false
    this.openImport()
  },
  refusePrivacy() {
    this.pendingImport = false
    privacy.refuse(this)
  },
  openPrivacy() { privacy.openContract() },

  exportBackup() {
    const page = this
    api.call('export', {}).then(function (res) {
      if (!res.ok) {
        wx.showToast({ title: res.error || '无法导出', icon: 'none' })
        return
      }
      try {
        const path = wx.env.USER_DATA_PATH + '/吃饭喵-备份.json'
        wx.getFileSystemManager().writeFileSync(path, JSON.stringify(res.data), 'utf8')
        page.backupPath = path
        page.setData({ shareReady: true })
        wx.showToast({ title: '再点一次发送到聊天', icon: 'none' })
      } catch (err) {
        report.report('about.export', err)
        wx.showToast({ title: '无法导出', icon: 'none' })
      }
    })
  },

  sendBackup() {
    if (!this.backupPath) return
    wx.shareFileMessage({
      filePath: this.backupPath,
      fileName: '吃饭喵-备份.json',
      fail(err) {
        const msg = (err && err.errMsg) || ''
        if (msg.indexOf('cancel') >= 0) return
        report.report('about.send', err)
        wx.showToast({ title: '无法发送', icon: 'none' })
      },
    })
  },

  importBackup() {
    if (this.needPrivacy === true) {
      this.pendingImport = true
      privacy.show(this)
      return
    }
    this.openImport()
  },

  openImport() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      fail(err) { showImportError(err) },
      success(chosen) {
        const file = chosen.tempFiles && chosen.tempFiles[0]
        if (!file) return
        wx.getFileSystemManager().readFile({
          filePath: file.path,
          encoding: 'utf8',
          success(read) {
            let backup = null
            try { backup = JSON.parse(read.data) } catch (err) {
              report.report('about.import', 'invalid json')
              backup = null
            }
            if (!backup) {
              wx.showToast({ title: '无法导入', icon: 'none' })
              return
            }
            api.call('import', { backup: backup }).then(function (res) {
              wx.showToast({ title: res.ok ? '已导入' : '无法导入', icon: res.ok ? 'success' : 'none' })
              if (res.ok) api.call('sync', { timeZone: timeZone() })
            })
          },
          fail(err) {
            report.report('about.read', err)
            wx.showToast({ title: '无法导入', icon: 'none' })
          },
        })
      },
    })
  },
})

function showImportError(err) {
  const msg = (err && err.errMsg) || ''
  if (!msg || msg.indexOf('cancel') >= 0) return
  report.report('about.file', err)
  if (err && (err.errno === 112 || msg.indexOf('not declared') >= 0)) {
    wx.showModal({
      title: '还不能导入',
      content: '导入备份要勾「收集你选中的文件」。若已经勾了，等大约 5 分钟，再从最近使用里删掉小程序重进。',
      showCancel: false,
    })
    return
  }
  wx.showToast({ title: '无法打开文件', icon: 'none' })
}
