// 调试用。错误原文进微信实时日志，同一用户同一种失败只记一次。
// 只记范围、错误原文和本机用户号，不记昵称、宠物名和备份内容。
const seen = Object.create(null)

function errorText(err) {
  if (typeof err === 'string') return err
  if (typeof err === 'number' || typeof err === 'boolean') return String(err)
  if (err && typeof err === 'object') {
    if (typeof err.errMsg === 'string' && err.errMsg) return err.errMsg
    if (typeof err.message === 'string' && err.message) return err.message
  }
  return ''
}

function localUserId() {
  try {
    const stored = wx.getStorageSync('localUserId')
    return typeof stored === 'string' ? stored : ''
  } catch (err) {
    return ''
  }
}

function report(scope, err) {
  try {
    if (typeof wx === 'undefined' || typeof wx.getRealtimeLogManager !== 'function') return
    const log = wx.getRealtimeLogManager()
    if (!log || typeof log.error !== 'function') return
    const text = errorText(err)
    const userId = localUserId()
    const key = String(scope || '') + '\n' + text + '\n' + userId
    if (seen[key]) return
    log.error(String(scope || ''), text, userId)
    seen[key] = true
  } catch (err) {
    // 日志失败不影响原来的操作。
  }
}

module.exports = { report: report }
