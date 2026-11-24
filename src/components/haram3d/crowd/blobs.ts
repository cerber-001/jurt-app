/* Толпа: мягкие «контактные» тени под ногами — вместо карты теней от тысяч людей (её пришлось бы перерисовывать
   каждый кадр). Один draw call на всех: квадраты-экземпляры на полу, тёмное пятно с мягким радиальным спадом.
   Пятно идёт за человеком, у ребёнка меньше (по росту), в наклоне (поклон, быстрый шаг сая) — длиннее вперёд и шире;
   чуть смещено от солнца (днём — тень «падает» в сторону от него). Нур и ореол не затрагиваются. */
import {
  DynamicDrawUsage, Float32BufferAttribute, InstancedBufferGeometry, InstancedInterleavedBuffer,
  InterleavedBufferAttribute, Mesh, ShaderMaterial, Vector2,
} from 'three'

/** Числа пятна в буфере: x, y (пол), z, радиус · поворот, вытянутость, сдвиг вперёд, прозрачность */
export const BLOB_STRIDE = 8
/** Радиус пятна взрослого (м) при росте 1 */
export const BLOB_R = 0.4
/** На сколько поднять над полом, чтобы не мерцало с мрамором */
const LIFT = 0.012
/** С какого расстояния (м) пятна гаснут — вдали их не видно, а пиксели стоят */
export const BLOB_FADE_NEAR = 60, BLOB_FADE_FAR = 170
/** Наклон корпуса, при котором человек в полном поклоне (как aR в шейдере фигур) */
const BOW_TILT = 1.35

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/** Форма пятна по росту sc и наклону tilt: радиус, вытянутость вперёд, сдвиг центра вперёд (м) */
export function blobShape(sc: number, tilt: number): { r: number; stretch: number; fwd: number } {
  const bend = Math.min(1.5, Math.abs(tilt) / BOW_TILT)
  return { r: BLOB_R * sc * (1 + 0.25 * bend), stretch: 1 + 0.9 * bend, fwd: 0.3 * bend * sc }
}

/** Прозрачность по расстоянию до камеры (1 вблизи → 0 дальше BLOB_FADE_FAR) */
export const blobFade = (d: number): number => 1 - smooth(BLOB_FADE_NEAR, BLOB_FADE_FAR, d)

/** Сдвиг пятна от солнца (м на рост 1) по направлению главного света (данные: x восток, y север, z вверх):
    высокое солнце — почти под ногами, низкое — до 0,35 м в сторону от него; ночью (свет сверху) — почти 0 */
export function blobShift(dir: readonly number[]): [number, number] {
  const h = Math.hypot(dir[0], dir[1])
  if (h < 1e-4) return [0, 0]
  const k = Math.min(0.35, (0.12 * h) / Math.max(dir[2], 0.05))
  return [(-dir[0] / h) * k, (dir[1] / h) * k]   // в three.js: x = восток, z = −север
}

const VERT = `
attribute vec4 iB;   // x, пол, z, радиус
attribute vec4 iE;   // поворот, вытянутость, сдвиг вперёд, прозрачность
uniform vec2 uShift;
varying vec2 vUv;
varying float vA;
void main() {
  float c = cos(iE.x), s = sin(iE.x);
  vec2 q = vec2(position.x, position.y * iE.y - iE.z / max(iB.w, 1e-3));   // −z — вперёд (как у фигур)
  vec2 xz = vec2(c * q.x + s * q.y, -s * q.x + c * q.y) * iB.w;
  vec3 w = vec3(iB.x + xz.x + uShift.x * iB.w, iB.y, iB.z + xz.y + uShift.y * iB.w);
  vUv = position.xy; vA = iE.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.);
}
`
const FRAG = `
uniform float uStrength;
varying vec2 vUv;
varying float vA;
void main() {
  float r = length(vUv);
  if (r > 1.) discard;
  float f = 1. - smoothstep(.1, 1., r);
  gl_FragColor = vec4(0., 0., 0., f * f * vA * uStrength);
}
`

/** Пятна всех нарисованных в кадре людей: буфер на cap, рисуется ровно n — одним вызовом */
export class BlobBatch {
  readonly mesh: Mesh
  readonly cap: number
  n = 0
  private readonly arr: Float32Array
  private readonly buf: InstancedInterleavedBuffer
  private readonly geo: InstancedBufferGeometry
  private readonly mat: ShaderMaterial

  constructor(cap: number) {
    this.cap = cap
    this.arr = new Float32Array(Math.max(1, cap) * BLOB_STRIDE)
    this.buf = new InstancedInterleavedBuffer(this.arr, BLOB_STRIDE, 1).setUsage(DynamicDrawUsage)
    const g = new InstancedBufferGeometry()
    g.setIndex([0, 1, 2, 0, 2, 3])
    g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
    g.setAttribute('iB', new InterleavedBufferAttribute(this.buf, 4, 0))
    g.setAttribute('iE', new InterleavedBufferAttribute(this.buf, 4, 4))
    g.instanceCount = 0
    this.geo = g
    this.mat = new ShaderMaterial({
      uniforms: { uStrength: { value: 0.5 }, uShift: { value: new Vector2() } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: true, toneMapped: false, fog: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    })
    this.mesh = new Mesh(g, this.mat)
    this.mesh.frustumCulled = false   // невидимых отсекает crowd.ts вместе с людьми
    this.mesh.renderOrder = 1         // после пола и людей, до ореолов
    this.mesh.name = 'crowd_blobs'
  }

  /** Свет изменился: сила пятен и сдвиг от солнца */
  setLight(strength: number, shift: readonly [number, number]): void {
    this.mat.uniforms.uStrength.value = strength
    ;(this.mat.uniforms.uShift.value as Vector2).set(shift[0] / BLOB_R, shift[1] / BLOB_R)   // в шейдере — в долях радиуса
  }

  begin(): void { this.n = 0 }

  /** Пятно человека из его 32 чисел (crowd.ts → stagePut): место, поворот, рост, наклон; dist — до камеры */
  push(d: Float32Array, o: number, dist: number): void {
    if (this.n >= this.cap) return
    const a = blobFade(dist)
    if (a < 0.01) return
    const sh = blobShape(d[o + 7], d[o + 20]), i = this.n++ * BLOB_STRIDE, b = this.arr
    b[i] = d[o]; b[i + 1] = d[o + 1] + LIFT; b[i + 2] = d[o + 2]; b[i + 3] = sh.r
    b[i + 4] = d[o + 3]; b[i + 5] = sh.stretch; b[i + 6] = sh.fwd; b[i + 7] = a
  }

  flush(): void {
    if (this.n) { this.buf.clearUpdateRanges(); this.buf.addUpdateRange(0, this.n * BLOB_STRIDE); this.buf.needsUpdate = true }
    this.geo.instanceCount = this.n
  }

  dispose(): void {
    this.geo.dispose()
    this.mat.dispose()
    this.mesh.removeFromParent()
  }
}
