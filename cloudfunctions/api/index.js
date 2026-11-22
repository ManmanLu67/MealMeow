const cloud = require('wx-server-sdk')
const { handleApi } = require('./handle-api.js')
const { createCloudStore } = require('../lib/adapters/cloud/cloud-store.js')
const { wxCloudDb } = require('../wx-db.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const context = cloud.getWXContext()
  if (!context.OPENID) return { ok: false, error: 'no_user' }
  return handleApi(event, {
    userId: context.OPENID,
    now: new Date(),
    store: createCloudStore(wxCloudDb(cloud.database())),
  })
}
