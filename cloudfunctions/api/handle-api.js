// 登录用户由云函数从微信上下文传入。请求体里的 userId 不采用。
// 没有 store 时只给测试替换 home / syncUser。页面动作里没有 review。
async function handleApi(event, deps) {
  const body = event && typeof event === 'object' ? event : {}
  const caller = { userId: deps.userId }
  const now = deps.now || new Date()
  if (!deps.store) {
    if (body.action === 'home' && typeof deps.home === 'function') return deps.home(caller)
    if (body.action === 'sync' && typeof deps.syncUser === 'function') {
      return deps.syncUser(caller, now, { timeZone: body.timeZone })
    }
    return { ok: false, error: 'unknown_action' }
  }
  const { handle, PAGE_ACTIONS } = require('../lib/app/handle.js')
  if (typeof body.action !== 'string' || PAGE_ACTIONS.indexOf(body.action) === -1) {
    return { ok: false, error: 'unknown_action' }
  }
  return handle(deps.store, caller, now, event)
}

module.exports = { handleApi }
