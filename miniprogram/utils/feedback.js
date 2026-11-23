// 音效默认关，震动默认开。偏好在本机，页面只问这一处。
const FILES = {
  tap: '/assets/audio/tap.wav',
  pet: '/assets/audio/pet.wav',
  eat: '/assets/audio/eat.wav',
  checkin: '/assets/audio/checkin.wav',
}

let audio = null

function play(name) {
  // 这一版不播放。wav 和开关页留着，以后接回时删掉这一行。
  return
  if (wx.getStorageSync('sound') !== true) return
  const src = FILES[name]
  if (!src || !wx.createInnerAudioContext) return
  try {
    if (!audio) {
      audio = wx.createInnerAudioContext()
      audio.obeyMuteSwitch = true
    } else {
      audio.stop()
    }
    audio.src = src
    audio.volume = 0.35
    audio.play()
  } catch (err) {
    // 这台设备播不了时，开关仍然记着。
  }
}

function vibrate() {
  if (wx.getStorageSync('haptics') === false) return
  if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
}

module.exports = { play: play, vibrate: vibrate }
