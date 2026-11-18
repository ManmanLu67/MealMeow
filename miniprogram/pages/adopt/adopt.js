const api = require('../../utils/api.js')
const config = require('../../utils/config.js')
const preview = require('../../utils/preview.js')
const pets = require('../../utils/pets.js')

Page({
  data: { canAdopt: true, cooldownDays: 0, dialog: false, name: '', species: 'cat', looks: [] },

  onLoad(query) {
    this.previewState = query.state || ''
  },

  onShow() {
    const self = this
    const kept = { looks: pets.looks(), species: this.data.species || 'cat' }
    if (config.usePreviewData) {
      this.setData(Object.assign({}, preview.adoptView(this.previewState), kept))
      return
    }
    api.call('adoptView', {}).then(function (res) {
      if (res.ok) self.setData(Object.assign({}, res.data, kept))
    })
  },

  onName(event) {
    this.setData({ name: event.detail.value })
  },

  selectLook(event) {
    const species = event.currentTarget.dataset.species
    if (pets.isSpecies(species)) this.setData({ species: species })
  },

  ask() {
    // 冷却中页面不给出可点的领养按钮，这里再挡一层。
    if (!this.data.canAdopt) return
    this.setData({ dialog: true })
  },

  closeDialog() { this.setData({ dialog: false }) },

  confirm() {
    this.setData({ dialog: false })
    const species = this.data.species
    if (config.usePreviewData) {
      wx.setStorageSync('previewSpecies', species)
      wx.showToast({ title: '已领养', icon: 'success' })
      setTimeout(function () { wx.switchTab({ url: '/pages/home/home' }) }, 600)
      return
    }
    // 名字可选，云端会校验长度和字符，空则用默认名「小饭」。
    api.call('adopt', { name: this.data.name, species: species }).then(function (res) {
      if (res.ok) wx.switchTab({ url: '/pages/home/home' })
      else wx.showToast({ title: res.error || '领养失败，请重试', icon: 'none' })
    })
  },
})
