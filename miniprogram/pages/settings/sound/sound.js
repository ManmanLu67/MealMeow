const feedback = require('../../../utils/feedback.js')

// 声音与震动。音效默认关，震动默认开（DESIGN.md 7.5）。
// 偏好存在本机，不上云：这是设备上的体验设置，不是产品规则。
Page({
  data: { sound: false, haptics: true },

  onShow() {
    this.setData({
      sound: wx.getStorageSync('sound') === true,
      haptics: wx.getStorageSync('haptics') !== false,
    })
  },

  onSound(event) {
    const on = !!event.detail.value
    wx.setStorageSync('sound', on)
    this.setData({ sound: on })
    if (on) feedback.play('tap')
  },

  onHaptics(event) {
    wx.setStorageSync('haptics', event.detail.value)
    this.setData({ haptics: event.detail.value })
  },
})
