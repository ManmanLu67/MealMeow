// 图鉴。按日期看自己的三餐照片、零食和连续天数。固定仅自己可见，不显示"谁能看"。
const api = require('../../utils/api.js')
const config = require('../../utils/config.js')
const preview = require('../../utils/preview.js')

function recordedMeals(meals) {
  return (meals || []).filter(function (item) {
    return item.photo || item.exempt || item.face === 'kept'
  })
}

Page({
  data: {
    streak: 0,
    days: [],
    todayIndex: 0,
    selected: 0,
    selectedKey: '',
    meals: [],
    snacks: [],
    isEmpty: false,
    viewer: '',
    calendarOpen: false,
    showPrev: false,
    showNext: false,
    monthLabel: '',
    weekHeads: ['一', '二', '三', '四', '五', '六', '日'],
    calendarCells: [],
  },

  onLoad(query) {
    this.previewState = query.state || ''
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    this.load()
  },

  load(open) {
    const self = this
    if (config.usePreviewData) {
      const view = preview.galleryView(this.previewState)
      if (open || this.data.calendarOpen) view.calendar = localCalendar(this.calendarMonth, this.todayKey)
      this.apply(view)
      return
    }
    const payload = { date: this.selectedDate }
    if ((open || this.data.calendarOpen) && this.calendarMonth) payload.month = this.calendarMonth
    api.call('gallery', payload).then(function (res) {
      if (res.ok) self.apply(res.data)
      else wx.showToast({ title: '加载失败，请稍后再试', icon: 'none' })
    })
  },

  apply(view) {
    const meals = recordedMeals(view.meals)
    const snacks = view.snacks || []
    const today = view.days[view.todayIndex]
    if (today) this.todayKey = today.key
    if (!this.selectedDate && this.todayKey) this.selectedDate = this.todayKey
    const selected = view.days.findIndex(function (day) { return day.key === this.selectedDate }.bind(this))
    const calendar = view.calendar
    const current = (this.todayKey || '').slice(0, 7)
    const shown = calendar ? calendar.key : current
    this.earliestMonth = view.earliestMonth || ''
    const arrows = monthArrows(shown, this.earliestMonth, current)
    this.setData({
      streak: view.streak,
      days: view.days,
      todayIndex: view.todayIndex,
      selected: selected,
      selectedKey: this.selectedDate || '',
      meals: meals,
      snacks: snacks,
      isEmpty: meals.length === 0 && snacks.length === 0,
      monthLabel: calendar ? calendar.label : monthText(this.todayKey),
      calendarCells: cellsOf(calendar),
      showPrev: arrows.prev,
      showNext: arrows.next,
    })
  },

  toggleCalendar() {
    if (this.data.calendarOpen) {
      this.closeCalendar()
      return
    }
    const current = (this.todayKey || '').slice(0, 7)
    if (!current) return
    this.calendarMonth = current
    this.setData({ calendarOpen: true })
    this.load(true)
  },

  onPrevMonth() {
    const current = (this.todayKey || '').slice(0, 7)
    const shown = this.data.calendarOpen ? (this.calendarMonth || current) : current
    if (!current || !this.earliestMonth || shown <= this.earliestMonth) return
    this.calendarMonth = shiftMonth(shown, -1)
    this.showMonth(current)
  },

  onNextMonth() {
    const current = (this.todayKey || '').slice(0, 7)
    const shown = this.calendarMonth || current
    if (!current || !this.earliestMonth || shown >= current || shown < this.earliestMonth) return
    this.calendarMonth = shiftMonth(shown, 1)
    this.showMonth(current)
  },

  showMonth(current) {
    const arrows = monthArrows(this.calendarMonth, this.earliestMonth, current)
    this.setData({
      calendarOpen: true,
      monthLabel: monthText(this.calendarMonth),
      showPrev: arrows.prev,
      showNext: arrows.next,
    })
    this.load(true)
  },

  closeCalendar() {
    if (!this.data.calendarOpen) return
    const current = (this.todayKey || '').slice(0, 7)
    this.calendarMonth = current
    const arrows = monthArrows(current, this.earliestMonth, current)
    this.setData({
      calendarOpen: false,
      calendarCells: [],
      monthLabel: monthText(this.todayKey),
      showPrev: arrows.prev,
      showNext: arrows.next,
    })
  },

  pickCalendarDay(event) {
    const key = event.currentTarget.dataset.key
    if (!key || String(key).indexOf('blank-') === 0) return
    this.selectedDate = key
    this.setData({ selectedKey: key })
    this.load()
  },

  selectDay(event) {
    const index = event.currentTarget.dataset.index
    this.selectedDate = this.data.days[index].key
    this.setData({ selected: index, selectedKey: this.selectedDate })
    if (config.usePreviewData) {
      const day = preview.galleryDay(this.selectedDate, this.previewState)
      const meals = recordedMeals(day.meals)
      const snacks = day.snacks || []
      this.setData({
        meals: meals,
        snacks: snacks,
        isEmpty: meals.length === 0 && snacks.length === 0,
      })
      return
    }
    this.load()
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

function monthText(key) {
  if (!key) return ''
  const parts = key.split('-')
  return parts[0] + '年' + Number(parts[1]) + '月'
}

function monthArrows(shown, earliest, current) {
  if (!shown || !earliest || !current) return { prev: false, next: false }
  return {
    prev: shown > earliest,
    next: shown < current && shown >= earliest,
  }
}

function shiftMonth(month, delta) {
  const parts = month.split('-')
  const date = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1 + delta, 1))
  const year = date.getUTCFullYear()
  const next = String(date.getUTCMonth() + 1).padStart(2, '0')
  return year + '-' + next
}

function cellsOf(calendar) {
  if (!calendar) return []
  const blanks = []
  for (let i = 0; i < calendar.leading; i += 1) blanks.push({ blank: true, key: 'blank-' + i })
  return blanks.concat(calendar.days)
}

function localCalendar(month, todayKey) {
  const parts = month.split('-')
  const year = Number(parts[0])
  const monthNumber = Number(parts[1])
  const weekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay()
  const leading = (weekday + 6) % 7
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const days = []
  for (let day = 1; day <= last; day += 1) {
    const key = month + '-' + String(day).padStart(2, '0')
    days.push({ key: key, day: day, marked: false, star: false, today: key === todayKey })
  }
  return { label: year + '年' + monthNumber + '月', leading: leading, days: days }
}
