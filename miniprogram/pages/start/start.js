const api = require('../../utils/api.js')

function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  } catch (err) {
    return 'Asia/Shanghai'
  }
}

Page({
  data: { nickname: '' },

  onInput(event) {
    this.setData({ nickname: event.detail.value })
  },

  confirm() {
    const nickname = (this.data.nickname || '').trim()
    if (!nickname) {
      wx.showToast({ title: '请设置你的昵称', icon: 'none' })
      return
    }
    api.call('sync', { timeZone: timeZone(), nickname: nickname }).then(function (res) {
      if (!res.ok) {
        wx.showToast({ title: res.error || '请设置你的昵称', icon: 'none' })
        return
      }
      wx.switchTab({ url: '/pages/home/home' })
    })
  },
})
