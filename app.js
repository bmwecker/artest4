import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'
import { ARButton } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/webxr/ARButton.js'
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js'

const WEBSITE_URL = 'https://example.com'
const AUDIO_URL = './assets/music.wav'

const app = document.getElementById('app')
const scanUI = document.getElementById('scan-ui')
const statusText = document.getElementById('status-text')
const websiteBtn = document.getElementById('website-btn')
const resetBtn = document.getElementById('reset-btn')
const photoBtn = document.getElementById('photo-btn')
const downloadLink = document.getElementById('download-link')

let camera, scene, renderer, controller, reticle, placedRoot
let hitTestSource = null
let hitTestSourceRequested = false
let currentHitMatrix = null
let currentHitPosition = new THREE.Vector3()
let currentHitQuaternion = new THREE.Quaternion()
let scenePlaced = false
let modelsReady = false
let audio

init()

async function init() {
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 40)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.xr.enabled = true
  app.appendChild(renderer.domElement)

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.3)
  scene.add(hemiLight)

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.1)
  dirLight.position.set(2, 5, 3)
  scene.add(dirLight)

  reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.10, 0.14, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
  )
  reticle.matrixAutoUpdate = false
  reticle.visible = false
  scene.add(reticle)

  placedRoot = new THREE.Group()
  placedRoot.visible = false
  scene.add(placedRoot)

  await loadModels()
  setupXR()
  setupUI()

  renderer.setAnimationLoop(render)
  window.addEventListener('resize', onResize)
}

async function loadModels() {
  const loader = new GLTFLoader()
  const [modelA, modelB] = await Promise.all([
    loader.loadAsync('./assets/textured_mesh.glb'),
    loader.loadAsync('./assets/textured_mesh_1.glb')
  ])

  const a = modelA.scene
  a.position.set(-0.55, 0, 0)
  a.scale.setScalar(0.35)

  const b = modelB.scene
  b.position.set(0.55, 0.02, 0)
  b.scale.setScalar(0.35)

  placedRoot.add(a, b)
  modelsReady = true
}

function setupXR() {
  const arButton = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay', 'light-estimation'],
    domOverlay: { root: document.body }
  })

  arButton.classList.add('xr-button')
  arButton.textContent = 'Запустить XR'
  document.body.appendChild(arButton)

  controller = renderer.xr.getController(0)
  controller.addEventListener('select', placeOrReposition)
  scene.add(controller)

  renderer.xr.addEventListener('sessionstart', async () => {
    setupAudio()
    try { await audio.play() } catch {}
    showScan('Поводите телефоном, чтобы сцена нашла плоскость. Когда круг появится — нажмите на экран.')
  })

  renderer.xr.addEventListener('sessionend', () => {
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    hitTestSourceRequested = false
    hitTestSource = null
    reticle.visible = false
    currentHitMatrix = null
    scenePlaced = false
    placedRoot.visible = false
    showScan('Поводите телефоном влево-вправо и вверх-вниз, чтобы сцена нашла плоскость.')
  })
}

function setupUI() {
  websiteBtn.addEventListener('click', () => {
    window.open(WEBSITE_URL, '_blank', 'noopener,noreferrer')
  })

  resetBtn.addEventListener('click', () => {
    scenePlaced = false
    placedRoot.visible = false
    showScan('Найдите новую плоскость и нажмите на экран, чтобы переставить сцену.')
  })

  photoBtn.addEventListener('click', captureAndShare)
}

function setupAudio() {
  if (audio) return
  audio = new Audio(AUDIO_URL)
  audio.loop = true
  audio.volume = 0.7
  audio.crossOrigin = 'anonymous'
}

function placeOrReposition() {
  if (!currentHitMatrix || !modelsReady) return

  currentHitPosition.setFromMatrixPosition(currentHitMatrix)
  currentHitQuaternion.setFromRotationMatrix(currentHitMatrix)

  placedRoot.position.copy(currentHitPosition)
  placedRoot.quaternion.copy(currentHitQuaternion)
  placedRoot.visible = true
  scenePlaced = true

  hideScan()
}

async function captureAndShare() {
  try {
    const blob = await canvasToBlob(renderer.domElement)
    const file = new File([blob], `xr-photo-${Date.now()}.png`, { type: 'image/png' })

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'XR photo',
        text: 'Сделано в XR сцене'
      })
      return
    }

    const url = URL.createObjectURL(blob)
    downloadLink.href = url
    downloadLink.download = file.name
    downloadLink.click()
    setTimeout(() => URL.revokeObjectURL(url), 1200)
    alert('Файл сохранён. Если меню Поделиться не открылось, отправь фото из галереи.')
  } catch (error) {
    console.error(error)
    alert('Не удалось сделать снимок в этом браузере.')
  }
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Canvas export failed'))
    }, 'image/png')
  })
}

function requestHitTestSource(session) {
  session.requestReferenceSpace('viewer').then((referenceSpace) => {
    session.requestHitTestSource({ space: referenceSpace }).then((source) => {
      hitTestSource = source
    })
  })

  session.addEventListener('end', () => {
    hitTestSourceRequested = false
    hitTestSource = null
  })

  hitTestSourceRequested = true
}

function render(timestamp, frame) {
  if (frame) {
    const session = renderer.xr.getSession()

    if (!hitTestSourceRequested) requestHitTestSource(session)

    if (hitTestSource) {
      const referenceSpace = renderer.xr.getReferenceSpace()
      const hitTestResults = frame.getHitTestResults(hitTestSource)

      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0]
        const pose = hit.getPose(referenceSpace)
        currentHitMatrix = new THREE.Matrix4().fromArray(pose.transform.matrix)
        reticle.visible = true
        reticle.matrix.fromArray(pose.transform.matrix)

        if (!scenePlaced) {
          showScan('Поверхность найдена. Нажмите на экран, чтобы поставить XR сцену.')
        }
      } else {
        currentHitMatrix = null
        reticle.visible = false
        if (!scenePlaced) {
          showScan('Ищу плоскость. Медленно веди телефон из стороны в сторону.')
        }
      }
    }
  }

  renderer.render(scene, camera)
}

function showScan(text) {
  statusText.textContent = text
  scanUI.classList.add('visible')
}

function hideScan() {
  scanUI.classList.remove('visible')
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}
