Component({
  data: { visible: false },

  methods: {
    open(resolve) {
      this.resolvePrivacy = resolve
      this.setData({ visible: true })
      wx.nextTick(function () {
        resolve({ event: 'exposureAuthorization' })
      })
    },

    agree() {
      const resolve = this.resolvePrivacy
      this.resolvePrivacy = null
      this.setData({ visible: false })
      if (resolve) resolve({ buttonId: 'agree-btn', event: 'agree' })
    },

    refuse() {
      const resolve = this.resolvePrivacy
      this.resolvePrivacy = null
      this.setData({ visible: false })
      if (resolve) resolve({ event: 'disagree' })
    },

    openContract() {
      if (!wx.openPrivacyContract) return
      wx.openPrivacyContract({
        fail() {
          wx.showToast({ title: '请先在小程序后台填写隐私保护指引', icon: 'none' })
        },
      })
    },
  },
})
