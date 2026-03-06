(() => {
  const WEBSITE_URL = 'https://example.com'
  const MODEL_PATHS = [
    'assets/textured_mesh.glb',
    'assets/textured_mesh_1.glb',
  ]

  const ui = {
    canvas: document.getElementById('camerafeed'),
    ui: document.getElementById('ui'),
    startOverlay: document.getElementById('startOverlay'),
    startBtn: document.getElementById('startBtn'),
    statusPill: document.getElementById('statusPill'),
    instruction: document.getElementById('instruction'),
    centerGuide: document.getElementById('centerGuide'),
    placeBtn: document.getElementById('placeBtn'),
    photoBtn: document.getElementById('photoBtn'),
    musicBtn: document.getElementById('musicBtn'),
    siteBtn: document.getElementById('siteBtn'),
    bgMusic: document.getElementById('bgMusic'),
    messageOverlay: document.getElementById('messageOverlay'),
    messageTitle: document.getElementById('messageTitle'),
    messageText: document.getElementById('messageText'),
    messageCloseBtn: document.getElementById('messageCloseBtn'),
  }

  ui.siteBtn.href = WEBSITE_URL

  const state = {
    xrStarted: false,
    sceneReady: false,
    modelsReady: false,
    surfaceFound: false,
    placed: false,
    currentHit: null,
    reticle: null,
    root: null,
    scene: null,
    camera: null,
    renderer: null,
    loadingManager: null,
    modelsFailed: false,
  }

  function setStatus(text) {
    ui.statusPill.textContent = text
  }

  function setInstruction(text) {
    ui.instruction.textContent = text
  }

  function showMessage(title, text) {
    ui.messageTitle.textContent = title
    ui.messageText.textContent = text
    ui.messageOverlay.hidden = false
  }

  function hideMessage() {
    ui.messageOverlay.hidden = true
  }

  ui.messageCloseBtn.addEventListener('click', hideMessage)

  function makeReticle(THREE) {
    const group = new THREE.Group()
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.11, 0.14, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
    )
    ring.rotation.x = -Math.PI / 2
    group.add(ring)

    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.02, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, side: THREE.DoubleSide })
    )
    dot.rotation.x = -Math.PI / 2
    group.add(dot)
    group.visible = false
    return group
  }

  function createContentRoot(THREE) {
    const root = new THREE.Group()
    root.visible = false
    root.matrixAutoUpdate = true
    return root
  }

  function loadModels(THREE) {
    return new Promise((resolve, reject) => {
      const manager = new THREE.LoadingManager()
      manager.onError = (url) => {
        console.error('Model failed:', url)
      }
      const loader = new THREE.GLTFLoader(manager)
      const targetRoot = state.root
      const loaded = []

      const relativeLayout = [
        { position: [-0.55, 0, 0.04], scale: 0.9 },
        { position: [0.55, 0, -0.04], scale: 0.9 },
      ]

      let finished = 0
      let failed = false

      MODEL_PATHS.forEach((path, index) => {
        loader.load(
          path,
          (gltf) => {
            const model = gltf.scene || gltf.scenes?.[0]
            if (!model) {
              failed = true
              reject(new Error(`Пустая модель: ${path}`))
              return
            }
            model.position.set(...relativeLayout[index].position)
            model.scale.setScalar(relativeLayout[index].scale)
            model.traverse((obj) => {
              if (obj.isMesh) {
                obj.castShadow = false
                obj.receiveShadow = false
                if (obj.material) {
                  if ('envMapIntensity' in obj.material) obj.material.envMapIntensity = 0.85
                  obj.frustumCulled = false
                }
              }
            })
            targetRoot.add(model)
            loaded.push(model)
            finished += 1
            if (finished === MODEL_PATHS.length && !failed) resolve(loaded)
          },
          undefined,
          (error) => {
            console.error(error)
            failed = true
            reject(new Error(`Не удалось загрузить модель: ${path}`))
          }
        )
      })
    })
  }

  function applyHitToObject(hit, object3d) {
    object3d.position.set(hit.position.x, hit.position.y, hit.position.z)
    object3d.quaternion.set(hit.rotation.x, hit.rotation.y, hit.rotation.z, hit.rotation.w)
  }

  function placeScene() {
    if (!state.currentHit || !state.root) return
    applyHitToObject(state.currentHit, state.root)
    state.root.visible = true
    state.placed = true
    if (state.reticle) state.reticle.visible = false
    setStatus('Сцена размещена')
    setInstruction('Сцена закреплена. Кнопкой «Разместить» можно переставить её заново.')
    ui.placeBtn.textContent = 'Переставить'
  }

  async function takePhoto() {
    if (!window.XR8 || !XR8.CanvasScreenshot) {
      showMessage('Фото недоступно', 'На этом устройстве модуль скриншота не запустился.')
      return
    }

    ui.photoBtn.disabled = true
    ui.photoBtn.textContent = 'Снимаю…'

    try {
      const base64 = await XR8.CanvasScreenshot.takeScreenshot()
      const dataUrl = `data:image/jpeg;base64,${base64}`
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'xr-photo.jpg', { type: 'image/jpeg' })

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'XR photo' })
      } else {
        const link = document.createElement('a')
        link.href = dataUrl
        link.download = 'xr-photo.jpg'
        document.body.appendChild(link)
        link.click()
        link.remove()
        showMessage('Фото сохранено', 'На этом устройстве системное меню «Поделиться» недоступно. Фото было скачано как файл.')
      }
    } catch (error) {
      console.error(error)
      showMessage('Не удалось сделать фото', error?.message || 'Скриншот не был создан.')
    } finally {
      ui.photoBtn.disabled = false
      ui.photoBtn.textContent = 'Фото'
    }
  }

  async function toggleMusic() {
    try {
      if (ui.bgMusic.paused) {
        await ui.bgMusic.play()
        ui.musicBtn.textContent = 'Пауза'
      } else {
        ui.bgMusic.pause()
        ui.musicBtn.textContent = 'Музыка'
      }
    } catch (error) {
      console.error(error)
      showMessage('Музыка не стартовала', 'Браузер не разрешил включить звук. Нажми кнопку ещё раз после взаимодействия со сценой.')
    }
  }

  ui.photoBtn.addEventListener('click', takePhoto)
  ui.musicBtn.addEventListener('click', toggleMusic)
  ui.placeBtn.addEventListener('click', () => {
    if (!state.modelsReady) {
      showMessage('Сцена ещё грузится', '3D модели ещё не догрузились. Подожди пару секунд.')
      return
    }
    if (state.placed) {
      state.placed = false
      state.root.visible = false
      state.currentHit = null
      state.surfaceFound = false
      if (state.reticle) state.reticle.visible = false
      ui.placeBtn.disabled = true
      ui.placeBtn.textContent = 'Разместить'
      setStatus('Ищу поверхность…')
      setInstruction('Снова поводить телефоном, чтобы найти поверхность и разместить сцену заново.')
      return
    }
    placeScene()
  })

  function installTapToPlace() {
    const handler = (event) => {
      if (!state.surfaceFound || state.placed || !state.modelsReady) return
      const target = event.target
      if (target && (target.closest('button') || target.closest('a'))) return
      placeScene()
    }
    ui.canvas.addEventListener('click', handler)
    ui.canvas.addEventListener('touchend', handler, { passive: true })
  }

  function buildPipelineModule() {
    return {
      name: 'custom-xr-scene',
      onStart: ({ canvasWidth, canvasHeight }) => {
        const { scene, camera, renderer } = XR8.Threejs.xrScene()
        state.scene = scene
        state.camera = camera
        state.renderer = renderer

        const THREE = window.THREE
        if (!THREE) {
          showMessage('THREE.js не найден', 'runtime.js не загрузил графический движок.')
          return
        }

        renderer.outputColorSpace = THREE.SRGBColorSpace || renderer.outputColorSpace

        const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1.25)
        hemi.position.set(0, 1, 0)
        scene.add(hemi)

        const dir = new THREE.DirectionalLight(0xffffff, 0.9)
        dir.position.set(1.5, 3, 2)
        scene.add(dir)

        state.reticle = makeReticle(THREE)
        state.root = createContentRoot(THREE)
        scene.add(state.reticle)
        scene.add(state.root)

        state.sceneReady = true
        XR8.XrController.updateCameraProjectionMatrix({
          origin: camera.position,
          facing: camera.quaternion,
        })

        setStatus('Загружаю модели…')
        setInstruction('Сцена открылась. Сначала загружаю 3D модели.')

        loadModels(THREE)
          .then(() => {
            state.modelsReady = true
            setStatus('Ищу поверхность…')
            setInstruction('Поводи телефоном влево‑вправо и вверх‑вниз, пока не появится точка размещения.')
          })
          .catch((error) => {
            state.modelsFailed = true
            console.error(error)
            showMessage('Модели не загрузились', error.message || 'Не удалось загрузить 3D контент.')
            setStatus('Ошибка моделей')
          })
      },
      onUpdate: () => {
        if (!state.sceneReady || !state.modelsReady || state.placed) return
        const hits = XR8.XrController.hitTest(0.5, 0.5, ['FEATURE_POINT']) || []
        if (hits.length > 0) {
          state.currentHit = hits[0]
          state.surfaceFound = true
          applyHitToObject(state.currentHit, state.reticle)
          state.reticle.visible = true
          ui.placeBtn.disabled = false
          setStatus('Поверхность найдена')
          setInstruction('Нажми «Разместить» или просто коснись экрана, чтобы поставить сцену в этой точке.')
        } else {
          state.currentHit = null
          state.surfaceFound = false
          state.reticle.visible = false
          ui.placeBtn.disabled = true
          setStatus('Ищу поверхность…')
        }
      },
      onCameraStatusChange: ({ status }) => {
        if (status === 'failed') {
          showMessage('Камера не запустилась', 'Браузер не дал доступ к камере или устройство не поддерживается.')
          setStatus('Ошибка камеры')
        }
      },
    }
  }

  function onXrLoaded() {
    if (state.xrStarted) return
    state.xrStarted = true

    try {
      XR8.CanvasScreenshot.configure({ maxDimension: 1280, jpgCompression: 90 })
      XR8.addCameraPipelineModules([
        XR8.XrController.pipelineModule(),
        XR8.GlTextureRenderer.pipelineModule(),
        XR8.Threejs.pipelineModule(),
        XR8.CanvasScreenshot.pipelineModule(),
        buildPipelineModule(),
      ])

      XR8.run({
        canvas: ui.canvas,
        allowedDevices: XR8.XrConfig.device().MOBILE,
      })

      installTapToPlace()
      ui.ui.classList.remove('hidden')
      setStatus('Запрашиваю камеру…')
      setInstruction('Разреши доступ к камере. После этого поводить телефоном, чтобы найти поверхность.')
    } catch (error) {
      console.error(error)
      showMessage('XR не стартовал', error?.message || 'Во время запуска произошла ошибка.')
      setStatus('Ошибка запуска')
    }
  }

  ui.startBtn.addEventListener('click', async () => {
    ui.startBtn.disabled = true
    ui.startBtn.textContent = 'Запуск…'
    ui.startOverlay.hidden = true

    try {
      if (window.XR8) {
        onXrLoaded()
      } else {
        window.addEventListener('xrloaded', onXrLoaded, { once: true })
        setTimeout(() => {
          if (!state.xrStarted) {
            showMessage('XR не загрузился', 'xr.js не успел инициализироваться. Проверь, что проект открыт по HTTPS и устройство поддерживает WebAR.')
            setStatus('xr.js не загрузился')
          }
        }, 8000)
      }
    } catch (error) {
      console.error(error)
      showMessage('Не удалось начать', error?.message || 'Ошибка инициализации.')
    }
  })
})()
