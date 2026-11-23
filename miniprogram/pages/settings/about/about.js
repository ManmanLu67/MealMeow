const api = require('../../../utils/api.js')

function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  } catch (err) {
    return 'Asia/Shanghai'
  }
}

Page({
  data: { shareReady: false },

  exportBackup() {
    const page = this
    api.call('export', {}).then(function (res) {
      if (!res.ok) {
        wx.showToast({ title: res.error || '无法导出', icon: 'none' })
        return
      }
      try {
        const path = wx.env.USER_DATA_PATH + '/吃饭喵-备份.json'
        wx.getFileSystemManager().writeFileSync(path, JSON.stringify(res.data), 'utf8')
        page.backupPath = path
        page.setData({ shareReady: true })
        wx.showToast({ title: '再点一次发送到聊天', icon: 'none' })
      } catch (err) {
        wx.showToast({ title: '无法导出', icon: 'none' })
      }
    })
  },

  sendBackup() {
    if (!this.backupPath) return
    wx.shareFileMessage({
      filePath: this.backupPath,
      fileName: '吃饭喵-备份.json',
      fail() { wx.showToast({ title: '无法发送', icon: 'none' }) },
    })
  },

  importBackup() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['json'],
      success(chosen) {
        const file = chosen.tempFiles && chosen.tempFiles[0]
        if (!file) return
        wx.getFileSystemManager().readFile({
          filePath: file.path,
          encoding: 'utf8',
          success(read) {
            let backup = null
            try { backup = JSON.parse(read.data) } catch (err) { backup = null }
            if (!backup) {
              wx.showToast({ title: '无法导入', icon: 'none' })
              return
            }
            api.call('import', { backup: backup }).then(function (res) {
              wx.showToast({ title: res.ok ? '已导入' : '无法导入', icon: res.ok ? 'success' : 'none' })
              if (res.ok) api.call('sync', { timeZone: timeZone() })
            })
          },
          fail() { wx.showToast({ title: '无法导入', icon: 'none' }) },
        })
      },
    })
  },
})
