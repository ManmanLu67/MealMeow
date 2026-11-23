// 微信逻辑层给出的时区经常不是 IANA 名称。认不出时按本机偏移选一个能用的。
const { canonicalTimeZone } = require('../generated/domain/time.js')

function reportedZone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return typeof zone === 'string' ? zone : ''
  } catch (err) {
    return ''
  }
}

function offsetLabel() {
  const minutes = -new Date().getTimezoneOffset()
  const sign = minutes >= 0 ? '+' : '-'
  const abs = Math.abs(minutes)
  const hour = Math.floor(abs / 60)
  const minute = abs % 60
  return 'UTC' + sign + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0')
}

function deviceTimeZone() {
  const named = canonicalTimeZone(reportedZone())
  if (named) return named
  const fromClock = canonicalTimeZone(offsetLabel())
  if (fromClock) return fromClock
  return offsetLabel()
}

function describe() {
  const lines = []
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    lines.push('reported=' + (typeof zone === 'string' ? zone : typeof zone))
  } catch (err) {
    lines.push('reported=' + (err && err.message ? err.message : 'throw'))
  }
  lines.push('offset=' + new Date().getTimezoneOffset())
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai' }).format(0)
    lines.push('intl=ok')
  } catch (err) {
    lines.push('intl=' + (err && err.message ? err.message : 'throw'))
  }
  return lines.join('\n')
}

module.exports = { deviceTimeZone: deviceTimeZone, describe: describe }
