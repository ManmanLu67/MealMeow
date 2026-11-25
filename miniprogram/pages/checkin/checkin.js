// 打卡页。三餐和零食共用一个页面：meal 打一餐，snack 记窗口外的零食。
// 选图只进预览，点「完成打卡」才写入。一餐/一份零食可多张，首屏一张主图。
const api = require('../../utils/api.js')
const config = require('../../utils/config.js')
const feedback = require('../../utils/feedback.js')
const preview = require('../../utils/preview.js')
const labels = require('../../utils/labels.js')
const remind = require('../../utils/remind.js')
const privacy = require('../../utils/privacy.js')

const MAX_PHOTOS = 9

Page({
  data: {
    mode: 'meal',
    meal: '',
    mealName: '这一餐',
    windowEnd: '',
    checkedAt: '',
    checked: false,
    staple: false,
    settled: false,
    stapleLeft: 0,
    photos: [],
    dialog: '',
    privacyName: '《隐私保护指引》',
  },

  onShow() {
    const page = this
    if (!wx.getPrivacySetting) return
    wx.getPrivacySetting({
      success(res) {
        page.needPrivacy = !!res.needAuthorization
        if (res.privacyContractName) page.setData({ privacyName: res.privacyContractName })
      },
    })
  },

  onLoad(query) {
    this.previewState = query.state || ''
    this.date = query.date || ''
    this.mode = query.mode === 'snack' ? 'snack' : 'meal'
    const meal = query.meal || ''
    this.meal = meal
    if (this.mode === 'snack') {
      this.setData({ mode: 'snack', mealName: labels.SNACK_NAME })
    } else {
      this.setData({ mode: 'meal', mealName: labels.MEAL_NAME[meal] || '这一餐' })
    }
    if (config.usePreviewData) {
      const view = preview.checkinView(this.mode === 'snack' ? 'snack' : meal, this.previewState)
      this.setData({
        windowEnd: view.windowEnd,
        checkedAt: view.checkedAt,
        checked: view.checked,
        staple: view.staple,
        stapleLeft: view.stapleLeft,
        photos: view.checked ? ['/assets/preview/lunch.png'] : [],
      })
    }
  },

  close() {
    wx.navigateBack({ fail() { wx.switchTab({ url: '/pages/home/home' }) } })
  },

  afterCheckin(leave) {
    const ids = templateIds()
    this.leaveAfterRemind = !!leave
    if (this.data.mode === 'snack' || !ids.length || !remind.enabled()) {
      if (leave && !config.usePreviewData) this.close()
      return
    }
    this.setData({ dialog: 'remind' })
  },

  acceptRemind() {
    const ids = templateIds()
    const page = this
    if (!ids.length || !wx.requestSubscribeMessage) {
      this.close()
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: ids.slice(0, 3),
      success(res) {
        const answer = res[ids[0]]
        if (answer === 'accept' || answer === 'acceptWithAudio' || answer === 'acceptWithAlert') {
          remind.armAfter(page.date, page.meal)
        } else {
          remind.clear()
        }
      },
      fail() { remind.clear() },
      complete() {
        page.setData({ dialog: '' })
        if (page.leaveAfterRemind && !config.usePreviewData) page.close()
      },
    })
  },

  declineRemind() {
    remind.clear()
    this.setData({ dialog: '' })
    if (this.leaveAfterRemind && !config.usePreviewData) this.close()
  },

  // 拍照和相册只往预览里加图，不写库。
  takePhoto() { this.choose(['camera']) },
  pickAlbum() { this.choose(['album']) },

  showPrivacy(resolve) { privacy.show(this, resolve) },
  agreePrivacy() {
    privacy.agree(this)
    const pending = this.pendingPick
    this.pendingPick = null
    if (!pending) return
    this.needPrivacy = false
    this.openPicker(pending)
  },
  refusePrivacy() {
    this.pendingPick = null
    privacy.refuse(this)
  },
  openPrivacy() { privacy.openContract() },

  choose(sourceType) {
    const room = MAX_PHOTOS - this.data.photos.length
    if (room <= 0) {
      wx.showToast({ title: '最多 ' + MAX_PHOTOS + ' 张', icon: 'none' })
      return
    }
    if (this.needPrivacy === true) {
      this.pendingPick = sourceType
      privacy.show(this)
      return
    }
    this.openPicker(sourceType)
  },

  openPicker(sourceType) {
    const self = this
    const room = MAX_PHOTOS - this.data.photos.length
    if (room <= 0) return
    // 拍照一次一张。选图必须在这次点击里直接调用，实机才肯打开相机和相册。
    const count = sourceType[0] === 'camera' ? 1 : room
    wx.chooseImage({
      count: count,
      sizeType: ['compressed', 'original'],
      sourceType: sourceType,
      success(res) {
        const paths = res.tempFilePaths || []
        self.setData({ photos: self.data.photos.concat(paths) })
        if (sourceType.length === 1 && sourceType[0] === 'camera') paths.forEach(saveToAlbum)
      },
      fail(err) { showPickError(self, err) },
    })
  },

  replacePhoto() {
    const self = this
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed', 'original'],
      sourceType: ['album', 'camera'],
      success(res) {
        const path = res.tempFilePaths && res.tempFilePaths[0]
        if (!path) return
        self.setData({ photos: [path] })
        wx.showToast({ title: '已替换，重新审核', icon: 'none' })
      },
      fail(err) { showPickError(self, err) },
    })
  },

  finish() {
    if (!this.data.photos.length) {
      wx.showToast({ title: '先拍一张照片', icon: 'none' })
      return
    }
    const self = this
    if (config.usePreviewData) {
      this.setData({ checked: true, checkedAt: '12:06' })
      feedback.play(this.data.mode === 'snack' ? 'checkin' : 'eat')
      wx.showToast({ title: this.data.mode === 'snack' ? '已记录零食' : '已打卡', icon: 'success' })
      this.afterCheckin(true)
      return
    }
    // 三餐传餐次，零食只传照片。日期和窗口由本机按设备时区判断。
    const action = this.data.mode === 'snack' ? 'snack' : 'checkin'
    savePhotos(this.data.photos).then(function (ids) {
      const payload = self.data.mode === 'snack'
        ? { photos: ids }
        : { meal: self.meal, photos: ids }
      return api.call(action, payload)
    }).then(function (res) {
      if (!res || !res.ok) {
        wx.showToast({ title: (res && res.error) || '打卡失败，请重试', icon: 'none' })
        return
      }
      self.setData({ checked: true })
      feedback.play(self.data.mode === 'snack' ? 'checkin' : 'eat')
      self.afterCheckin(true)
    }).catch(function () {
      wx.showToast({ title: '照片保存失败，请重试', icon: 'none' })
    })
  },

  askStaple() { this.setData({ dialog: 'staple' }) },
  askDelete() { this.setData({ dialog: 'delete' }) },
  closeDialog() { this.setData({ dialog: '' }) },

  confirmStaple() {
    const self = this
    this.setData({ dialog: '', staple: true, photos: [] })
    if (config.usePreviewData) {
      feedback.play('eat')
      this.afterCheckin(false)
      return
    }
    api.call('exempt', { meal: this.meal }).then(function (res) {
      if (res && res.ok) {
        feedback.play('eat')
        self.afterCheckin(false)
      }
    })
  },

  confirmDelete() {
    const self = this
    this.setData({ dialog: '' })
    if (config.usePreviewData) {
      this.setData({ checked: false, photos: [] })
      wx.showToast({ title: '已删除', icon: 'none' })
      return
    }
    // 删除要带日期（以后图鉴里也能删以前的），日期来自首页传进来的 date。
    api.call('deleteCheckin', { date: this.date, meal: this.meal }).then(function (res) {
      if (!res.ok) {
        wx.showToast({ title: res.error || '删除失败，请重试', icon: 'none' })
        return
      }
      self.setData({ checked: false, photos: [] })
      wx.showToast({ title: '已删除', icon: 'none' })
    })
  },
})

function showPickError(page, err) {
  const msg = (err && err.errMsg) || ''
  if (!msg || msg.indexOf('cancel') >= 0) return
  if (err && (err.errno === 112 || msg.indexOf('not declared') >= 0)) {
    wx.showModal({
      title: '还不能选照片',
      content: '拍照和相册要另勾「收集你选中的照片或视频信息」。已勾的摄像头、写入相册、选中的文件都不管这一项。补上后大约 5 分钟生效，再从最近使用里删掉小程序重进。',
      confirmText: '查看指引',
      success(res) { if (res.confirm) privacy.openContract() },
    })
    return
  }
  if (msg.indexOf('privacy api banned') >= 0) {
    wx.showModal({
      title: '还不能拍照',
      content: '这次提审勾了「未采集隐私」，或指引还没声明选照片和摄像头，微信停用了这两个接口。',
      showCancel: false,
    })
    return
  }
  if (msg.indexOf('privacy') >= 0 || msg.indexOf('隐私') >= 0) {
    if (page && typeof page.showPrivacy === 'function') page.showPrivacy()
    else wx.showToast({ title: '请先同意隐私指引', icon: 'none' })
    return
  }
  if (msg.indexOf('auth') >= 0 || msg.indexOf('deny') >= 0 || msg.indexOf('permission') >= 0) {
    wx.showModal({
      title: '无法打开',
      content: '请允许微信使用相机和相册。',
      confirmText: '去设置',
      success(res) { if (res.confirm && wx.openSetting) wx.openSetting({}) },
    })
    return
  }
  wx.showToast({ title: '无法打开相机或相册', icon: 'none' })
}

function saveToAlbum(filePath) {
  const write = function () {
    wx.saveImageToPhotosAlbum({
      filePath: filePath,
      success() { wx.showToast({ title: '已存入相册', icon: 'none' }) },
      fail(err) { showAlbumError(err) },
    })
  }
  if (!wx.getSetting) {
    write()
    return
  }
  wx.getSetting({
    success(res) {
      const allowed = res.authSetting && res.authSetting['scope.writePhotosAlbum']
      if (allowed === false) {
        askAlbumSetting()
        return
      }
      write()
    },
    fail: write,
  })
}

function askAlbumSetting() {
  wx.showModal({
    title: '无法存入相册',
    content: '请允许保存到系统相册，拍下的照片才会留在相机相册里。',
    confirmText: '去设置',
    success(res) { if (res.confirm && wx.openSetting) wx.openSetting({}) },
  })
}

function showAlbumError(err) {
  const msg = (err && err.errMsg) || ''
  if (!msg || msg.indexOf('cancel') >= 0) return
  if (msg.indexOf('auth') >= 0 || msg.indexOf('deny') >= 0 || msg.indexOf('authorize') >= 0) {
    askAlbumSetting()
    return
  }
  if (err && (err.errno === 112 || msg.indexOf('not declared') >= 0)) {
    wx.showModal({
      title: '无法存入相册',
      content: '指引里要有「相册（仅写入）」。补上后大约 5 分钟生效。',
      showCancel: false,
    })
    return
  }
  wx.showToast({ title: '没能存入相册', icon: 'none' })
}

function templateIds() {
  const ids = config.subscribeTmplIds
  return Array.isArray(ids) ? ids.filter(function (id) { return typeof id === 'string' && id }) : []
}

function savePhotos(paths) {
  const root = wx.env.USER_DATA_PATH + '/photos'
  const fs = wx.getFileSystemManager()
  try { fs.mkdirSync(root, true) } catch (err) { /* 目录已在 */ }
  return Promise.all(paths.map(function (path, index) {
    if (typeof path === 'string' && path.indexOf(root + '/') === 0) return Promise.resolve(path)
    return wx.compressImage({ src: path, quality: 20 }).then(function (res) {
      const dest = root + '/' + Date.now() + '-' + index + '.jpg'
      return new Promise(function (resolve, reject) {
        fs.saveFile({
          tempFilePath: res.tempFilePath,
          filePath: dest,
          success() { resolve(dest) },
          fail: reject,
        })
      })
    })
  }))
}
