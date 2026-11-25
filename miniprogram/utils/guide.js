// 第一次打开时，按真实页面走三段说明。看完才记 done。注销后从头再看。
const KEY = 'guideStep'

const STEPS = {
  meals: {
    id: 'meals',
    title: '欢迎使用，先定个饭点吧',
    line: '在【用户】中的【饭点设置】中设置每日的三餐时间，点右上角的餐卡进入。按时拍照打卡，用下面的相机记录你的每一餐。',
    note: '照片和记录仅保存在你的手机本地，不上传云端。',
    next: '下一步',
  },
  adopt: {
    id: 'adopt',
    title: '好好吃饭，养活这只小家伙',
    line: '点「领养」带它回家。你的每一次按时打卡，都会让它健康成长。如果连续漏餐，它会衰弱，甚至死亡。',
    note: '注：界面中的宠物形象由 AI 辅助生成。',
    next: '下一步',
  },
  backup: {
    id: 'backup',
    title: '记得常回来看看',
    line: '数据保存在本机。如果更换手机，或者清理了微信缓存，打卡记录和宠物可能会丢失。',
    note: '建议定期在这一页使用「导出备份」，再发送到微信聊天框保存。',
    next: '知道了',
  },
}

function read() {
  try {
    const saved = wx.getStorageSync(KEY)
    if (saved === 'done' || saved === 'meals' || saved === 'adopt' || saved === 'backup') return saved
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
  const next = id === 'meals' ? 'adopt' : id === 'adopt' ? 'backup' : 'done'
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

module.exports = { current: current, view: view, beginIfNew: beginIfNew, advance: advance, reset: reset }
