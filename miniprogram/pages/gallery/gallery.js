// 图鉴。按日期看自己的三餐照片、零食和连续天数。固定仅自己可见，不显示"谁能看"。
const api = require('../../utils/api.js')
const config = require('../../utils/config.js')
const preview = require('../../utils/preview.js')

Page({
  data: {
    streak: 0,
    days: [],
    todayIndex: 0,
    selected: 0,
    meals: [],
    snacks: [],
    isEmpty: false,
    viewer: '',
  },

  onLoad(query) {
    this.previewState = query.state || ''
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    const self = this
    if (config.usePreviewData) {
      this.apply(preview.galleryView(this.previewState))
      return
    }
    api.call('gallery', { date: this.selectedDate }).then(function (res) {
      if (res.ok) self.apply(res.data)
      else wx.showToast({ title: '加载失败，请稍后再试', icon: 'none' })
    })
  },

  apply(view) {
    const hasMeals = view.meals.some(function (m) { return m.photo || m.exempt })
    const hasSnacks = (view.snacks || []).length > 0
    this.setData({
      streak: view.streak,
      days: view.days,
      todayIndex: view.todayIndex,
      selected: this.data.days.length ? this.data.selected : view.todayIndex,
      meals: view.meals,
      snacks: view.snacks || [],
      isEmpty: !hasMeals && !hasSnacks,
    })
  },

  selectDay(event) {
    const index = event.currentTarget.dataset.index
    this.selectedDate = this.data.days[index].key
    this.setData({ selected: index })
    if (config.usePreviewData) {
      // 设计阶段：非今天的日期显示空态，方便看空态的样子。
      const view = preview.galleryView(index === this.data.todayIndex ? this.previewState : 'empty')
      const hasMeals = view.meals.some(function (m) { return m.photo || m.exempt })
      this.setData({
        meals: view.meals,
        snacks: view.snacks || [],
        isEmpty: !hasMeals && (view.snacks || []).length === 0,
      })
      return
    }
    this.onShow()
  },

  openTile(event) {
    const meal = this.data.meals[event.currentTarget.dataset.index]
    if (meal && meal.photo) this.setData({ viewer: meal.photo })
  },

  openSnack(event) {
    const snack = this.data.snacks[event.currentTarget.dataset.index]
    if (snack && snack.photo) this.setData({ viewer: snack.photo })
  },

  closeViewer() {
    this.setData({ viewer: '' })
  },
})
