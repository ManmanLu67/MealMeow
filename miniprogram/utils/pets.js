// 主页动物和对应相机。图来自设计稿，页面只按物种和饥饿档挑一张。
const SPECIES = ['cat', 'samoyed', 'parrot', 'goldfish']

const PETS = {
  cat: {
    name: '猫',
    calm: '/assets/pet/cat.webp',
    hungry: '/assets/pet/cat.webp',
    critical: '/assets/pet/cat.webp',
    camera: '/assets/pet/camera-cat.webp',
  },
  samoyed: {
    name: '狗',
    calm: '/assets/pet/samoyed.webp',
    hungry: '/assets/pet/samoyed-hungry.webp',
    critical: '/assets/pet/samoyed-critical.webp',
    camera: '/assets/pet/camera-samoyed.webp',
  },
  parrot: {
    name: '鸟',
    calm: '/assets/pet/parrot.webp',
    hungry: '/assets/pet/parrot-hungry.webp',
    critical: '/assets/pet/parrot-critical.webp',
    camera: '/assets/pet/camera-parrot.webp',
  },
  // 设计稿里金鱼没有「很饿」这一张，很饿沿用平时的鱼缸。
  goldfish: {
    name: '鱼',
    calm: '/assets/pet/goldfish.webp',
    hungry: '/assets/pet/goldfish.webp',
    critical: '/assets/pet/goldfish-critical.webp',
    camera: '/assets/pet/camera-goldfish.webp',
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
