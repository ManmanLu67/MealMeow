Component({
  data: {
    selected: 0,
    badge: false,
  },
  methods: {
    switchTab(event) {
      const index = Number(event.currentTarget.dataset.index)
      const urls = ['/pages/home/home', '/pages/gallery/gallery', '/pages/me/me']
      wx.switchTab({ url: urls[index] })
    },
  },
})
