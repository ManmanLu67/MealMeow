// 第一次打开时，在真实页面上挖洞高亮。看完才记 done。注销后从头再看。
const KEY = 'guideStep'

const STEPS = {
  meals: {
    id: 'meals',
    selector: '.meals',
    icon: '/assets/icon/setting-meals.png',
    lead: '第一步：点击这里设置饭点。',
    rest: '在【用户】中也可以随时修改哦。',
    next: '下一步',
  },
  camera: {
    id: 'camera',
    selector: '.cam',
    icon: '/assets/icon/camera.png',
    lead: '第二步：按时点这里拍照打卡。',
    rest: '照片仅存手机本地，不上传云端。',
    next: '下一步',
  },
  adopt: {
    id: 'adopt',
    selector: '.adopt-label',
    icon: '/assets/icon/person.png',
    lead: '第三步：点这里领养你的宠物。',
    rest: '注：界面宠物形象及部分视觉元素由 AI 辅助生成',
    next: '下一步',
  },
  backup: {
    id: 'backup',
    selector: '.guide-export',
    icon: '/assets/icon/setting-privacy.png',
    lead: '点这里导出备份。',
    rest: '换手机或清理了微信缓存，记录和宠物可能会丢失。',
    next: '知道了',
  },
}

const ORDER = ['meals', 'camera', 'adopt', 'backup']

function read() {
  try {
    const saved = wx.getStorageSync(KEY)
    if (ORDER.indexOf(saved) >= 0 || saved === 'done') return saved
  } catch (err) {
    return ''
  }
  return ''
}

function current() {
  return read()
}

function view(id) {
  return STEPS[id] || null
}

/** 还没有进度时：新账号从饭点讲起，旧账号直接标完成。 */
function beginIfNew(created) {
  const saved = read()
  if (saved) return saved
  const step = created ? 'meals' : 'done'
  wx.setStorageSync(KEY, step)
  return step
}

function advance(id) {
  const index = ORDER.indexOf(id)
  const next = index >= 0 && index < ORDER.length - 1 ? ORDER[index + 1] : 'done'
  wx.setStorageSync(KEY, next)
  return next
}

function reset() {
  try {
    wx.removeStorageSync(KEY)
  } catch (err) {
    // 清掉进度失败时，下次仍按存储里的值走。
  }
}

/** 洞对准目标，气泡避开洞。目标偏下时气泡放上面。 */
function spotlight(rect, winW, winH) {
  const pad = 8
  const left = Math.max(0, rect.left - pad)
  const top = Math.max(0, rect.top - pad)
  const width = rect.width + pad * 2
  const height = rect.height + pad * 2
  const hole = { left: left, top: top, width: width, height: height, right: left + width, bottom: top + height }
  const bubbleWidth = Math.max(160, winW - 32)
  const bubbleHeight = 210
  const below = hole.bottom + 16
  let bubbleTop = below
  if (hole.top > winH * 0.42 || below + bubbleHeight > winH - 12) bubbleTop = hole.top - 16 - bubbleHeight
  if (bubbleTop < 12) bubbleTop = 12
  if (bubbleTop + bubbleHeight > winH - 12) bubbleTop = Math.max(12, winH - 12 - bubbleHeight)
  return { hole: hole, bubble: { left: 16, top: bubbleTop, width: bubbleWidth } }
}

module.exports = {
  current: current,
  view: view,
  beginIfNew: beginIfNew,
  advance: advance,
  reset: reset,
  spotlight: spotlight,
}
