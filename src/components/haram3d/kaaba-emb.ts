/* Шитьё кисвы: холст → материал (золото по чёрному + маска металла) и накладка на стену Каабы.
   Общие для хизама, ламп, рамок, самадий (kaaba-decor.ts) и ситары (kaaba-sitara.ts). */
import {
  CanvasTexture, Mesh, MeshStandardMaterial, NoColorSpace, PlaneGeometry, SRGBColorSpace, type MeshStandardMaterialParameters, type Vector2,
} from 'three'
import { toV3 } from './engine'
import { fitText } from './kaaba-shaders'

export type Ctx = CanvasRenderingContext2D
/** bg — цвет фона этого прохода (цвет или маска): им закрашивают место под надписью поверх линий */
export type Draw = (x: Ctx, w: number, h: number, bg: string) => void
export type Wall = readonly [Vector2, Vector2]

/** Маска металла — вдвое меньше по стороне (в 4 раза меньше памяти): металл и блеск не требуют чёткости букв */
const MASK_SCALE = 0.5
/** Буква, читаемая вблизи: ≈ 40 px на куске хизама шириной 1024 px (холст отчёта, П1) — это ≈ 11 см на стене */
const READ_M = 0.11

/** Кегль (px холста), мельче которого надпись переносится на два яруса: холст шириной wPx на wM метров стены */
export const readPx = (wPx: number, wM: number): number => Math.round(READ_M * wPx / wM)

/** Высота холста под панель wM × hM при ширине wPx — без растяжения букв */
export const canvasH = (wPx: number, wM: number, hM: number): number => Math.round(wPx * hM / wM)

const BG = { map: '#0b0c0d', mask: '#00ff00' }

/** Один холст рисуется дважды — цвет (золото по чёрному) и маска (синий канал = металл, зелёный = шероховатость) */
function embCanvas(w: number, h: number, mask: boolean, draw: Draw): CanvasTexture {
  const k = mask ? MASK_SCALE : 1
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k))
  const x = c.getContext('2d')
  if (x) {
    x.scale(k, k)
    const bg = mask ? BG.mask : BG.map
    x.fillStyle = bg; x.fillRect(0, 0, w, h)
    if (mask) x.fillStyle = x.strokeStyle = '#004dff'
    else {
      const gr = x.createLinearGradient(0, 0, w, h)
      gr.addColorStop(0, '#f6d98a'); gr.addColorStop(0.5, '#c89a2f'); gr.addColorStop(1, '#f3d27a')
      x.fillStyle = x.strokeStyle = gr
    }
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl'; x.lineCap = x.lineJoin = 'round'
    draw(x, w, h, bg)
  }
  const t = new CanvasTexture(c)
  t.colorSpace = mask ? NoColorSpace : SRGBColorSpace; t.anisotropy = 8
  return t
}

export function embMat(w: number, h: number, draw: Draw, extra: MeshStandardMaterialParameters = {}): MeshStandardMaterial {
  const mask = embCanvas(w, h, true, draw)
  return new MeshStandardMaterial({
    map: embCanvas(w, h, false, draw), metalnessMap: mask, roughnessMap: mask, metalness: 1, roughness: 1, envMapIntensity: 1.3,
    polygonOffset: true, polygonOffsetFactor: -1, ...extra,
  })
}

/** Плоскость с UV на стене a→b между долями t0..t1 (0 — a, 1 — b), высоты z0..z1, вынос off наружу */
export function wallPanel([a, b]: Wall, t0: number, t1: number, z0: number, z1: number, off: number, mat: MeshStandardMaterial): Mesh {
  const l = a.distanceTo(b), nx = (b.y - a.y) / l, ny = -(b.x - a.x) / l, p = a.clone().lerp(b, (t0 + t1) / 2)
  const m = new Mesh(new PlaneGeometry(l * (t1 - t0), z1 - z0), mat)
  m.position.copy(toV3(p.x + nx * off, p.y + ny * off, (z0 + z1) / 2))
  m.lookAt(m.position.clone().add(toV3(nx, ny, 0)))
  return m
}

/** Строки в круге (cx, cy) радиуса rIn: шаг step по высоте, каждая — по своей хорде с полем margin, кегль до maxPx */
export function circleText(x: Ctx, lines: readonly string[], cx: number, cy: number, rIn: number, step: number, maxPx: number, margin: number): void {
  lines.forEach((s, i) => {
    const y = cy + (i - (lines.length - 1) / 2) * step, chord = 2 * Math.sqrt(Math.max(0, rIn * rIn - (y - cy) * (y - cy)))
    fitText(x, s, chord - margin, maxPx); x.fillText(s, cx, y)
  })
}

/** Ромб с центром (cx, cy): полуширина rw, полувысота rh */
export function diamond(x: Ctx, cx: number, cy: number, rw: number, rh: number): void {
  x.beginPath(); x.moveTo(cx, cy - rh); x.lineTo(cx + rw, cy); x.lineTo(cx, cy + rh); x.lineTo(cx - rw, cy); x.closePath(); x.fill()
}
