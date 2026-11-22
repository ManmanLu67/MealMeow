const api = require('../../utils/api.js')
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
    if (config.usePreviewData) {
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
      return
    }
    const self = this
    api.call('memorial', { id: query.id }).then(function (res) {
      const pet = res.ok ? res.data : null
      if (!pet || pet.missing) {
        self.setData({ missing: true })
        return
      }
      self.setData({
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
    })
  },
})
