Page({
  data: {
    petView: 'pasture',
    bandText: '',
    companyDays: 0,
    mealsEaten: 0,
    cooldownDays: 0,
  },
  goCheckin(event) {
    const meal = event.currentTarget.dataset.meal
    wx.navigateTo({ url: '/pages/checkin/checkin?meal=' + meal })
  },
  goAdopt() {
    wx.navigateTo({ url: '/pages/adopt/adopt' })
  },
})
