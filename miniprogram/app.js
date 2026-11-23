App({
  onLaunch() {
    // 这一版不连云。云函数还在仓库里，页面不调用。
    if (!wx.onNeedPrivacyAuthorization) return
    wx.onNeedPrivacyAuthorization(function (resolve) {
      const pages = getCurrentPages()
      const page = pages[pages.length - 1]
      if (page && typeof page.showPrivacy === 'function') page.showPrivacy(resolve)
    })
  },
})
