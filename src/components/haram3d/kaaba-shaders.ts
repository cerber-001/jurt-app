/* Убранство Каабы: то, что рисуется на холсте и в шейдере, а не моделью. Перенесено со старой страницы haram3d
   (index.html, «Кааба: убранство»): жаккард кисвы, прожилки мрамора шазарвана, гранит Йеменского угла. Математика — та же. */
import { CanvasTexture, NoColorSpace, RepeatWrapping, type Material, type WebGLProgramParametersWithUniforms } from 'three'
import { JACQUARD, K_FONT } from './kaaba-texts'

type Ctx = CanvasRenderingContext2D
type Shader = WebGLProgramParametersWithUniforms

const font = (px: number) => `bold ${px}px ${K_FONT}`
/** Межстрочный интервал, в кеглях */
const LINE = 1.25

/** Наибольший кегль ≤ maxPx (шаг 2, не мельче minPx), при котором все строки влезают в maxW; шрифт остаётся выставленным */
function fitPx(x: Ctx, lines: readonly string[], maxW: number, maxPx: number, minPx = 10): number {
  let px = maxPx
  const wide = () => { x.font = font(px); return lines.some(s => x.measureText(s).width > maxW) }
  while (wide() && px > minPx) px -= 2
  return px
}

/** Уменьшать кегль по 2 px, пока строка не влезет в maxW (не мельче minPx) */
export function fitText(x: Ctx, s: string, maxW: number, px: number, minPx = 10): void {
  fitPx(x, [s], maxW, px, minPx)
}

/** Разрыв по пробелу, ближайшему к середине строки: [начало — верхний ярус, конец — нижний]; пробелов нет — null */
export function splitHalf(s: string): [string, string] | null {
  const mid = s.length / 2
  let best = -1
  for (let i = 0; i < s.length; i++) if (s[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i
  return best < 0 ? null : [s.slice(0, best), s.slice(best + 1)]
}

export interface TextLayout { lines: readonly string[]; px: number }

/** Надпись в рамку maxW × maxH: одной строкой; если кегль выходит мельче readPx (вблизи уже не читается) —
    двумя ярусами по пробелу ближе к середине, когда так крупнее */
export function layoutText(x: Ctx, s: string, maxW: number, maxH: number, maxPx: number, readPx: number): TextLayout {
  const one = fitPx(x, [s], maxW, Math.min(maxPx, Math.floor(maxH / LINE)))
  const two = one < readPx ? splitHalf(s) : null
  if (!two) return { lines: [s], px: one }
  const px2 = fitPx(x, two, maxW, Math.min(maxPx, Math.floor(maxH / (2 * LINE))))
  return px2 > one ? { lines: two, px: px2 } : { lines: [s], px: one }
}

/** Строки столбиком с центром в (cx, cy) */
export function drawLines(x: Ctx, t: TextLayout, cx: number, cy: number): void {
  x.font = font(t.px)
  t.lines.forEach((s, i) => x.fillText(s, cx, cy + (i - (t.lines.length - 1) / 2) * t.px * LINE))
}

/** Вставить строки GLSL сразу после #include <chunk> */
const after = (src: string, chunk: string, add: string) => src.replace(`#include <${chunk}>`, `#include <${chunk}>\n${add}`)

/** Свой шейдер у материала. Ключ кэша — обязательно: three.js иначе сличает текст функции и может отдать чужую программу */
function patch(m: Material, key: string, fn: (sh: Shader) => void): void {
  m.onBeforeCompile = fn
  m.customProgramCacheKey = () => 'kaaba-' + key
  m.needsUpdate = true
}

/* ───── Жаккард кисвы ───── */

/** По чёрному шёлку тем же чёрным, но иной фактурой вытканы зигзаги с надписями (видно только в косом свете).
    Холст 2 × 2 м бесшовно повторяется: 4 полосы по 0,5 м, в каждой зигзаг из 4 звеньев (≈ 30°), надпись — вдоль звена */
function drawJacquard(x: Ctx, N: number): void {
  x.fillStyle = '#000'; x.fillRect(0, 0, N, N); x.fillStyle = x.strokeStyle = '#fff'
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl'
  const R = 4, H = N / R, Z = 4, A = H * 0.55, s = N / Z
  for (let r = 0; r < R; r++) {
    const y0 = r * H + 18, yk = (k: number) => y0 + (k % 2 ? A : 0)
    x.lineWidth = 6
    for (const dy of [0, 14]) { x.beginPath(); for (let k = 0; k <= Z; k++) x.lineTo(k * s, yk(k) + dy); x.stroke() }   // двойная ломаная
    for (let k = 0; k < Z; k++) {
      const t = JACQUARD[(k + r * 3) % JACQUARD.length], ang = Math.atan2(yk(k + 1) - yk(k), s), len = Math.hypot(s, A)
      fitText(x, t, len * 0.82, 64, 18)
      x.save(); x.translate((k + 0.5) * s, (yk(k) + yk(k + 1)) / 2 + 14); x.rotate(ang); x.fillText(t, 0, 50); x.restore()
      x.beginPath(); x.arc(k * s, yk(k) + (k % 2 ? 44 : -26), 8, 0, Math.PI * 2); x.fill()   // точка у излома
    }
  }
}

export function jacquardTexture(): CanvasTexture {
  const N = 1024, c = document.createElement('canvas')
  c.width = c.height = N
  const x = c.getContext('2d')
  if (x) drawJacquard(x, N)
  const t = new CanvasTexture(c)
  t.colorSpace = NoColorSpace; t.wrapS = t.wrapT = RepeatWrapping; t.anisotropy = 8
  return t
}

const KISWA_FRAG = `
  vec3 kn = normalize(vKn); float kside = 1.0 - smoothstep(0.5, 0.8, abs(kn.y));   // узор только на стенах, не на крыше
  vec2 kp = vec2(dot(vKp.xz, normalize(vec2(kn.z, -kn.x) + 1e-5)), vKp.y);   // вдоль стены слева направо для смотрящего (иначе надписи зеркальны) и вверх, в метрах
  float kj = texture2D(kJac, kp / 2.0).r * kside;
  vec2 kw = kp * 700.0;   // переплетение нитей ≈ 1,4 мм
  float kwf = 1.0 - smoothstep(0.25, 0.9, length(fwidth(kw)));
  float kwv = (sin(kw.x * 6.2832) * sin(kw.y * 6.2832)) * 0.5 + 0.5;
  diffuseColor.rgb *= (1.0 + 0.8 * kj) * mix(1.0, mix(0.9, 1.1, kwv), kwf * kside);`

/** Жаккард на материал «kiswa» (UV у модели нет — узор кладётся по мировым координатам) */
export function patchKiswa(m: Material, jac: CanvasTexture): void {
  patch(m, 'kiswa', sh => {
    sh.uniforms.kJac = { value: jac }
    sh.vertexShader = after(after(sh.vertexShader, 'common', 'varying vec3 vKp; varying vec3 vKn;'),
      'begin_vertex', 'vKp = (modelMatrix * vec4(position, 1.0)).xyz; vKn = normalize(mat3(modelMatrix) * normal);')
    sh.fragmentShader = after(after(after(sh.fragmentShader, 'common', 'uniform sampler2D kJac; varying vec3 vKp; varying vec3 vKn;'),
      'color_fragment', KISWA_FRAG), 'roughnessmap_fragment', '  roughnessFactor = mix(roughnessFactor, 0.5, kj);')
  })
}

/* ───── Камень: мрамор шазарвана и гранит Йеменского угла ───── */

/** Хэш и сглаженный шум по 3D-точке (p — приставка имён, чтобы функции не путались) */
const noiseGlsl = (p: string) => `float ${p}h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float ${p}n(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(mix(${p}h(i), ${p}h(i + vec3(1,0,0)), f.x), mix(${p}h(i + vec3(0,1,0)), ${p}h(i + vec3(1,1,0)), f.x), f.y), mix(mix(${p}h(i + vec3(0,0,1)), ${p}h(i + vec3(1,0,1)), f.x), mix(${p}h(i + vec3(0,1,1)), ${p}h(i + vec3(1,1,1)), f.x), f.y), f.z); }`

/** Локальная позиция вершины в varying v (по ней — узор камня) */
function stone(sh: Shader, v: string, p: string, color: string): void {
  sh.vertexShader = after(after(sh.vertexShader, 'common', `varying vec3 ${v};`), 'begin_vertex', `${v} = position;`)
  sh.fragmentShader = after(after(sh.fragmentShader, 'common', `varying vec3 ${v};\n${noiseGlsl(p)}`), 'color_fragment', color)
}

const MARBLE_FRAG = `
  vec3 mq = vMp * 2.3; float mt = mn(mq) * 0.55 + mn(mq * 2.7) * 0.3 + mn(mq * 7.0) * 0.15;
  float mv = 1.0 - smoothstep(0.0, 0.035 + fwidth(mt) * 1.5, abs(sin((vMp.x * 0.8 - vMp.z * 1.3 + mt * 3.2) * 3.1416)));
  diffuseColor.rgb *= 1.0 - 0.2 * mv * (0.5 + 0.5 * mn(mq * 0.5 + 9.0));
  diffuseColor.rgb *= 0.97 + 0.05 * mn(vMp * 31.0);`

/** Белый мрамор с серыми прожилками (гаснут вдали — без ряби) */
export function patchMarble(m: Material): void {
  patch(m, 'shazarwan-marble', sh => stone(sh, 'vMp', 'm', MARBLE_FRAG))
}

const GRANITE_FRAG = `
  vec3 yq = vYp * 330.0; float yf = 1.0 - smoothstep(0.3, 1.0, length(fwidth(yq)));
  float yd = smoothstep(0.66, 0.8, yn(yq)), yl = smoothstep(0.7, 0.84, yn(yq * 0.71 + 17.0)) * (1.0 - yd);
  float ym = yn(vYp * 11.0) * 0.6 + yn(vYp * 37.0) * 0.4;   // мягкие пятна по камню — не «пиксели»
  diffuseColor.rgb *= mix(0.9, 1.08, ym) * mix(1.0, mix(1.0, 0.5, yd) * mix(1.0, 1.25, yl), yf);
  float ypol = (1.0 - smoothstep(0.22, 0.5, length(vYp.xz))) * smoothstep(0.8, 1.05, vYp.y) * (1.0 - smoothstep(1.8, 2.05, vYp.y));`

/** Гранит «соль с перцем»: зёрна ≈ 4 мм (гаснут вдали); у ребра на высоте руки — полировка от касаний */
export function patchGranite(m: Material): void {
  patch(m, 'yemeni-granite', sh => {
    stone(sh, 'vYp', 'y', GRANITE_FRAG)
    sh.fragmentShader = after(sh.fragmentShader, 'roughnessmap_fragment', '  roughnessFactor = mix(roughnessFactor, 0.15, ypol);')
  })
}
