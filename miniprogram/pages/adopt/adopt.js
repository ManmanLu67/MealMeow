const api = require('../../utils/api.js')
const config = require('../../utils/config.js')
const preview = require('../../utils/preview.js')

Page({
  data: { canAdopt: true, cooldownDays: 0, dialog: false },

  onLoad(query) {
    this.previewState = query.state || ''
  },

  onShow() {
    const self = this
    if (config.usePreviewData) {
      this.setData(preview.adoptView(this.previewState))
      return
    }
    api.call('adoptView', {}).then(function (res) {
      if (res.ok) self.setData(res.data)
    })
  },

  ask() {
    // 冷却中页面不给出可点的领养按钮，这里再挡一层。
    if (!this.data.canAdopt) return
    this.setData({ dialog: true })
  },

  closeDialog() { this.setData({ dialog: false }) },

  confirm() {
    this.setData({ dialog: false })
    if (config.usePreviewData) {
      wx.showToast({ title: '已领养', icon: 'success' })
      setTimeout(function () { wx.switchTab({ url: '/pages/home/home' }) }, 600)
      return
    }
    api.call('adopt', {}).then(function (res) {
      if (res.ok) wx.switchTab({ url: '/pages/home/home' })
      else wx.showToast({ title: res.error || '领养失败，请重试', icon: 'none' })
    })
  },
})
