const config = require('../../utils/config.js')
const preview = require('../../utils/preview.js')

Page({
  data: {
    missing: false,
    name: '',
    photo: '',
    companyDays: 0,
    mealsEaten: 0,
    level: '—',
    adoptedOn: '',
    diedOn: '',
    cooldownDays: 0,
  },

  onLoad(query) {
    if (!config.usePreviewData) {
      this.setData({ missing: true })
      return
    }
    const pet = preview.memorialDetail(query.id)
    if (!pet) {
      this.setData({ missing: true })
      return
    }
    this.setData({
      missing: false,
      name: pet.name,
      photo: pet.photo,
      companyDays: pet.companyDays,
      mealsEaten: pet.mealsEaten,
      level: pet.level,
      adoptedOn: pet.adoptedOn,
      diedOn: pet.diedOn,
      cooldownDays: pet.cooldownDays,
    })
  },
})
