// 提醒链存在本机：开启后记住下一餐，那一餐窗口打开时首页弹一次，打卡后再问要不要订再下一餐。
const rules = require('../generated/domain/meal.js')

const KEY = 'remindPlan'
const SWITCH = 'remindOn'
const ORDER = ['breakfast', 'lunch', 'dinner']

function read() {
  const plan = wx.getStorageSync(KEY)
  if (!plan || typeof plan.date !== 'string' || ORDER.indexOf(plan.meal) < 0) return null
  return { date: plan.date, meal: plan.meal, shown: !!plan.shown }
}

function arm(date, meal) {
  wx.setStorageSync(KEY, { date: date, meal: meal, shown: false })
}

function clear() {
  wx.removeStorageSync(KEY)
}

function enabled() {
  // 这一版不提醒。页面、模板和下面的实现留着，接回时删掉这一行。
  return false
  return wx.getStorageSync(SWITCH) === true
}

function setEnabled(on) {
  wx.setStorageSync(SWITCH, !!on)
  if (!on) clear()
}

function markShown() {
  const plan = read()
  if (!plan) return
  plan.shown = true
  wx.setStorageSync(KEY, plan)
}

function statesOf(chips) {
  return ORDER.map(function (meal) {
    const chip = (chips || []).filter(function (item) { return item.meal === meal })[0]
    return chip ? chip.state : 'missed'
  })
}

function armFromChips(date, chips) {
  const next = rules.firstRemindMeal(date, statesOf(chips))
  arm(next.date, next.meal)
}

function armAfter(date, meal) {
  const next = rules.mealAfter(date, meal)
  arm(next.date, next.meal)
}

function popup(date, chips) {
  if (!enabled()) return null
  const plan = read()
  if (!plan || plan.shown || typeof date !== 'string') return null
  if (plan.date < date) {
    clear()
    return null
  }
  if (plan.date !== date) return null
  const chip = (chips || []).filter(function (item) { return item.meal === plan.meal })[0]
  if (!chip) return null
  if (chip.state === 'missed' || chip.state === 'checked_in' || chip.state === 'exempt') {
    clear()
    return null
  }
  if (chip.state !== 'due') return null
  return { meal: chip.meal, name: chip.name || '' }
}

module.exports = {
  armFromChips: armFromChips,
  armAfter: armAfter,
  clear: clear,
  enabled: enabled,
  setEnabled: setEnabled,
  markShown: markShown,
  popup: popup,
}
