// 设计阶段的样例视图模型。形状和计划 views.md 里 homeView / galleryView / adoptView 的返回值一致，
// 页面只认这个形状，所以接上真实云函数时页面不用改。
// 用法：在微信开发者工具的"编译模式"里给首页加启动参数
// state=living / peckish / hungry / critical / memorial / pasture / cooling / two-due / idle / snack。
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

const META = {
  breakfast: { name: '早餐', time: '07:30' },
  lunch: { name: '午餐', time: '12:00' },
  dinner: { name: '晚餐', time: '18:00' },
}

const HEALTH = { full: '100', peckish: '78', hungry: '44', critical: '22' }

// 预览没有时钟。每个饥饿档落在不同的百分比区间，情绪词才会跟着变。
const SCENE_HUNGER = {
  living: '18%',
  snack: '18%',
  pasture: '18%',
  idle: '8%',
  memorial: '10%',
  peckish: '48%',
  'two-due': '48%',
  hungry: '74%',
  critical: '96%',
  cooling: '100%',
}

function sceneHunger(name) {
  return SCENE_HUNGER[name] || '18%'
}

function sceneEmotion(name) {
  const percent = Number(sceneHunger(name).replace('%', ''))
  if (percent <= 30) return '饱足'
  if (percent <= 60) return '满足'
  if (percent <= 85) return '有点饿'
  return '饿扁了'
}

function chips(states) {
  return MEALS.map(function (m, i) {
    return {
      meal: m.meal,
      name: META[m.meal].name,
      time: META[m.meal].time,
      state: states[i],
      label: chipLabel(m.short, states[i]),
    }
  })
}

// 相机视图：due 是窗口内还没打的餐，insideWindow 是现在是否落在任何窗口里。
// 窗口外的打卡算零食；窗口内但都打过了只提示。
function cameraFor(states, insideWindow) {
  const due = MEALS.filter(function (m, i) { return states[i] === 'due' })
    .map(function (m) { return { meal: m.meal, name: m.name } })
  if (due.length === 1) return { type: 'checkin', meal: due[0].meal, name: due[0].name }
  if (due.length > 1) return { type: 'pick', meals: due }
  return insideWindow ? { type: 'toast', reason: 'meal_done' } : { type: 'snack' }
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
  idle: { pet: 'living', band: 'full', states: ['checked_in', 'checked_in', 'checked_in'], insideWindow: true },
  snack: { pet: 'living', band: 'full', states: ['checked_in', 'checked_in', 'upcoming'], insideWindow: false },
}

function homeView(name) {
  const scene = SCENES[name] || SCENES.living
  const memorial = scene.pet === 'memorial'
  const hasDue = scene.states.indexOf('due') >= 0
  const insideWindow = scene.insideWindow === undefined ? hasDue : scene.insideWindow
  return {
    date: '2026-11-13',
    dateLabel: '11月13日 周五',
    chips: chips(scene.states),
    badge: hasDue,
    petView: scene.pet,
    petName: '小饭',
    band: scene.band,
    bandText: BAND_TEXT[scene.band],
    // 饥饿百分比按场景写死，情绪词由百分比换算。健康用原来的档换算成满分 100。
    emotion: sceneEmotion(name),
    hungerText: sceneHunger(name),
    healthText: scene.pet === 'pasture' ? '—' : (scene.pet === 'memorial' ? '0' : HEALTH[scene.band]),
    levelText: scene.pet === 'pasture' ? '—' : '1',
    bowlFull: name === 'idle',
    recentPhoto: name === 'idle' ? '/assets/preview/lunch.png' : '',
    companyDays: memorial ? 12 : 18,
    mealsEaten: memorial ? 30 : 41,
    cooldownDays: memorial ? 6 : 0,
    camera: cameraFor(scene.states, insideWindow),
  }
}

function checkinView(meal, name) {
  const done = name === 'done'
  if (meal === 'snack') {
    return { checkedAt: done ? '14:20' : '', checked: done, staple: false, stapleLeft: 0 }
  }
  return {
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
    // 零食是窗口外的打卡，图鉴里单独显示一行。每份零食取封面图，count 是这一份的张数。
    snacks: empty ? [] : [
      { startedAt: '2026-11-13T06:00:00.000Z', photo: '/assets/preview/lunch.png', count: 1 },
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

// 预览用的旧宠物。照片是现成的打卡样图，不是宠物肖像。
const MEMORIALS = [
  {
    id: 'fan',
    name: '小饭',
    photo: '/assets/preview/lunch.png',
    companyDays: 12,
    mealsEaten: 30,
    level: '1',
    adoptedOn: '2026-11-01',
    diedOn: '2026-11-13',
    cooldownDays: 6,
  },
  {
    id: 'tuan',
    name: '团团',
    photo: '/assets/preview/breakfast.png',
    companyDays: 40,
    mealsEaten: 90,
    level: '3',
    adoptedOn: '2026-09-01',
    diedOn: '2026-10-20',
    cooldownDays: 0,
  },
]

function memorialList() {
  return MEMORIALS.map(function (pet) {
    return { id: pet.id, name: pet.name, photo: pet.photo }
  })
}

function memorialDetail(id) {
  for (let i = 0; i < MEMORIALS.length; i += 1) {
    if (MEMORIALS[i].id === id) return MEMORIALS[i]
  }
  return null
}

module.exports = { homeView, checkinView, galleryView, adoptView, meView, memorialList, memorialDetail }
