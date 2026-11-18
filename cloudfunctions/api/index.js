// 页面动作的名单和 app/handle.ts 的 PAGE_ACTIONS 一致。
// 这里还没有数据库适配器，所以认识的动作一律还没实现，不在云函数里重写规则。
const PAGE_ACTIONS = [
  'sync',
  'saveMeals',
  'checkin',
  'snack',
  'exempt',
  'deleteCheckin',
  'deleteSnack',
  'adopt',
  'home',
  'gallery',
  'adoptView',
]

exports.main = async (event) => {
  const action = event && event.action
  if (typeof action !== 'string' || PAGE_ACTIONS.indexOf(action) === -1) {
    return { ok: false, error: 'unknown_action' }
  }
  return { ok: false, error: 'not_implemented', action }
}
