const cloud = require('wx-server-sdk')
const { handleApi } = require('./handle-api.js')
const { handleReviewCallback } = require('../lib/app/media-check.js')
const { createWechatMediaCheck, verifyWechatSignature } = require('../lib/adapters/cloud/wechat-media-check.js')
const { createCloudStore } = require('../lib/adapters/cloud/cloud-store.js')
const { wxCloudDb } = require('../wx-db.js')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

function isMediaCallback(event) {
  return Boolean(event) && !event.action && (event.Event === 'wxa_media_check' || typeof event.trace_id === 'string')
}

exports.main = async (event) => {
  const store = createCloudStore(wxCloudDb(cloud.database()))
  if (isMediaCallback(event)) {
    const token = process.env.MEAL_MEDIA_TOKEN || ''
    return handleReviewCallback(event, {
      store,
      now: new Date(),
      verifySignature: function (body) { return verifyWechatSignature(token, body) },
    })
  }
  const context = cloud.getWXContext()
  if (!context.OPENID) return { ok: false, error: 'no_user' }
  return handleApi(event, {
    userId: context.OPENID,
    now: new Date(),
    store,
    media: createWechatMediaCheck(cloud.openapi.security, context.OPENID),
  })
}
