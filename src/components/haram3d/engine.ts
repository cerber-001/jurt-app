/* Этап 1а: общий движок просмотрщика 3D — один WebGL-контекст на открытие окна: рендерер, камера, OrbitControls,
   цикл кадров, плавный перелёт между видами, метки поверх canvas и полная уборка при закрытии
   (iOS Safari убивает страницу, если копить WebGL-контексты). Слои (наша модель, Фото-3D) подключаются через addLayer. */
import {
  ACESFilmicToneMapping, MathUtils, NoToneMapping, PCFShadowMap, PCFSoftShadowMap, PerspectiveCamera,
  Scene, Vector3, WebGLRenderer, type Material, type Object3D, type Texture, type ToneMapping,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Layer, P3, View } from '../../lib/haram3d'
import { meccaLight, type DayPhase, type SceneLight } from '../../lib/sun'
import { renderBudget, type RenderBudget } from './crowd/budget'
import { deviceHints } from './crowd/crowd'
import { createLightRig } from './light'
import { createPost, type Post } from './post'

/** Точка данных (x восток, y север, z вверх) → three.js (Y вверх, север = −Z) */
export const toV3 = (x: number, y: number, z = 0): Vector3 => new Vector3(x, z, -y)

export interface LayerHandle {
  group: Object3D
  /** Каждый кадр, пока слой показан: dt — секунды */
  update?: (dt: number) => void
  dispose: () => void
}

export interface Label { el: HTMLElement; p: P3 }

export interface Engine {
  readonly scene: Scene
  readonly camera: PerspectiveCamera
  readonly renderer: WebGLRenderer
  /** Тени и эффекты по силе устройства */
  readonly budget: RenderBudget
  /** Свет нашей модели по времени Мекки; instant — без плавного перехода. Возвращает часы Мекки и время суток */
  setTime(date: Date, instant: boolean): { clock: string; phase: DayPhase }
  /** Подписка на свет (золото, пятна под людьми); сразу вызывается с текущим */
  onLight(cb: (L: SceneLight) => void): () => void
  /** Отбрасывающее тень изменилось (вырез Масъа, загрузка модели) — перерисовать карту теней */
  invalidateShadows(): void
  addLayer(layer: Layer, h: LayerHandle): void
  setActive(layer: Layer): void
  flyTo(v: View, instant: boolean): void
  setLabels(list: readonly Label[] | null): void
  dispose(): void
}

/** Пределы камеры по слоям: Фото-3D — весь город, наша модель — от шага у Каабы до обзора */
const LIMITS: Record<Layer, { min: number; max: number }> = { google: { min: 15, max: 3500 }, ours: { min: 3, max: 1600 } }
const FLY_SEC = 1.3
/** На телефоне — чёткость не выше 1,5: вдвое меньше точек, чем 2, и заметно легче для батареи */
const DPR_PHONE = 1.5

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export interface EngineEvents {
  /** Браузер отобрал WebGL (на iPhone — нехватка памяти): цикл кадров остановлен, окно показывает честную строку */
  onContextLost?: () => void
  /** «Уменьшить движение»: свет меняется сразу, без перехода */
  reducedMotion?: boolean
}

/** Тон-маппинг нашей модели: ACES — плотные тени, мягкий «киношный» спуск светов (белый мрамор на солнце не выгорает),
    тёплое солнце и золото насыщеннее. AgX рядом смотрелся серее и площе */
export const OURS_TONE: ToneMapping = ACESFilmicToneMapping

/** ?h3debug=1 — движок в window.__h3 (renderer.info, тон-маппинг) для замеров; в обычной работе ничего не выставляется */
function debugExpose(e: unknown): void {
  try { if (new URLSearchParams(location.search).has('h3debug')) (window as unknown as { __h3?: unknown }).__h3 = e } catch { /* нет location — тест */ }
}

/** Бросает, если WebGL недоступен: вызывающий показывает честную строку «браузер не показывает 3D» */
export function createEngine(host: HTMLElement, ev: EngineEvents = {}): Engine {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  const phone = matchMedia('(pointer: coarse)').matches
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, phone ? DPR_PHONE : 2))
  renderer.setClearColor(0x000000, 0)   // Фото-3D: небо — CSS-градиент контейнера; у нашей модели — свой купол (sky.ts)
  renderer.toneMapping = OURS_TONE
  const budget = renderBudget(deviceHints())
  renderer.shadowMap.type = budget.softShadows ? PCFSoftShadowMap : PCFShadowMap
  const canvas = renderer.domElement
  canvas.className = 'h3-canvas'
  host.prepend(canvas)

  const scene = new Scene()
  // свет по времени Мекки: солнце или прожекторы с тенями, небо и окружение из него (вместо RoomEnvironment)
  const light = createLightRig(scene, renderer, { shadowMap: budget.shadowMap, reducedMotion: !!ev.reducedMotion })
  // свечение — только на компьютере (на телефоне композитор не создаётся вовсе)
  let post: Post | null = null
  const offLight = light.onChange(L => post?.setBloom(L.bloomThreshold, L.bloomStrength))

  const camera = new PerspectiveCamera(42, 1, 0.5, 9000)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.maxPolarAngle = MathUtils.degToRad(89)
  controls.screenSpacePanning = false

  const layers = new Map<Layer, LayerHandle>()
  let active: Layer = 'ours'
  let labels: readonly Label[] | null = null
  let fly: { p0: Vector3; t0: Vector3; p1: Vector3; t1: Vector3; k: number } | null = null
  let raf = 0, last = 0, disposed = false

  const resize = () => {
    const w = host.clientWidth || 1, h = host.clientHeight || 1
    renderer.setSize(w, h, false)
    post?.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null
  if (ro) ro.observe(host); else addEventListener('resize', resize)
  resize()

  // Safari выгружает WebGL при нехватке памяти. preventDefault — чтобы браузер не считал страницу сломанной;
  // восстанавливать сцену не пытаемся (модель пришлось бы грузить заново) — окно говорит «3D не удалось показать»
  const onLost = (e: Event) => {
    e.preventDefault()
    if (disposed) return
    cancelAnimationFrame(raf)
    raf = 0
    ev.onContextLost?.()
  }
  canvas.addEventListener('webglcontextlost', onLost)

  // человек тронул сцену — перелёт прерывается, камера остаётся у него в руках
  const stopFly = () => { fly = null }
  controls.addEventListener('start', stopFly)

  /** Ближняя плоскость — по расстоянию до точки взгляда: вдали точность глубины нужнее, иначе крыши и пол мерцают */
  const fitNear = () => {
    const n = MathUtils.clamp(camera.position.distanceTo(controls.target) * 0.01, 0.3, 10)
    if (Math.abs(n - camera.near) > camera.near * 0.05) { camera.near = n; camera.updateProjectionMatrix() }
  }

  const v = new Vector3()
  const placeLabels = () => {
    if (!labels) return
    const w = host.clientWidth, h = host.clientHeight
    for (const { el, p } of labels) {
      v.set(p[0], p[2], -p[1]).project(camera)
      const show = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1
      el.style.display = show ? '' : 'none'
      if (show) el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -100%)`
    }
  }

  const frame = (now: number) => {
    if (disposed || renderer.getContext().isContextLost()) return
    raf = requestAnimationFrame(frame)
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0
    last = now
    if (fly) {
      fly.k = Math.min(1, fly.k + dt / FLY_SEC)
      const e = ease(fly.k)
      camera.position.lerpVectors(fly.p0, fly.p1, e)
      controls.target.lerpVectors(fly.t0, fly.t1, e)
      if (fly.k >= 1) fly = null
    }
    controls.update()
    fitNear()
    layers.get(active)?.update?.(dt)
    if (active === 'ours') light.update(dt, camera, controls.target, !!fly)
    if (post && active === 'ours') post.render(); else renderer.render(scene, camera)
    placeLabels()
  }
  raf = requestAnimationFrame(frame)

  const applyActive = () => {
    for (const [k, h] of layers) h.group.visible = k === active
    // фото Google уже «запечены» с освещением — без тонального сжатия, иначе краски тускнеют; небо у них — CSS
    renderer.toneMapping = active === 'google' ? NoToneMapping : OURS_TONE
    light.sky.dome.visible = active === 'ours'
    controls.minDistance = LIMITS[active].min
    controls.maxDistance = LIMITS[active].max
  }
  applyActive()

  if (budget.bloom) {
    // статический импорт, а не ленивый: иначе сборщик выносит three.js в общий кусок и растёт первый файл JS
    try { post = createPost(renderer, scene, camera, host.clientWidth || 1, host.clientHeight || 1) } catch { post = null }
    const L = light.current
    if (post && L) post.setBloom(L.bloomThreshold, L.bloomStrength)
  }

  const engine: Engine = {
    scene, camera, renderer, budget,
    setTime(date, instant) {
      const m = meccaLight(date)
      light.setSun(m.pos, m.light, instant)
      return { clock: m.clock, phase: m.phase }
    },
    onLight: cb => light.onChange(cb),
    invalidateShadows: () => light.invalidateShadows(),
    addLayer(layer, h) {
      layers.get(layer)?.dispose()
      layers.set(layer, h)
      scene.add(h.group)
      applyActive()
    },
    setActive(layer) { active = layer; applyActive() },
    flyTo(view, instant) {
      const p1 = toV3(view.pos[0], view.pos[1], view.pos[2]), t1 = toV3(view.target[0], view.target[1], view.target[2])
      if (instant) { fly = null; camera.position.copy(p1); controls.target.copy(t1); controls.update(); return }
      fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1, t1, k: 0 }
    },
    setLabels(list) {
      for (const l of labels ?? []) l.el.style.display = 'none'
      labels = list
    },
    dispose() {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(raf)
      canvas.removeEventListener('webglcontextlost', onLost)   // до forceContextLoss ниже: это не сбой, а закрытие
      controls.removeEventListener('start', stopFly)
      controls.dispose()
      if (ro) ro.disconnect(); else removeEventListener('resize', resize)
      for (const h of layers.values()) h.dispose()
      layers.clear()
      offLight()
      post?.dispose()
      post = null
      light.dispose()   // карта теней, PMREM-окружение, купол неба
      disposeTree(scene)
      renderer.dispose()
      renderer.forceContextLoss()   // вернуть контекст браузеру сразу, не ждать сборщика мусора
      canvas.remove()
    },
  }
  debugExpose(engine)
  return engine
}

/** Освободить геометрию, материалы и текстуры всего, что осталось в сцене */
export function disposeTree(root: Object3D): void {
  root.traverse(o => {
    const m = o as Object3D & { geometry?: { dispose(): void }; material?: Material | Material[] }
    m.geometry?.dispose()
    for (const mat of ([] as Material[]).concat(m.material ?? [])) {
      for (const val of Object.values(mat)) if ((val as Texture | null)?.isTexture) (val as Texture).dispose()
      mat.dispose()
    }
  })
}

/** Мягкая круглая «искра» для светящихся точек (рисуется один раз на canvas, не логотип и не фигура) */
export function glowTexture(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  if (g) {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    r.addColorStop(0, 'rgba(255,255,255,1)')
    r.addColorStop(0.3, 'rgba(255,255,255,.5)')
    r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r
    g.fillRect(0, 0, 64, 64)
  }
  return c
}
