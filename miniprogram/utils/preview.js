// 设计阶段的样例视图模型。形状和计划 views.md 里 homeView / galleryView / adoptView 的返回值一致，
// 页面只认这个形状，所以接上真实云函数时页面不用改。
// 用法：在微信开发者工具的"编译模式"里给首页加启动参数 state=living / peckish / hungry / critical / memorial / pasture / cooling / two-due。
const MEALS = [
  { meal: 'breakfast', name: '早餐', short: '早' },
  { meal: 'lunch', name: '午餐', short: '中' },
  { meal: 'dinner', name: '晚餐', short: '晚' },
]

const BAND_TEXT = { full: '吃饱', peckish: '有点饿', hungry: '很饿', critical: '濒危' }

function chipLabel(short, state) {
  if (state === 'upcoming') return short
  if (state === 'due') return short + ' · 待打卡'
  if (state === 'checked_in') return short + ' · 已打'
  if (state === 'exempt') return short + ' · 口粮'
  return short + ' · 漏'
}

function chips(states) {
  return MEALS.map(function (m, i) {
    return { meal: m.meal, state: states[i], label: chipLabel(m.short, states[i]) }
  })
}

function cameraFor(states) {
  const due = MEALS.filter(function (m, i) { return states[i] === 'due' })
    .map(function (m) { return { meal: m.meal, name: m.name } })
  if (due.length === 0) return { type: 'toast', meals: [] }
  if (due.length === 1) return { type: 'checkin', meals: due }
  return { type: 'pick', meals: due }
}

const SCENES = {
  living: { pet: 'living', band: 'full', states: ['checked_in', 'due', 'upcoming'] },
  peckish: { pet: 'living', band: 'peckish', states: ['checked_in', 'missed', 'due'] },
  hungry: { pet: 'living', band: 'hungry', states: ['missed', 'due', 'upcoming'] },
  critical: { pet: 'living', band: 'critical', states: ['missed', 'missed', 'due'] },
  memorial: { pet: 'memorial', band: 'full', states: ['exempt', 'due', 'upcoming'] },
  cooling: { pet: 'memorial', band: 'full', states: ['upcoming', 'upcoming', 'upcoming'] },
  pasture: { pet: 'pasture', band: 'full', states: ['checked_in', 'upcoming', 'upcoming'] },
  'two-due': { pet: 'living', band: 'peckish', states: ['due', 'due', 'upcoming'] },
  idle: { pet: 'living', band: 'full', states: ['checked_in', 'checked_in', 'checked_in'] },
}

function homeView(name) {
  const scene = SCENES[name] || SCENES.living
  const memorial = scene.pet === 'memorial'
  return {
    date: '2026-11-13',
    dateLabel: '11月13日 周五',
    chips: chips(scene.states),
    badge: scene.states.indexOf('due') >= 0,
    petView: scene.pet,
    band: scene.band,
    bandText: BAND_TEXT[scene.band],
    companyDays: memorial ? 12 : 18,
    mealsEaten: memorial ? 30 : 41,
    cooldownDays: memorial ? 6 : 0,
    camera: cameraFor(scene.states),
  }
}

function checkinView(meal, name) {
  const done = name === 'done'
  return {
    mealName: { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }[meal] || '这一餐',
    windowEnd: '13:00',
    checkedAt: '12:06',
    checked: done,
    staple: name === 'staple',
    stapleLeft: 2,
  }
}

function galleryView(name) {
  const today = 4
  const days = [
    { key: '2026-11-09', week: '一', day: 9 }, { key: '2026-11-10', week: '二', day: 10 },
    { key: '2026-11-11', week: '三', day: 11 }, { key: '2026-11-12', week: '四', day: 12 },
    { key: '2026-11-13', week: '五', day: 13 }, { key: '2026-11-14', week: '六', day: 14 },
    { key: '2026-11-15', week: '日', day: 15 },
  ]
  const empty = name === 'empty'
  return {
    streak: empty ? 0 : 3,
    todayIndex: today,
    days: days,
    meals: [
      { meal: 'breakfast', name: '早餐', photo: empty ? '' : '/assets/preview/breakfast.png', exempt: false },
      { meal: 'lunch', name: '午餐', photo: '', exempt: !empty },
      { meal: 'dinner', name: '晚餐', photo: '', exempt: false },
    ],
  }
}

function adoptView(name) {
  const cooling = name === 'cooling' || name === 'memorial'
  return { canAdopt: !cooling, cooldownDays: cooling ? 6 : 0 }
}

function meView() {
  return { nickname: '吃饭人', accountId: 'cf-2048-7731' }
}

module.exports = { homeView, checkinView, galleryView, adoptView, meView }
