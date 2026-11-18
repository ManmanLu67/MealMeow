const config = require('../../utils/config.js')
const preview = require('../../utils/preview.js')

Page({
  data: {
    pets: [],
  },

  onLoad(query) {
    this.previewState = query.state || ''
    if (config.usePreviewData) {
      this.setData({ pets: preview.memorialList() })
      return
    }
    this.setData({ pets: [] })
  },

  openDetail(event) {
    const id = event.currentTarget.dataset.id
    const state = this.previewState ? '&state=' + this.previewState : ''
    wx.navigateTo({ url: '/pages/memorial/detail?id=' + id + state })
  },
})
