// 页面只渲染视图模型。云函数接上之前读 preview.js。
const api = require('../../utils/api.js')
const config = require('../../utils/config.js')
const preview = require('../../utils/preview.js')
const labels = require('../../utils/labels.js')

const MEAL_META = {
  breakfast: { name: '早餐', time: '07:30' },
  lunch: { name: '午餐', time: '12:00' },
  dinner: { name: '晚餐', time: '18:00' },
}

function toneOf(state) {
  if (state === 'checked_in') return 'done'
  if (state === 'due') return 'now'
  if (state === 'missed') return 'miss'
  if (state === 'exempt') return 'staple'
  return 'wait'
}

Page({
  data: {
    padTop: 88,
    hungerText: '—',
    healthText: '—',
    levelText: '—',
    badge: false,
    chips: [],
    petView: 'pasture',
    band: 'full',
    petName: '',
    emotion: '',
    companyDays: 0,
    mealsEaten: 0,
    cooldownDays: 0,
    levelCard: '—',
    bowlFull: false,
    recentPhoto: '',
    showBag: false,
    showMemorial: false,
    hasCurrent: false,
    camera: { type: 'toast' },
    pickMeals: [],
    sheet: '',
    bandNote: '',
  },

  onLoad(query) {
    this.previewState = query.state || ''
    let padTop = 88
    try {
      const menu = wx.getMenuButtonBoundingClientRect()
      if (menu && menu.bottom) padTop = menu.bottom + 12
    } catch (err) {
      padTop = 88
    }
    this.setData({ padTop: padTop })
  },

  onShow() {
    this.load()
    this.markTab()
  },

  markTab() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0, badge: !!this.data.badge })
    }
  },

  load() {
    const self = this
    if (config.usePreviewData) {
      this.apply(preview.homeView(this.previewState))
      return
    }
    api.call('sync', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).then(function () {
      return api.call('home', {})
    }).then(function (res) {
      if (res.ok) self.apply(res.data)
      else wx.showToast({ title: '加载失败，请稍后再试', icon: 'none' })
    })
  },

  apply(view) {
    const chips = (view.chips || []).map(function (chip) {
      const meta = MEAL_META[chip.meal] || { name: '', time: '' }
      const tone = toneOf(chip.state)
      return {
        meal: chip.meal,
        name: chip.name || meta.name,
        time: chip.time || meta.time,
        state: chip.state,
        tone: tone,
      }
    })
    const showMemorial = view.petView === 'memorial'
    this.setData({
      date: view.date,
      hungerText: view.hungerText || '—',
      healthText: view.healthText || '—',
      levelText: view.levelText || '—',
      levelCard: view.levelText || '—',
      chips: chips,
      badge: !!view.badge,
      petView: view.petView,
      petName: view.petName || '小饭',
      emotion: view.emotion || '',
      band: view.band,
      companyDays: view.companyDays,
      mealsEaten: view.mealsEaten,
      cooldownDays: view.cooldownDays,
      bowlFull: !!view.bowlFull,
      recentPhoto: view.recentPhoto || '',
      showBag: chips.some(function (chip) { return chip.tone === 'staple' }),
      showMemorial: showMemorial,
      hasCurrent: chips.some(function (chip) { return chip.tone === 'now' }),
      camera: view.camera,
      bandNote: labels.bandNote(view.band, view.petName),
    })
    this.markTab()
  },

  onChip(event) {
    const meal = event.currentTarget.dataset.meal
    const chip = this.data.chips.filter(function (item) { return item.meal === meal })[0]
    if (!chip) return
    if (chip.tone === 'now' || chip.tone === 'done' || chip.tone === 'staple') this.goCheckin(meal)
  },

  onCamera() {
    const action = this.data.camera
    if (action.type === 'checkin') this.goCheckin(action.meal)
    else if (action.type === 'pick') this.setData({ sheet: 'pick', pickMeals: action.meals })
    else if (action.type === 'snack') this.goSnack()
    else wx.showToast({ title: '这一餐已经打过啦', icon: 'none' })
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
    if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
  },

  openPet() {
    if (this.data.petView !== 'living') return
    this.setData({ sheet: 'pet' })
  },

  openMemorial() {
    const state = this.previewState ? '?state=' + this.previewState : ''
    wx.navigateTo({ url: '/pages/memorial/list' + state })
  },

  closeSheet() {
    this.setData({ sheet: '' })
  },
})
