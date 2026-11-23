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
  return 'Asia/Shanghai'
}

module.exports = { deviceTimeZone: deviceTimeZone }
