// 提醒开关存在本机。开着时，每打完一餐都问要不要订阅下一餐。
const api = require('../../../utils/api.js')
const config = require('../../../utils/config.js')
const remind = require('../../../utils/remind.js')

function templates() {
  const ids = config.subscribeTmplIds
  return Array.isArray(ids) ? ids.filter(function (id) { return typeof id === 'string' && id }) : []
}

Page({
  data: { on: false },

  onShow() {
    this.setData({ on: remind.enabled() })
  },

  onSwitch(event) {
    const page = this
    const on = !!event.detail.value
    if (!on) {
      remind.setEnabled(false)
      this.setData({ on: false })
      return
    }
    const ids = templates()
    if (!ids.length || !wx.requestSubscribeMessage) {
      this.setData({ on: false })
      wx.showToast({ title: '还没有订阅模板', icon: 'none' })
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: ids.slice(0, 3),
      success(res) {
        const answer = res[ids[0]]
        const granted = answer === 'accept' || answer === 'acceptWithAudio' || answer === 'acceptWithAlert'
        if (!granted) {
          remind.setEnabled(false)
          page.setData({ on: false })
          return
        }
        remind.setEnabled(true)
        page.setData({ on: true })
        api.call('home', {}).then(function (home) {
          if (home && home.ok) remind.armFromChips(home.data.date, home.data.chips)
        })
      },
      fail() {
        remind.setEnabled(false)
        page.setData({ on: false })
        wx.showToast({ title: '订阅没有打开', icon: 'none' })
      },
    })
  },
})
