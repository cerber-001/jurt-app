/* Свет «нашей модели» по настоящему времени Мекки: солнце (днём) или прожекторы (ночью) с картой теней,
   небесный свет (полусфера), тёплая подсветка матафа ночью, небо-купол и окружение из него.
   Карта теней — статичная: перерисовывается только при загрузке, смене вида, изменении солнца и выреза Масъа
   (autoUpdate = false). Рамка теней следует за точкой взгляда: матаф ±70 м вблизи, весь Харам — шире. */
import {
  Color, DirectionalLight, HemisphereLight, MathUtils, PointLight, Vector3,
  type PerspectiveCamera, type Scene, type Texture, type WebGLRenderer,
} from 'three'
import { sunVector, type SceneLight, type SunPos } from '../../lib/sun'
import { createSky, type Sky } from './sky'

/** Половина стороны рамки теней (м) — ступенями, чтобы карта не перерисовывалась от каждого движения камеры.
    Наименьшая — матаф ±70 м, как на старой странице; наибольшая — весь Харам с ближними башнями */
export const SHADOW_HALF_STEPS: readonly number[] = [70, 110, 170, 260, 400]
/** Рамка ≈ 0,6 расстояния от камеры до точки взгляда */
const FRAME_K = 0.6
/** Свет стоит на этом расстоянии от центра рамки; дальняя плоскость — с запасом на часовую башню (≈ 600 м) */
const LIGHT_DIST = 900
const SHADOW_FAR = 1900
/** Карту теней перерисовываем не чаще (мс), пока человек крутит сцену */
const REFIT_MS = 300
/** Солнце сдвинулось больше чем на столько (косинус угла) — тени перерисовать */
const DIR_EPS = Math.cos(MathUtils.degToRad(0.4))
/** Окружение (PMREM) пересобираем, когда свет заметно изменился, и не чаще раза в секунду */
const ENV_MS = 1000
/** Плавный переход света (с): при «уменьшить движение» — сразу */
const EASE_SEC = 2.5
/** Подсветка матафа ночью, кандел: на полу у Каабы (38 м под источником, спад 1,3) ≈ 0,6 — вровень с прожекторами */
const GLOW_CD = 70

/** Рамка теней по расстоянию от камеры до точки взгляда: ближайшая ступень, покрывающая ≈ 0,6 расстояния */
export function shadowHalf(dist: number): number {
  const want = dist * FRAME_K
  return SHADOW_HALF_STEPS.find(s => s >= want) ?? SHADOW_HALF_STEPS[SHADOW_HALF_STEPS.length - 1]
}

/** Центр рамки — по сетке в четверть рамки (тени не перерисовываются от мелких сдвигов) */
export const snap = (v: number, half: number): number => Math.round(v / (half / 4)) * (half / 4)

export interface LightRigOpts {
  /** Сторона карты теней; 0 — без карты теней */
  shadowMap: number
  reducedMotion: boolean
}

export interface LightRig {
  readonly sky: Sky
  /** Текущий (сглаженный) свет */
  readonly current: SceneLight | null
  /** Новое положение солнца; instant — без перехода */
  setSun(pos: SunPos, light: SceneLight, instant: boolean): void
  /** Каждый кадр: плавный переход, купол вокруг камеры, рамка теней по точке взгляда (не во время перелёта) */
  update(dt: number, cam: PerspectiveCamera, target: Vector3, flying: boolean): void
  /** Что-то из отбрасывающих тень появилось, исчезло или сдвинулось — перерисовать карту теней */
  invalidateShadows(): void
  /** Подписка на изменения света (золото, пятна под людьми) */
  onChange(cb: (L: SceneLight) => void): () => void
  dispose(): void
}

/** Данные (x восток, y север, z вверх) → three.js */
const v3 = (d: readonly number[], out: Vector3) => out.set(d[0], d[2], -d[1])

const lerp = MathUtils.lerp
const C1 = new Color(), C2 = new Color()
const mixHexes = (a: number, b: number, k: number) => C1.setHex(a).lerp(C2.setHex(b), k).getHex()

/** Сглаженный свет: от текущего к цели с коэффициентом k (0 — остаётся, 1 — цель) */
function blend(a: SceneLight, b: SceneLight, k: number): SceneLight {
  const n = (x: number, y: number) => lerp(x, y, k), h = (x: number, y: number) => mixHexes(x, y, k)
  const dir = a.keyDir.map((v, i) => n(v, b.keyDir[i]))
  const l = Math.hypot(dir[0], dir[1], dir[2]) || 1
  return {
    night: n(a.night, b.night), keyDir: [dir[0] / l, dir[1] / l, dir[2] / l], keyColor: h(a.keyColor, b.keyColor),
    keyIntensity: n(a.keyIntensity, b.keyIntensity), hemiSky: h(a.hemiSky, b.hemiSky), hemiGround: h(a.hemiGround, b.hemiGround),
    hemiIntensity: n(a.hemiIntensity, b.hemiIntensity), floodGlow: n(a.floodGlow, b.floodGlow), envIntensity: n(a.envIntensity, b.envIntensity),
    exposure: n(a.exposure, b.exposure),
    sky: {
      zenith: h(a.sky.zenith, b.sky.zenith), horizon: h(a.sky.horizon, b.sky.horizon), ground: h(a.sky.ground, b.sky.ground),
      sunGlow: h(a.sky.sunGlow, b.sky.sunGlow), sunGlowK: n(a.sky.sunGlowK, b.sky.sunGlowK),
    },
    blob: n(a.blob, b.blob), bloomThreshold: n(a.bloomThreshold, b.bloomThreshold), bloomStrength: n(a.bloomStrength, b.bloomStrength),
    goldGlow: n(a.goldGlow, b.goldGlow),
  }
}

export function createLightRig(scene: Scene, renderer: WebGLRenderer, opt: LightRigOpts): LightRig {
  const hemi = new HemisphereLight(0xfff4e2, 0x2a3a3a, 1)
  const key = new DirectionalLight(0xfff1dc, 2.4)
  // тёплая подсветка матафа ночью: над Каабой, гаснет к краю мечети. Днём — 0 (свет не убираем: смена числа
  // источников пересобрала бы все шейдеры)
  const glow = new PointLight(0xffc27a, 0, 190, 1.3)
  glow.position.set(0, 38, 0)
  scene.add(hemi, key, key.target, glow)

  const shadows = opt.shadowMap > 0
  renderer.shadowMap.enabled = shadows
  if (shadows) {
    renderer.shadowMap.autoUpdate = false
    key.castShadow = true
    key.shadow.mapSize.set(opt.shadowMap, opt.shadowMap)
    key.shadow.camera.near = 1
    key.shadow.camera.far = SHADOW_FAR
    key.shadow.bias = -0.00025
    key.shadow.radius = 1   // у PCF радиус раздвигает выборки: больше 1 — «ступени» на краю тени
  }

  const sky = createSky(renderer)
  scene.add(sky.dome)
  let env: Texture | null = null

  const subs = new Set<(L: SceneLight) => void>()
  let cur: SceneLight | null = null, goal: SceneLight | null = null
  const sunDir = new Vector3(0, 1, 0), keyDir = new Vector3(0, 1, 0), lastKeyDir = new Vector3()
  const center = new Vector3(), frameCenter = new Vector3(Infinity, 0, 0)
  let half = SHADOW_HALF_STEPS[0], lastRefit = -Infinity, dirty = true
  let envLight: SceneLight | null = null, lastEnv = -Infinity

  /** Рамка теней: центр, размер, смещение по нормали ≈ 1,2 пикселя карты (против «acne»; больше — тени «отлипают») */
  const fitShadow = () => {
    const c = key.shadow.camera, texel = (2 * half) / opt.shadowMap
    c.left = -half; c.right = half; c.top = half; c.bottom = -half
    c.updateProjectionMatrix()
    key.shadow.normalBias = texel * 1.2
    key.target.position.copy(frameCenter)
    key.position.copy(frameCenter).addScaledVector(keyDir, LIGHT_DIST)
    key.target.updateMatrixWorld()
    key.updateMatrixWorld()
    renderer.shadowMap.needsUpdate = true
    dirty = false
  }

  const envChanged = (a: SceneLight, b: SceneLight) =>
    Math.abs(a.night - b.night) > 0.02 || Math.abs(a.sky.sunGlowK - b.sky.sunGlowK) > 0.02 || a.sky.zenith !== b.sky.zenith

  const apply = (L: SceneLight, now: number) => {
    hemi.color.setHex(L.hemiSky); hemi.groundColor.setHex(L.hemiGround); hemi.intensity = L.hemiIntensity
    key.color.setHex(L.keyColor); key.intensity = L.keyIntensity
    glow.intensity = GLOW_CD * L.floodGlow
    v3(L.keyDir, keyDir)
    if (shadows && keyDir.dot(lastKeyDir) < DIR_EPS) { lastKeyDir.copy(keyDir); dirty = true }
    if (!shadows) key.position.copy(keyDir).multiplyScalar(LIGHT_DIST)
    scene.environmentIntensity = L.envIntensity
    renderer.toneMappingExposure = L.exposure
    sky.set(L, sunDir)
    if (!env || (envLight && envChanged(envLight, L) && now - lastEnv > ENV_MS)) {
      const next = sky.bakeEnv()
      scene.environment = next
      env = next
      envLight = L; lastEnv = now
    }
    for (const cb of subs) cb(L)
  }

  return {
    sky,
    get current() { return cur },
    setSun(pos, light, instant) {
      v3(sunVector(pos), sunDir)
      goal = light
      if (instant || opt.reducedMotion || !cur) { cur = light; apply(cur, performance.now()) }
    },
    update(dt, cam, target, flying) {
      const now = performance.now()
      if (goal && cur && cur !== goal) {
        const k = 1 - Math.exp(-dt * (3 / EASE_SEC))
        cur = blend(cur, goal, k)
        if (Math.abs(cur.night - goal.night) < 0.002 && Math.abs(cur.keyIntensity - goal.keyIntensity) < 0.005) cur = goal
        apply(cur, now)
      }
      sky.dome.position.copy(cam.position)
      if (!shadows || flying) return
      const h = shadowHalf(cam.position.distanceTo(target))
      center.set(snap(target.x, h), 0, snap(target.z, h))
      const moved = h !== half || center.x !== frameCenter.x || center.z !== frameCenter.z
      if ((moved || dirty) && now - lastRefit > REFIT_MS) {
        half = h; frameCenter.copy(center); lastRefit = now
        fitShadow()
      }
    },
    invalidateShadows() { dirty = true; lastRefit = -Infinity },
    onChange(cb) {
      subs.add(cb)
      if (cur) cb(cur)
      return () => { subs.delete(cb) }
    },
    dispose() {
      subs.clear()
      key.shadow.map?.dispose()
      key.shadow.dispose()
      key.dispose(); hemi.dispose(); glow.dispose()
      scene.remove(hemi, key, key.target, glow)
      if (scene.environment === env) scene.environment = null
      sky.dispose()
      env = null
    },
  }
}
