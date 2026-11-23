// 主页动物和对应相机。图来自设计稿，页面只按物种和饥饿档挑一张。
const SPECIES = ['cat', 'samoyed', 'parrot', 'goldfish']

const PETS = {
  cat: {
    name: '猫',
    calm: '/assets/pet/cat.png',
    hungry: '/assets/pet/cat.png',
    critical: '/assets/pet/cat.png',
    camera: '/assets/pet/camera-cat.png',
  },
  samoyed: {
    name: '狗',
    calm: '/assets/pet/samoyed.png',
    hungry: '/assets/pet/samoyed-hungry.png',
    critical: '/assets/pet/samoyed-critical.png',
    camera: '/assets/pet/camera-samoyed.png',
  },
  parrot: {
    name: '鸟',
    calm: '/assets/pet/parrot.png',
    hungry: '/assets/pet/parrot-hungry.png',
    critical: '/assets/pet/parrot-critical.png',
    camera: '/assets/pet/camera-parrot.png',
  },
  // 设计稿里金鱼没有「很饿」这一张，很饿沿用平时的鱼缸。
  goldfish: {
    name: '鱼',
    calm: '/assets/pet/goldfish.png',
    hungry: '/assets/pet/goldfish.png',
    critical: '/assets/pet/goldfish-critical.png',
    camera: '/assets/pet/camera-goldfish.png',
  },
}

function isSpecies(value) {
  return SPECIES.indexOf(value) >= 0
}

function looks() {
  return SPECIES.map(function (id) {
    return { id: id, name: PETS[id].name, src: PETS[id].calm }
  })
}

function art(species, band) {
  const pet = PETS[isSpecies(species) ? species : 'cat']
  if (band === 'critical') return pet.critical
  if (band === 'hungry') return pet.hungry
  return pet.calm
}

function camera(species) {
  return PETS[isSpecies(species) ? species : 'cat'].camera
}

module.exports = { SPECIES, isSpecies, looks, art, camera }
