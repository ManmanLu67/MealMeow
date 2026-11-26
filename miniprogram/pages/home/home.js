// 页面只渲染视图模型。云函数接上之前读 preview.js。
const api = require('../../utils/api.js')
const config = require('../../utils/config.js')
const preview = require('../../utils/preview.js')
const labels = require('../../utils/labels.js')
const pets = require('../../utils/pets.js')
const feedback = require('../../utils/feedback.js')
const timeZoneOf = require('../../utils/time-zone.js')
const remind = require('../../utils/remind.js')
const guide = require('../../utils/guide.js')
const nickname = require('../../utils/nickname.js')
const rules = require('../../generated/domain/meal.js')

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

function satietyBarWidth(text) {
  const raw = String(text || '').replace('%', '').trim()
  if (raw === '—' || raw === '') return 0
  const n = Number(raw)
  if (!Number.isFinite(n)) return 0
  return Math.min(100, Math.max(0, n))
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
    satietyText: '0%',
    satietyBarWidth: 0,
    healthText: '100',
    levelText: '',
    badge: false,
    chips: [],
    petView: 'pasture',
    band: 'full',
    petName: '',
    emotion: '',
    companyDays: 0,
    mealsEaten: 0,
    cooldownDays: 0,
    levelCard: '',
    bowlFill: 0,
    bowlOpacity: 0,
    species: 'cat',
    petSrc: '',
    cameraSrc: '',
    photos: [],
    stageScale: 1,
    stapleLeft: 0,
    stapleDialog: '',
    stapleMessage: '',
    showMemorial: false,
    hasCurrent: false,
    camera: { type: 'snack' },
    pickMeals: [],
    showSnack: false,
    sheet: '',
    statChanges: [],
    bandNote: '',
    remindMeal: '',
    guideId: '',
    guide: null,
    hole: null,
    bubble: null,
    nicknameOpen: false,
    nicknameDraft: '',
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
    api.call('sync', { timeZone: timeZoneOf.deviceTimeZone() }).then(function (synced) {
      if (!synced.ok) {
        wx.showToast({ title: synced.error || '加载失败，请稍后再试', icon: 'none' })
        return null
      }
      const created = !!(synced.data && synced.data.created)
      guide.beginIfNew(created)
      self.refreshGuide()
      return api.call('home', {})
    }).then(function (res) {
      if (!res) return
      if (res.ok) self.apply(res.data)
      else wx.showToast({ title: '加载失败，请稍后再试', icon: 'none' })
    })
  },

  refreshGuide() {
    const step = guide.current()
    if (step === 'backup') {
      if (this._openingBackup) return
      this._openingBackup = true
      const page = this
      this.setData({ guideId: '', guide: null })
      wx.navigateTo({
        url: '/pages/settings/about/about',
        complete() { page._openingBackup = false },
      })
      return
    }
    if (step === 'meals' || step === 'camera' || step === 'adopt') {
      const page = this
      this.setData({ guideId: step, guide: guide.view(step) }, function () { page.placeGuide() })
      return
    }
    this.setData({ guideId: '', guide: null, hole: null, bubble: null })
  },

  placeGuide(attempt) {
    const step = guide.view(this.data.guideId)
    if (!step) return
    const page = this
    this.createSelectorQuery().select(step.selector).boundingClientRect(function (rect) {
      if (!rect || !rect.width) {
        if ((attempt || 0) < 6) setTimeout(function () { page.placeGuide((attempt || 0) + 1) }, 40)
        return
      }
      let winW = 375
      let winH = 667
      try {
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
        if (info && info.windowWidth) winW = info.windowWidth
        if (info && info.windowHeight) winH = info.windowHeight
      } catch (err) {
        winW = 375
      }
      const spot = guide.spotlight(rect, winW, winH)
      page.setData({ hole: spot.hole, bubble: spot.bubble })
    }).exec()
  },

  nextGuide() {
    const next = guide.advance(this.data.guideId)
    if (next === 'backup') {
      this._openingBackup = true
      const page = this
      this.setData({ guideId: '', guide: null, hole: null, bubble: null })
      wx.navigateTo({
        url: '/pages/settings/about/about',
        complete() { page._openingBackup = false },
      })
      return
    }
    const page = this
    this.setData({ guideId: next, guide: guide.view(next), hole: null, bubble: null }, function () {
      page.placeGuide()
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
      if (next !== self.data.stageScale) self.setData({ stageScale: next }, function () { if (self.data.guideId) self.placeGuide() })
      else if (self.data.guideId) self.placeGuide()
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
        inWindow: !!chip.inWindow,
      }
    })
    const showMemorial = view.petView === 'memorial'
    const species = speciesOverride || view.species || 'cat'
    const bowlFill = Math.max(0, Math.min(100, Number(view.bowlFill) || 0))
    const due = remind.popup(view.date, chips)
    const self = this
    this.setData({
      date: view.date,
      satietyText: view.satietyText || '—',
      satietyBarWidth: satietyBarWidth(view.satietyText || '—'),
      healthText: view.healthText || '—',
      levelText: view.levelText || '',
      levelCard: view.levelText || '',
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
      statChanges: view.statChanges || [],
      stapleLeft: typeof view.stapleLeft === 'number' ? view.stapleLeft : 0,
      showMemorial: showMemorial,
      hasCurrent: chips.some(function (chip) { return chip.tone === 'now' }),
      camera: view.camera,
      bandNote: labels.bandNote(view.band, view.petName),
      remindMeal: due ? due.meal : '',
    }, function () { self.fitStage() })
    this.markTab()
  },

  onChip() {
    wx.navigateTo({ url: '/pages/settings/meals/meals' })
  },

  onCamera() {
    const self = this
    nickname.gate(this, function () { self.openCamera() })
  },

  openCamera() {
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

  askStaple() {
    if (this.data.petView !== 'living') return
    this.setData({ stapleDialog: 'ask', stapleMessage: '' })
  },

  closeStaple() {
    this.setData({ stapleDialog: '', stapleMessage: '' })
  },

  confirmStaple() {
    const result = rules.stapleTap(this.data.chips, this.data.stapleLeft)
    if (!result || result.action === 'block') {
      this.setData({
        stapleDialog: 'result',
        stapleMessage: (result && result.message) || '当前未在打卡时间',
      })
      return
    }
    if (config.usePreviewData) {
      this.setData({ stapleDialog: '', stapleMessage: '' })
      return
    }
    const self = this
    api.call('exempt', { meal: result.meal }).then(function (res) {
      if (res && res.ok) {
        self.setData({ stapleDialog: '', stapleMessage: '' })
        self.load()
        return
      }
      self.setData({
        stapleDialog: 'result',
        stapleMessage: (res && res.error) || '口粮使用失败，请重试',
      })
    })
  },

  dismissRemind() {
    remind.markShown()
    this.setData({ remindMeal: '' })
  },

  goRemindCheckin() {
    remind.markShown()
    this.setData({ remindMeal: '' })
    this.onCamera()
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
    const self = this
    nickname.gate(this, function () { self.openAdopt() })
  },

  openAdopt() {
    wx.navigateTo({ url: '/pages/adopt/adopt' + (this.previewState ? '?state=' + this.previewState : '') })
  },

  onNicknameConfirm(event) {
    nickname.save(this, event.detail.nickname)
  },

  onNicknameCancel() {
    nickname.cancel(this)
  },

  onPetTouchStart(event) {
    const touch = event.touches && event.touches[0]
    this.petTouchY = touch ? touch.clientY : 0
    this.petSwiped = false
  },

  onPetTouchEnd(event) {
    const touch = event.changedTouches && event.changedTouches[0]
    const y = touch ? touch.clientY : this.petTouchY
    if (typeof this.petTouchY === 'number' && this.petTouchY - y > 30) this.petSwiped = true
  },

  onPetTap() {
    if (this.petSwiped) {
      this.petSwiped = false
      feedback.play('pet')
    } else {
      feedback.play('tap')
    }
    feedback.vibrate()
  },

  openPet() {
    if (this.data.petView !== 'living') return
    this.setData({ sheet: 'pet' })
  },

  openMemorial() {
    const state = this.previewState ? '?state=' + this.previewState : ''
    wx.navigateTo({ url: '/pages/memorial/list' + state })
  },

  openStat() {
    this.setData({ sheet: 'stat' })
  },

  closeSheet() {
    this.setData({ sheet: '' })
  },
})
