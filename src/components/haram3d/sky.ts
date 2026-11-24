/* Небо «нашей модели»: процедурный купол (0 КБ, работает офлайн) и освещение-окружение из него через PMREM —
   вместо «комнатного» RoomEnvironment. Цвета задаёт свет по времени Мекки (lib/sun.ts → sceneLight):
   день — голубое небо и тёплое сияние у солнца, закат — оранжевый край, ночь — тёмно-синее небо с тёплым заревом города.
   Купол виден за моделью; его копия (с тёплым светом прожекторов сверху ночью — для отражений золота) даёт scene.environment. */
import {
  BackSide, Color, Mesh, PMREMGenerator, Scene, ShaderMaterial, SphereGeometry, Vector3,
  type Texture, type WebGLRenderer, type WebGLRenderTarget,
} from 'three'
import type { SceneLight } from '../../lib/sun'

const VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * .99999;   // всегда «у дальней плоскости»: перекрывается всем, что ближе
}
`

/** Градиент от горизонта к зениту, «земля» внизу, сияние вокруг солнца; для окружения — ещё и прожекторы сверху ночью */
const FRAG = `
uniform vec3 uZenith, uHorizon, uGround, uGlow, uSun, uFlood;
uniform float uGlowK, uNight, uEnv;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0., 1., max(h, 0.)), .55));
  // тёплое зарево города у горизонта ночью
  col += vec3(.16, .09, .03) * uNight * exp(-max(h, 0.) * 9.);
  col = mix(col, uGround, smoothstep(.0, -.06, h));
  float s = max(dot(d, uSun), 0.);
  col += uGlow * uGlowK * (pow(s, 8.) * .55 + pow(s, 64.) * 1.4);
  // окружение: прожекторы Харама сверху (только в копии для отражений; на видимом небе их нет)
  col += uFlood * uEnv * uNight * pow(max(h, 0.), 3.);
  gl_FragColor = vec4(col, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function skyMaterial(env: boolean): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uZenith: { value: new Color() }, uHorizon: { value: new Color() }, uGround: { value: new Color() },
      uGlow: { value: new Color() }, uSun: { value: new Vector3(0, 1, 0) }, uFlood: { value: new Color(0xffc98a).multiplyScalar(1.6) },
      uGlowK: { value: 0 }, uNight: { value: 0 }, uEnv: { value: env ? 1 : 0 },
    },
    vertexShader: VERT, fragmentShader: FRAG,
    side: BackSide, depthWrite: false, fog: false,
  })
}

function apply(m: ShaderMaterial, L: SceneLight, sunDir: Vector3): void {
  const u = m.uniforms
  ;(u.uZenith.value as Color).setHex(L.sky.zenith)
  ;(u.uHorizon.value as Color).setHex(L.sky.horizon)
  ;(u.uGround.value as Color).setHex(L.sky.ground)
  ;(u.uGlow.value as Color).setHex(L.sky.sunGlow)
  ;(u.uSun.value as Vector3).copy(sunDir)
  u.uGlowK.value = L.sky.sunGlowK
  u.uNight.value = L.night
}

export interface Sky {
  /** Купол неба для сцены (ставится вокруг камеры каждый кадр) */
  dome: Mesh
  /** Обновить цвета неба; sunDir — на настоящее солнце (three.js, единичный) */
  set(L: SceneLight, sunDir: Vector3): void
  /** Пересобрать освещение-окружение из текущего неба (PMREM, ≈ 1 проход куба 128 px) — вызывать редко */
  bakeEnv(): Texture
  dispose(): void
}

/** Радиус видимого купола: дальше любых зданий города, ближе дальней плоскости камеры (9 км) */
const DOME_R = 4000
/** Сторона граней куба окружения: небо плавное, 128 px хватает и для отражений золота */
const ENV_SIZE = 128

export function createSky(renderer: WebGLRenderer): Sky {
  const geo = new SphereGeometry(1, 32, 16)
  const domeMat = skyMaterial(false), envMat = skyMaterial(true)
  const dome = new Mesh(geo, domeMat)
  dome.scale.setScalar(DOME_R)
  dome.frustumCulled = false
  // после всех непрозрачных: там, где небо закрыто зданиями, тест глубины отбрасывает его пиксели — небо почти бесплатно
  dome.renderOrder = 10
  dome.name = 'sky'
  const envScene = new Scene()
  const envDome = new Mesh(geo, envMat)
  envDome.scale.setScalar(50)
  envScene.add(envDome)
  const pmrem = new PMREMGenerator(renderer)
  let rt: WebGLRenderTarget | null = null

  return {
    dome,
    set(L, sunDir) { apply(domeMat, L, sunDir); apply(envMat, L, sunDir) },
    bakeEnv() {
      const next = pmrem.fromScene(envScene, 0, 0.1, 100, { size: ENV_SIZE })
      rt?.dispose()
      rt = next
      return next.texture
    },
    dispose() {
      rt?.dispose(); rt = null
      pmrem.dispose()
      geo.dispose(); domeMat.dispose(); envMat.dispose()
      dome.removeFromParent()
    },
  }
}
