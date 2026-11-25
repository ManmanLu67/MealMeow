// 饭点设置。界面只做提示和选择，真正的校验在云端（domain 的 validateMealClocks）。
// 这里的 problem() 只是为了在点保存前少走一趟网络，规则和领域层一致，改规则时两处一起改。
const api = require('../../../utils/api.js')
const config = require('../../../utils/config.js')
const nickname = require('../../../utils/nickname.js')

const NAMES = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }
const ORDER = ['breakfast', 'lunch', 'dinner']
const DAY_START = 4 * 60
const MIN_GAP = 120

function minutes(hhmm) {
  const p = hhmm.split(':')
  return Number(p[0]) * 60 + Number(p[1])
}

function problem(clocks) {
  const offsets = ORDER.map(function (m) { return (minutes(clocks[m]) - DAY_START + 1440) % 1440 }).sort(function (a, b) { return a - b })
  for (let i = 0; i < offsets.length; i += 1) {
    const next = i === offsets.length - 1 ? offsets[0] + 1440 : offsets[i + 1]
    if (next - offsets[i] < MIN_GAP) return '打卡时间不能重合'
  }
  for (let i = 0; i < ORDER.length; i += 1) {
    const t = minutes(clocks[ORDER[i]])
    if (t > DAY_START - 60 && t < DAY_START + 60) return '饭点不能落在 03:01 到 04:59'
  }
  return ''
}

Page({
  data: { rows: [], dirty: false, error: '', nicknameOpen: false, nicknameDraft: '' },

  onLoad() {
    this.clocks = { breakfast: '07:30', lunch: '12:00', dinner: '18:00' }
    this.saved = Object.assign({}, this.clocks)
    this.render()
  },

  render() {
    const clocks = this.clocks
    const rows = ORDER.map(function (m) { return { meal: m, name: NAMES[m], value: clocks[m] } })
    const dirty = ORDER.some(function (m) { return clocks[m] !== this.saved[m] }, this)
    this.setData({ rows: rows, dirty: dirty, error: dirty ? problem(clocks) : '' })
  },

  onPick(event) {
    this.clocks[event.currentTarget.dataset.meal] = event.detail.value
    this.render()
  },

  save() {
    if (!this.data.dirty) return
    if (problem(this.clocks)) return
    const self = this
    nickname.gate(this, function () { self.persist() })
  },

  persist() {
    const self = this
    if (config.usePreviewData) {
      this.saved = Object.assign({}, this.clocks)
      this.render()
      wx.showToast({ title: '已设置，次日 04:00 生效', icon: 'none' })
      return
    }
    api.call('saveMeals', { clocks: this.clocks }).then(function (res) {
      if (!res.ok) {
        self.setData({ error: res.error || '保存失败，请重试' })
        return
      }
      self.saved = Object.assign({}, self.clocks)
      self.render()
      wx.showToast({ title: '已设置，次日 04:00 生效', icon: 'none' })
    })
  },

  onNicknameConfirm(event) {
    nickname.save(this, event.detail.nickname)
  },

  onNicknameCancel() {
    nickname.cancel(this)
  },
})
