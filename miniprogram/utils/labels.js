// 页面固定文案。餐次名和宠物状态说明只在这里定义，页面不各写一份。
const MEAL_NAME = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }

// 宠物详情半屏里的状态说明。语气柔和，不指责。
const BAND_NOTE = {
  full: '吃得很好，今天心情不错。',
  peckish: '有点想吃东西了，别忘了下一顿。',
  hungry: '肚子很空了，下一顿要记得打卡。',
  critical: '很虚弱了，请尽快好好吃一顿。',
}

module.exports = { MEAL_NAME, BAND_NOTE }
