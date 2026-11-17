// 云函数调用的唯一入口。页面不直接碰 wx.cloud，换平台时只改这一个文件。
// 调用者是谁由云端的登录态决定，这里不传 userId。
function call(action, payload) {
  if (!wx.cloud) return Promise.resolve({ ok: false, error: 'no_cloud' })
  return wx.cloud
    .callFunction({ name: 'api', data: Object.assign({}, payload, { action: action }) })
    .then(function (res) {
      return res && res.result ? res.result : { ok: false, error: 'empty' }
    })
    .catch(function () {
      return { ok: false, error: 'network' }
    })
}

module.exports = { call: call }
