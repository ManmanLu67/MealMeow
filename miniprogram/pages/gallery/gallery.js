// 图鉴。按日期看自己的三餐照片、零食和连续天数。固定仅自己可见，不显示"谁能看"。
const api = require('../../utils/api.js')
const config = require('../../utils/config.js')
const preview = require('../../utils/preview.js')
const report = require('../../utils/report.js')

const PHOTO_HINT =
  '图鉴只显示本月和上月的照片。更早的打卡还在，只是没有照片。'
const HINT_KEY = 'galleryPhotoHint'

function recordedMeals(meals) {
  return (meals || []).filter(function (item) {
    return item.photo || item.exempt || item.face === 'kept'
  })
}

function formatLocalTime(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return y + '年' + m + '月' + d + '日 ' + h + ':' + min
}

function noteTimes(note) {
  if (!note || !note.createdAt) {
    return { one: '', wrote: '', edited: '' }
  }
  if (note.createdAt === note.updatedAt) {
    return { one: formatLocalTime(note.createdAt), wrote: '', edited: '' }
  }
  return {
    one: '',
    wrote: formatLocalTime(note.createdAt),
    edited: formatLocalTime(note.updatedAt),
  }
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
    viewerOpen: false,
    viewerPhoto: '',
    viewerText: '',
    viewerTimeOne: '',
    viewerTimeWrote: '',
    viewerTimeEdited: '',
    calendarOpen: false,
    showPrev: false,
    showNext: false,
    monthLabel: '',
    weekHeads: ['一', '二', '三', '四', '五', '六', '日'],
    calendarCells: [],
  },

  onLoad(query) {
    this.previewState = query.state || ''
    this.viewerTarget = null
    this.viewerSaving = false
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    this.load()
    this.maybePhotoHint()
  },

  maybePhotoHint() {
    try {
      if (wx.getStorageSync(HINT_KEY) === '1') return
    } catch (err) {
      return
    }
    this.showPhotoHint(true)
  },

  showPhotoHint(fromFirstVisit) {
    const self = this
    wx.showModal({
      title: '图鉴',
      content: PHOTO_HINT,
      showCancel: false,
      confirmText: '确定',
      success(res) {
        if (!res.confirm) return
        if (fromFirstVisit) {
          try {
            wx.setStorageSync(HINT_KEY, '1')
          } catch (err) {
            /* ignore */
          }
        }
      },
    })
  },

  onPhotoHintTap() {
    this.showPhotoHint(false)
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

  openViewer(target, photo, note) {
    const times = noteTimes(note)
    this.viewerTarget = target
    this.setData({
      viewerOpen: true,
      viewerPhoto: photo,
      viewerText: (note && note.text) || '',
      viewerTimeOne: times.one,
      viewerTimeWrote: times.wrote,
      viewerTimeEdited: times.edited,
    })
  },

  openTile(event) {
    const index = event.currentTarget.dataset.index
    const meal = this.data.meals[index]
    if (!meal || !meal.photo || meal.exempt) return
    this.openViewer({ kind: 'meal', index: index, meal: meal.meal }, meal.photo, meal.note)
  },

  openSnack(event) {
    const index = event.currentTarget.dataset.index
    const snack = this.data.snacks[index]
    if (!snack || !snack.photo) return
    this.openViewer({ kind: 'snack', index: index, startedAt: snack.startedAt }, snack.photo, snack.note)
  },

  onViewerInput(event) {
    this.setData({ viewerText: event.detail.value })
  },

  stopTap() {},

  finishViewer() {
    this.saveNoteAndClose()
  },

  closeViewer() {
    this.saveNoteAndClose()
  },

  saveNoteAndClose() {
    const self = this
    if (!this.data.viewerOpen || this.viewerSaving) return
    const text = this.data.viewerText
    const target = this.viewerTarget
    this.viewerSaving = true
    const done = function () {
      self.viewerSaving = false
      self.viewerTarget = null
      self.setData({
        viewerOpen: false,
        viewerPhoto: '',
        viewerText: '',
        viewerTimeOne: '',
        viewerTimeWrote: '',
        viewerTimeEdited: '',
      })
    }
    if (!target || config.usePreviewData) {
      done()
      return
    }
    const date = this.selectedDate
    const payload =
      target.kind === 'meal'
        ? { kind: 'meal', date: date, meal: target.meal, text: text }
        : { kind: 'snack', date: date, startedAt: target.startedAt, text: text }
    api.call('annotate', payload).then(function (res) {
      self.viewerSaving = false
      if (!res.ok) {
        wx.showToast({ title: res.error || '保存失败', icon: 'none' })
        return
      }
      done()
      self.load()
    })
  },

  saveViewerPhoto() {
    const path = this.data.viewerPhoto
    if (!path) return
    saveToAlbum(path)
  },
})

function saveToAlbum(filePath) {
  const write = function () {
    wx.saveImageToPhotosAlbum({
      filePath: filePath,
      success() { wx.showToast({ title: '已存入相册', icon: 'none' }) },
      fail(err) { showAlbumError(err) },
    })
  }
  if (!wx.getSetting) {
    write()
    return
  }
  wx.getSetting({
    success(res) {
      const allowed = res.authSetting && res.authSetting['scope.writePhotosAlbum']
      if (allowed === false) {
        askAlbumSetting()
        return
      }
      write()
    },
    fail: write,
  })
}

function askAlbumSetting() {
  wx.showModal({
    title: '无法存入相册',
    content: '请允许保存到系统相册，拍下的照片才会留在相机相册里。',
    confirmText: '去设置',
    success(res) { if (res.confirm && wx.openSetting) wx.openSetting({}) },
  })
}

function showAlbumError(err) {
  const msg = (err && err.errMsg) || ''
  if (!msg || msg.indexOf('cancel') >= 0) return
  report.report('gallery.album', err)
  if (msg.indexOf('auth') >= 0 || msg.indexOf('deny') >= 0 || msg.indexOf('authorize') >= 0) {
    askAlbumSetting()
    return
  }
  if (err && (err.errno === 112 || msg.indexOf('not declared') >= 0)) {
    wx.showModal({
      title: '无法存入相册',
      content: '指引里要有「相册（仅写入）」。补上后大约 5 分钟生效。',
      showCancel: false,
    })
    return
  }
  wx.showToast({ title: '没能存入相册', icon: 'none' })
}

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