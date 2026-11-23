const api = require('../../utils/api.js')
const config = require('../../utils/config.js')
const preview = require('../../utils/preview.js')

Page({
  data: { nickname: '', initial: '', accountId: '' },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    // 昵称和账号 ID 由云端按登录态返回。账号 ID 只展示，不提供搜索、邀请、复制入口。
    const view = config.usePreviewData ? preview.meView() : null
    if (view) {
      const nickname = view.nickname || '吃饭人'
      this.setData({ nickname: nickname, initial: nickname.slice(0, 1), accountId: view.accountId })
      return
    }
    const self = this
    api.call('me', {}).then(function (res) {
      const data = res.ok && res.data ? res.data : {}
      const nickname = data.nickname || '吃饭人'
      self.setData({ nickname: nickname, initial: nickname.slice(0, 1), accountId: data.accountId || '' })
    })
  },

  closeAccount() {
    wx.showModal({
      title: '注销账号',
      content: '这台手机上的打卡、宠物和照片会删掉，不能恢复。',
      confirmText: '注销',
      confirmColor: '#B84E0C',
      success(res) {
        if (!res.confirm) return
        api.call('closeAccount', {}).then(function (result) {
          if (!result.ok) {
            wx.showToast({ title: result.error || '注销失败', icon: 'none' })
            return
          }
          wx.removeStorageSync('localUserId')
          wx.removeStorageSync('subscribeState')
          wx.reLaunch({ url: '/pages/start/start' })
        })
      },
    })
  },
})
