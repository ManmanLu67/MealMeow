Component({
  properties: {
    show: { type: Boolean, value: false },
    value: { type: String, value: '' },
  },

  data: { draft: '' },

  observers: {
    'show, value': function (show, value) {
      if (show) this.setData({ draft: value || '' })
    },
  },

  methods: {
    onInput(event) {
      this.setData({ draft: event.detail.value })
    },

    cancel() {
      this.triggerEvent('cancel')
    },

    confirm() {
      const nickname = (this.data.draft || '').trim()
      if (!nickname) {
        wx.showToast({ title: '请设置你的昵称', icon: 'none' })
        return
      }
      this.triggerEvent('confirm', { nickname: nickname })
    },

    hold() {},
  },
})
