// 打卡页。三餐和零食共用一个页面：meal 打一餐，snack 记窗口外的零食。
// 选图只进预览，点「完成打卡」才写入。一餐/一份零食可多张，首屏一张主图。
const api = require('../../utils/api.js')
const config = require('../../utils/config.js')
const feedback = require('../../utils/feedback.js')
const preview = require('../../utils/preview.js')
const labels = require('../../utils/labels.js')

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

  afterCheckin() {
    const ids = templateIds()
    if (this.data.mode === 'snack' || !ids.length) {
      if (!config.usePreviewData) this.close()
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
      complete() {
        page.setData({ dialog: '' })
        if (!config.usePreviewData) page.close()
      },
    })
  },

  declineRemind() {
    this.setData({ dialog: '' })
    if (!config.usePreviewData) this.close()
  },

  // 拍照和相册只往预览里加图，不写库。
  takePhoto() { this.choose(['camera']) },
  pickAlbum() { this.choose(['album']) },

  choose(sourceType) {
    const self = this
    const room = MAX_PHOTOS - this.data.photos.length
    if (room <= 0) {
      wx.showToast({ title: '最多 ' + MAX_PHOTOS + ' 张', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: room,
      mediaType: ['image'],
      sourceType: sourceType,
      success(res) {
        const added = res.tempFiles.map(function (f) { return f.tempFilePath })
        self.setData({ photos: self.data.photos.concat(added) })
      },
    })
  },

  replacePhoto() {
    const self = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success(res) {
        self.setData({ photos: [res.tempFiles[0].tempFilePath] })
        wx.showToast({ title: '已替换，重新审核', icon: 'none' })
      },
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
      this.afterCheckin()
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
      self.afterCheckin()
    }).catch(function () {
      wx.showToast({ title: '照片保存失败，请重试', icon: 'none' })
    })
  },

  askStaple() { this.setData({ dialog: 'staple' }) },
  askDelete() { this.setData({ dialog: 'delete' }) },
  closeDialog() { this.setData({ dialog: '' }) },

  confirmStaple() {
    this.setData({ dialog: '', staple: true, photos: [] })
    if (config.usePreviewData) {
      feedback.play('eat')
      return
    }
    api.call('exempt', { meal: this.meal }).then(function (res) {
      if (res && res.ok) feedback.play('eat')
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
