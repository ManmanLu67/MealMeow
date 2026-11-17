const config = require('../../utils/config.js')
const preview = require('../../utils/preview.js')

Page({
  data: { nickname: '', initial: '', accountId: '' },

  onShow() {
    // 昵称和账号 ID 由云端按登录态返回。账号 ID 只展示，不提供搜索、邀请、复制入口。
    const view = config.usePreviewData ? preview.meView() : { nickname: '', accountId: '' }
    const nickname = view.nickname || '吃饭人'
    this.setData({ nickname: nickname, initial: nickname.slice(0, 1), accountId: view.accountId })
  },
})
