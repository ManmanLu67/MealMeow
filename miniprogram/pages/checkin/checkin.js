const MEAL_NAME = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }

Page({
  data: {
    meal: '',
    mealName: '这一餐',
    windowEnd: '',
    checked: false,
  },
  onLoad(query) {
    const meal = query.meal || ''
    this.setData({
      meal,
      mealName: MEAL_NAME[meal] || '这一餐',
      checked: false,
    })
  },
  close() {
    wx.navigateBack()
  },
})
