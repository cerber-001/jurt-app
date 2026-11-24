/* Толпа: мягкий ореол нура вокруг головы каждого паломника — один draw call на всех (квадраты-экземпляры,
   всегда лицом к камере, свечение складывается со сценой). Место — по голове с учётом позы (в поклоне голова ниже),
   размер — по росту (дети меньше). С расстоянием ореол плавно меньше и тусклее — без скачков при смене уровня
   детализации, и Харам издалека не превращается в поле огоньков. depthWrite выключен — ореол не режет соседей. */
import {
  AdditiveBlending, Color, DynamicDrawUsage, Float32BufferAttribute, InstancedBufferGeometry, InstancedInterleavedBuffer,
  InterleavedBufferAttribute, Mesh, ShaderMaterial,
} from 'three'
import { fkAngles, pointOf, rotYZ, type Joints } from './gait'

/** Числа ореола в буфере: x, y, z, полуразмер (м), прозрачность */
export const HALO_STRIDE = 5
/** Тёплый цвет ореола (sRGB) */
export const HALO_HEX = 0xffe2a8
/** Прозрачность вблизи */
export const HALO_ALPHA = 0.42
/** Полуразмер ореола — во столько «размеров головы» */
export const HALO_HEADS = 1.8
/** С какого и до какого расстояния (м) ореол уменьшается и тускнеет; дальше FADE_FAR — гаснет совсем */
export const HALO_NEAR = 12, HALO_FAR = 90, HALO_FADE_FAR = 260
/** Вдали: доля размера и яркости от ближних */
const FAR_SIZE = 0.65, FAR_ALPHA = 0.25
/** Доля полуразмера, на которую квадрат выдвигается к камере — чтобы не резаться о плечи своего же человека */
const PUSH = 0.3

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

/** Размер и яркость ореола на расстоянии d (м) — непрерывно, без ступеней на границах уровней */
export function haloFade(d: number): { size: number; alpha: number } {
  const k = smooth(HALO_NEAR, HALO_FAR, d)
  return { size: 1 - (1 - FAR_SIZE) * k, alpha: HALO_ALPHA * (1 - (1 - FAR_ALPHA) * k) * (1 - smooth(HALO_FAR * 1.4, HALO_FADE_FAR, d)) }
}

/** Размер головы (м) по меркам фигуры: от шеи до лба × 1,32 — до макушки */
export const headSize = (J: Joints) => (J.FH[0] - J.N[0]) * 1.32

/** Центр головы в осях фигуры [y, z] при наклоне корпуса tilt: 60 % от шеи ко лбу и на 4,5 см назад, вместе со звеном */
export function headLocal(J: Joints, tilt: number): [number, number] {
  const T = fkAngles(tilt, 0), n = pointOf(J, T, 'N', 3), f = pointOf(J, T, 'FH', 3)
  const [by, bz] = rotYZ(T[3], 0, 0.045)
  return [n[0] + (f[0] - n[0]) * 0.6 + by, n[1] + (f[1] - n[1]) * 0.6 + bz]
}

/** Голова одной фигуры: центр в позе «прямо» и при других наклонах (с кэшем по сотым радиана) */
export class HeadOf {
  readonly size: number
  private readonly J: Joints
  private readonly cache = new Map<number, [number, number]>()
  constructor(J: Joints) { this.J = J; this.size = headSize(J) }
  at(tilt: number): [number, number] {
    const k = Math.round(tilt * 100)
    let v = this.cache.get(k)
    if (!v) { v = headLocal(this.J, k / 100); this.cache.set(k, v) }
    return v
  }
}

const VERT = `
attribute vec4 iH;
attribute float iA;
varying vec2 vUv;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(iH.xyz, 1.);
  float d = length(mv.xyz), k = (d - min(${PUSH.toFixed(2)} * iH.w, d * .5)) / max(d, 1e-4);
  mv.xyz *= k;   // ближе к камере, но тем же размером на экране
  mv.xy += position.xy * iH.w * k;
  vUv = position.xy; vA = iA;
  gl_Position = projectionMatrix * mv;
}
`
const FRAG = `
uniform vec3 uCol;
varying vec2 vUv;
varying float vA;
void main() {
  float r = length(vUv);
  if (r > 1.) discard;
  float f = r < .3 ? 1. - r / .3 * .5 : .5 * (1. - smoothstep(.3, 1., r));   // как искра старой страницы: 1 → 0,5 → 0
  gl_FragColor = vec4(uCol, f * vA);
  #include <colorspace_fragment>
}
`

/** Ореолы всех нарисованных в кадре людей: буфер на cap, рисуется ровно n — одним вызовом */
export class HaloBatch {
  readonly mesh: Mesh
  readonly arr: Float32Array
  readonly cap: number
  n = 0
  private readonly buf: InstancedInterleavedBuffer
  private readonly geo: InstancedBufferGeometry
  private readonly mat: ShaderMaterial

  constructor(cap: number) {
    this.cap = cap
    this.arr = new Float32Array(Math.max(1, cap) * HALO_STRIDE)
    this.buf = new InstancedInterleavedBuffer(this.arr, HALO_STRIDE, 1).setUsage(DynamicDrawUsage)
    const g = new InstancedBufferGeometry()
    g.setIndex([0, 1, 2, 0, 2, 3])
    g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
    g.setAttribute('iH', new InterleavedBufferAttribute(this.buf, 4, 0))
    g.setAttribute('iA', new InterleavedBufferAttribute(this.buf, 1, 4))
    g.instanceCount = 0
    this.geo = g
    this.mat = new ShaderMaterial({
      uniforms: { uCol: { value: new Color(HALO_HEX) } },   // в линейном пространстве (Color переводит из sRGB)
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, depthTest: true, blending: AdditiveBlending, toneMapped: false, fog: false,
    })
    this.mesh = new Mesh(g, this.mat)
    this.mesh.frustumCulled = false   // невидимых отсекает crowd.ts вместе с людьми
    this.mesh.renderOrder = 2
    this.mesh.name = 'crowd_halo'
  }

  begin(): void { this.n = 0 }

  /** Ореол человека из его 32 чисел (crowd.ts → stagePut): d[o..] — место, поворот, рост, подъём к полу; dist — до камеры */
  push(d: Float32Array, o: number, head: HeadOf, dist: number): void {
    if (this.n >= this.cap) return
    const sc = d[o + 7], rot = d[o + 3], lift = d[o + 11], [hy, hz] = head.at(d[o + 20])
    const f = haloFade(dist), z = hz * sc, a = this.arr, i = this.n++ * HALO_STRIDE
    a[i] = d[o] + Math.sin(rot) * z
    a[i + 1] = d[o + 1] + (hy + lift) * sc
    a[i + 2] = d[o + 2] + Math.cos(rot) * z
    a[i + 3] = head.size * HALO_HEADS * sc * f.size
    a[i + 4] = f.alpha
  }

  flush(): void {
    if (this.n) { this.buf.clearUpdateRanges(); this.buf.addUpdateRange(0, this.n * HALO_STRIDE); this.buf.needsUpdate = true }
    this.geo.instanceCount = this.n
  }

  dispose(): void {
    this.geo.dispose()
    this.mat.dispose()
    this.mesh.removeFromParent()
  }
}
