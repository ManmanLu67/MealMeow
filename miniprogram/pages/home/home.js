// 页面只渲染视图模型，不重算规则。视图模型来自云函数 home（计划 views / wechat）。
// 在云函数接上之前，config.usePreviewData 为 true，页面读 utils/preview.js 的样例，
// 这样能在微信开发者工具里看到完整界面。接上云函数后把它改成 false。
const api = require('../../utils/api.js')
const config = require('../../utils/config.js')
const preview = require('../../utils/preview.js')
const labels = require('../../utils/labels.js')

const PET_TAP_COOLDOWN_MS = 600

Page({
  data: {
    date: '',
    dateLabel: '',
    chips: [],
    badge: false,
    petView: 'pasture',
    petName: '',
    band: 'full',
    bandText: '',
    companyDays: 0,
    mealsEaten: 0,
    cooldownDays: 0,
    camera: { type: 'toast', meals: [] },
    pickMeals: [],
    sheet: '',
    bandNote: '',
    bounce: false,
    heart: false,
  },

  onLoad(query) {
    this.previewState = query.state || ''
    this.lastPetTap = 0
  },

  onShow() {
    this.load()
  },

  load() {
    const self = this
    const done = function (view) {
      self.apply(view)
    }
    if (config.usePreviewData) {
      done(preview.homeView(this.previewState))
      return
    }
    api.call('sync', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).then(function () {
      return api.call('home', {})
    }).then(function (res) {
      if (res.ok) done(res.data)
      else wx.showToast({ title: '加载失败，请稍后再试', icon: 'none' })
    })
  },

  apply(view) {
    this.setData({
      date: view.date,
      dateLabel: view.dateLabel,
      chips: view.chips,
      badge: view.badge,
      petView: view.petView,
      petName: view.petName || '小饭',
      band: view.band,
      bandText: view.bandText,
      companyDays: view.companyDays,
      mealsEaten: view.mealsEaten,
      cooldownDays: view.cooldownDays,
      camera: view.camera,
      bandNote: labels.bandNote(view.band, view.petName),
    })
    // 红点只出现在首页 Tab 上，且只表示窗口内还有没打的餐。
    if (view.badge) wx.showTabBarRedDot({ index: 0 })
    else wx.hideTabBarRedDot({ index: 0 })
  },

  onChip(event) {
    const meal = event.currentTarget.dataset.meal
    const chip = this.data.chips.filter(function (c) { return c.meal === meal })[0]
    if (!chip) return
    if (chip.state === 'upcoming') {
      wx.showToast({ title: '还没到打卡时间', icon: 'none' })
      return
    }
    if (chip.state === 'missed') {
      wx.showToast({ title: '这一餐的窗口已经结束', icon: 'none' })
      return
    }
    this.goCheckin(meal)
  },

  onCamera() {
    const action = this.data.camera
    if (action.type === 'checkin') {
      this.goCheckin(action.meal)
    } else if (action.type === 'pick') {
      this.setData({ sheet: 'pick', pickMeals: action.meals })
    } else if (action.type === 'snack') {
      this.goSnack()
    } else {
      wx.showToast({ title: '这一餐已经打过啦', icon: 'none' })
    }
  },

  pickMeal(event) {
    this.setData({ sheet: '' })
    this.goCheckin(event.currentTarget.dataset.meal)
  },

  goCheckin(meal) {
    const state = this.previewState ? '&state=' + this.previewState : ''
    wx.navigateTo({ url: '/pages/checkin/checkin?mode=meal&meal=' + meal + '&date=' + this.data.date + state })
  },

  goSnack() {
    const state = this.previewState ? '&state=' + this.previewState : ''
    wx.navigateTo({ url: '/pages/checkin/checkin?mode=snack&date=' + this.data.date + state })
  },

  goAdopt() {
    wx.navigateTo({ url: '/pages/adopt/adopt' + (this.previewState ? '?state=' + this.previewState : '') })
  },

  onPetTap() {
    // 濒危时宠物虚弱，只眨眼，不弹跳，也不飘爱心。
    if (this.data.band === 'critical') return
    const now = Date.now()
    if (now - this.lastPetTap < PET_TAP_COOLDOWN_MS) return
    this.lastPetTap = now
    const self = this
    this.setData({ bounce: true, heart: true })
    if (wx.getStorageSync('haptics') !== false) wx.vibrateShort({ type: 'light' })
    setTimeout(function () { self.setData({ bounce: false, heart: false }) }, 900)
  },

  openPet() {
    this.setData({ sheet: 'pet' })
  },

  closeSheet() {
    this.setData({ sheet: '' })
  },
})
