// 页面只渲染视图模型。云函数接上之前读 preview.js。
const api = require('../../utils/api.js')
const config = require('../../utils/config.js')
const preview = require('../../utils/preview.js')
const labels = require('../../utils/labels.js')
const pets = require('../../utils/pets.js')

const MEAL_META = {
  breakfast: { name: '早餐', time: '07:30' },
  lunch: { name: '午餐', time: '12:00' },
  dinner: { name: '晚餐', time: '18:00' },
}

const PHOTO_ORDER = ['breakfast', 'lunch', 'dinner']

function photosOf(list) {
  return PHOTO_ORDER.map(function (meal) {
    const found = (list || []).filter(function (item) { return item.meal === meal && item.src })[0]
    return found ? { meal: meal, src: found.src } : null
  }).filter(Boolean)
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
    bowlFill: 0,
    bowlOpacity: 0,
    species: 'cat',
    petSrc: '',
    cameraSrc: '',
    photos: [],
    stageScale: 1,
    showBag: false,
    showMemorial: false,
    hasCurrent: false,
    camera: { type: 'snack' },
    pickMeals: [],
    showSnack: false,
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

  onReady() {
    this.fitStage()
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
      const chosen = this.chosenSpecies()
      let view = preview.homeView(this.previewState)
      if (chosen && view.petView === 'pasture') view = preview.homeView('living')
      this.apply(view, chosen)
      return
    }
    api.call('home', {}).then(function (res) {
      if (!res.ok && res.error === 'no_user') return null
      if (!res.ok) {
        wx.showToast({ title: '加载失败，请稍后再试', icon: 'none' })
        return null
      }
      return api.call('sync', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).then(function () {
        return api.call('home', {})
      })
    }).then(function (res) {
      if (!res) return
      if (res.ok) self.apply(res.data)
      else if (res.error !== 'no_user') wx.showToast({ title: '加载失败，请稍后再试', icon: 'none' })
    })
  },

  chosenSpecies() {
    try {
      const saved = wx.getStorageSync('previewSpecies')
      if (pets.isSpecies(saved)) return saved
    } catch (err) {
      return ''
    }
    return ''
  },

  fitStage(attempt) {
    const self = this
    this.createSelectorQuery().select('.center').boundingClientRect(function (rect) {
      if (!rect || !rect.height) {
        if ((attempt || 0) < 2) setTimeout(function () { self.fitStage((attempt || 0) + 1) }, 50)
        return
      }
      let width = 375
      try {
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        if (info && info.windowWidth) width = info.windowWidth
      } catch (err) {
        width = 375
      }
      const design = 996 * (width / 750)
      const scale = Math.min(1, rect.height / design)
      const next = Math.round(scale * 1000) / 1000
      if (next !== self.data.stageScale) self.setData({ stageScale: next })
    }).exec()
  },

  apply(view, speciesOverride) {
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
    const species = speciesOverride || view.species || 'cat'
    const bowlFill = Math.max(0, Math.min(100, Number(view.bowlFill) || 0))
    const self = this
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
      bowlFill: bowlFill,
      bowlOpacity: bowlFill / 100,
      species: species,
      petSrc: pets.art(species, view.band),
      cameraSrc: view.petView === 'living' ? pets.camera(species) : '/assets/pet/camera-plain.png',
      photos: photosOf(view.photos),
      showBag: chips.some(function (chip) { return chip.tone === 'staple' }),
      showMemorial: showMemorial,
      hasCurrent: chips.some(function (chip) { return chip.tone === 'now' }),
      camera: view.camera,
      bandNote: labels.bandNote(view.band, view.petName),
    }, function () { self.fitStage() })
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
    if (action.type === 'pick') this.setData({ sheet: 'pick', pickMeals: action.meals, showSnack: action.snack })
    else this.goSnack()
  },

  onPickSnack() {
    this.setData({ sheet: '' })
    this.goSnack()
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
