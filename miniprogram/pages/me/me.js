const api = require('../../utils/api.js')
const config = require('../../utils/config.js')
const preview = require('../../utils/preview.js')
const nickname = require('../../utils/nickname.js')
const guide = require('../../utils/guide.js')

Page({
  data: { nickname: '', nicknameSet: false, initial: '', accountId: '', nicknameOpen: false, nicknameDraft: '' },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    // 昵称和账号 ID 由云端按登录态返回。账号 ID 只展示，不提供搜索、邀请、复制入口。
    const view = config.usePreviewData ? preview.meView() : null
    if (view) {
      const shown = nickname.shown(view.nickname)
      this.setData({ nickname: shown.nickname, nicknameSet: shown.nicknameSet, initial: shown.initial, accountId: view.accountId })
      return
    }
    const self = this
    api.call('me', {}).then(function (res) {
      const data = res.ok && res.data ? res.data : {}
      const shown = nickname.shown(data.nickname)
      self.setData({ nickname: shown.nickname, nicknameSet: shown.nicknameSet, initial: shown.initial, accountId: data.accountId || '' })
    })
  },

  editNickname() {
    const self = this
    this._nicknameSyncFirst = true
    this._afterNickname = function () { self.onShow() }
    this.setData({
      nicknameOpen: true,
      nicknameDraft: this.data.nicknameSet ? this.data.nickname : '',
    })
  },

  onNicknameConfirm(event) {
    if (config.usePreviewData) {
      const shown = nickname.shown(event.detail.nickname)
      this.setData({ nicknameOpen: false, nickname: shown.nickname, nicknameSet: shown.nicknameSet, initial: shown.initial })
      return
    }
    nickname.save(this, event.detail.nickname)
  },

  onNicknameCancel() {
    nickname.cancel(this)
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
          guide.reset()
          wx.switchTab({ url: '/pages/home/home' })
        })
      },
    })
  },
})
