// 图鉴。按日期看自己的三餐照片和连续天数。固定仅自己可见，不显示"谁能看"。
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
    isEmpty: false,
    viewer: '',
  },

  onLoad(query) {
    this.previewState = query.state || ''
  },

  onShow() {
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
    const hasAny = view.meals.some(function (m) { return m.photo || m.exempt })
    this.setData({
      streak: view.streak,
      days: view.days,
      todayIndex: view.todayIndex,
      selected: this.data.days.length ? this.data.selected : view.todayIndex,
      meals: view.meals,
      isEmpty: !hasAny,
    })
  },

  selectDay(event) {
    const index = event.currentTarget.dataset.index
    this.selectedDate = this.data.days[index].key
    this.setData({ selected: index })
    if (config.usePreviewData) {
      // 设计阶段：非今天的日期显示空态，方便看空态的样子。
      const view = preview.galleryView(index === this.data.todayIndex ? this.previewState : 'empty')
      this.setData({ meals: view.meals, isEmpty: !view.meals.some(function (m) { return m.photo || m.exempt }) })
      return
    }
    this.onShow()
  },

  openTile(event) {
    const meal = this.data.meals[event.currentTarget.dataset.index]
    if (meal && meal.photo) this.setData({ viewer: meal.photo })
  },

  closeViewer() {
    this.setData({ viewer: '' })
  },
})
