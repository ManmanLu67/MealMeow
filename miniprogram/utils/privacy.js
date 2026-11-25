// 相册、相机、聊天文件都要先让用户看过《隐私保护指引》。
// 弹窗写在页面里，和删除确认同一套定位。自定义组件里的 fixed 在实机上盖不住页面。

function show(page, resolve) {
  if (resolve) page.privacyResolve = resolve
  page.setData({ dialog: 'privacy' })
  if (resolve) resolve({ event: 'exposureAuthorization' })
  if (!wx.getPrivacySetting) return
  wx.getPrivacySetting({
    success(res) {
      if (page.data.dialog !== 'privacy') return
      page.setData({ privacyName: res.privacyContractName || '《隐私保护指引》' })
    },
  })
}

function agree(page) {
  const resolve = page.privacyResolve
  page.privacyResolve = null
  page.setData({ dialog: '' })
  if (resolve) resolve({ buttonId: 'agree-btn', event: 'agree' })
}

function refuse(page) {
  const resolve = page.privacyResolve
  page.privacyResolve = null
  page.setData({ dialog: '' })
  if (resolve) resolve({ event: 'disagree' })
}

function openContract() {
  if (!wx.openPrivacyContract) {
    wx.showModal({
      title: '打不开隐私指引',
      content: '当前微信版本过低，无法打开《用户隐私保护指引》。',
      showCancel: false,
    })
    return
  }
  wx.openPrivacyContract({
    fail(err) {
      wx.showModal({
        title: '打不开隐私指引',
        content: (err && err.errMsg) || '请在小程序后台填写并发布《用户隐私保护指引》。',
        showCancel: false,
      })
    },
  })
}

module.exports = { show, agree, refuse, openContract }
