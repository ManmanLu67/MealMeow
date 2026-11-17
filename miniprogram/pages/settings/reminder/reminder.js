// 提醒设置。只显示状态文案，不展示额度数字。手机日历接口没核实之前不出现。
const STATUS = {
  granted: { text: '已授权', tag: 'tag-full', button: '已开启订阅消息' },
  denied: { text: '未授权', tag: 'tag-peckish', button: '开启订阅消息' },
  low: { text: '额度不足', tag: 'tag-hungry', button: '再次开启订阅消息' },
}

Page({
  data: { statusText: '', statusTag: '', statusButton: '' },

  onShow() {
    // 订阅状态由 wx.getSetting 的 subscriptionsSetting 决定，接入云函数时补上。
    const state = wx.getStorageSync('subscribeState') || 'denied'
    const s = STATUS[state] || STATUS.denied
    this.setData({ statusText: s.text, statusTag: s.tag, statusButton: s.button })
  },

  subscribe() {
    wx.showToast({ title: '订阅消息接入后可用', icon: 'none' })
  },
})
