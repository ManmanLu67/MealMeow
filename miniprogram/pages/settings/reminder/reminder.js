// 提醒设置。只显示状态文案，不展示额度数字。
const config = require('../../../utils/config.js')

const STATUS = {
  granted: { text: '已订阅', tag: 'tag-full', button: '再订一次提醒' },
  denied: { text: '未订阅', tag: 'tag-peckish', button: '订阅一次提醒' },
}

function templates() {
  const ids = config.subscribeTmplIds
  return Array.isArray(ids) ? ids.filter(function (id) { return typeof id === 'string' && id }) : []
}

function stateFromSetting(setting) {
  const ids = templates()
  const sub = setting && setting.subscriptionsSetting
  if (!sub || sub.mainSwitch === false) return 'denied'
  const items = sub.itemSettings || {}
  const value = ids.length ? items[ids[0]] : ''
  if (value === 'accept' || value === 'acceptWithAudio' || value === 'acceptWithAlert') return 'granted'
  if (value === 'reject' || value === 'ban') return 'denied'
  return wx.getStorageSync('subscribeState') || 'denied'
}

function show(page, state) {
  const s = STATUS[state] || STATUS.denied
  page.setData({ statusText: s.text, statusTag: s.tag, statusButton: s.button })
}

Page({
  data: { statusText: '', statusTag: '', statusButton: '' },

  onShow() {
    const page = this
    if (!wx.getSetting) {
      show(page, wx.getStorageSync('subscribeState') || 'denied')
      return
    }
    wx.getSetting({
      withSubscriptions: true,
      success(res) { show(page, stateFromSetting(res)) },
      fail() { show(page, wx.getStorageSync('subscribeState') || 'denied') },
    })
  },

  subscribe() {
    const page = this
    const ids = templates()
    if (!ids.length) {
      wx.showToast({ title: '还没有订阅模板', icon: 'none' })
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: ids.slice(0, 3),
      success(res) {
        const answer = res[ids[0]]
        const state = answer === 'accept' || answer === 'acceptWithAudio' || answer === 'acceptWithAlert'
          ? 'granted'
          : 'denied'
        wx.setStorageSync('subscribeState', state)
        show(page, state)
      },
      fail() {
        wx.showToast({ title: '订阅没有打开', icon: 'none' })
      },
    })
  },
})
