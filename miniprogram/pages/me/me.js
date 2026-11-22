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
})
