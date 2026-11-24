/* Ситара — занавес двери Каабы: шитьё на лицевой грани объёма «sitara» из haram.glb (u — от камня, v — вверх, как в Blender).
   Тексты — kaaba-texts.ts (сверка 23.11.2026, отчёт П4). Как куски стоят по высоте относительно двери — допущение отчёта (п. 3.3):
   над дверью — пояса кусков 1–2, на уровне створок — круги и пояса кусков 3–4. Плиту-посвящение (кусок 5, имя короля) не рисуем:
   формулировка при нынешнем короле не подтверждена — на её месте орнамент без текста. */
import type { Mesh, MeshStandardMaterial, Object3D } from 'three'
import { circleText, diamond, embMat, readPx, type Ctx } from './kaaba-emb'
import { drawLines, fitText, layoutText } from './kaaba-shaders'
import { IKHLAS, SITARA_BANDS, SITARA_FATH, SITARA_MEDALLIONS, SITARA_TAWHID, SITARA_ZUMAR } from './kaaba-texts'
import type { KaabaMeta } from './kaaba-decor'

const SW = 700

/** Контур двери на холсте ситары: по тем же числам, что и модель (kaaba.door), поэтому рамка шитья совпадает с дверью */
interface DoorBox { u0: number; u1: number; v0: number; v1: number }

/** Пояс с рамкой; bg закрывает линии под ним (пояс поверх створок) */
function band(x: Ctx, x0: number, x1: number, y0: number, y1: number, lines: readonly string[], read: number, bg?: string): void {
  if (bg) { const f = x.fillStyle; x.fillStyle = bg; x.fillRect(x0, y0, x1 - x0, y1 - y0); x.fillStyle = f }
  x.lineWidth = 3; x.strokeRect(x0, y0, x1 - x0, y1 - y0)
  const maxW = x1 - x0 - 50, cy = (y0 + y1) / 2 + 3
  if (lines.length === 1) { drawLines(x, layoutText(x, lines[0], maxW, y1 - y0 - 12, (y1 - y0) * 0.62, read), (x0 + x1) / 2, cy); return }
  const step = (y1 - y0 - 12) / lines.length
  lines.forEach((s, i) => { fitText(x, s, maxW, step * 0.8); x.fillText(s, (x0 + x1) / 2, y0 + 6 + step * (i + 0.5) + 3) })
}

/** Над дверью — четыре пояса надписей (куски 1–2) */
function upperBands(x: Ctx, w: number, d: DoorBox, read: number): void {
  const top = 56, step = (d.v0 - 40 - top) / 4
  SITARA_BANDS.forEach((s, i) => band(x, 52, w - 52, top + i * step, top + (i + 1) * step - 10, [s], read))
}

/** Рамка двери и створки */
function doorFrame(x: Ctx, d: DoorBox): void {
  x.lineWidth = 10; x.strokeRect(d.u0 - 14, d.v0 - 14, d.u1 - d.u0 + 28, d.v1 - d.v0 + 14)
  x.lineWidth = 3; x.strokeRect(d.u0 + 8, d.v0 + 8, d.u1 - d.u0 - 16, d.v1 - d.v0 - 16)
  x.beginPath(); x.moveTo((d.u0 + d.u1) / 2, d.v0 + 8); x.lineTo((d.u0 + d.u1) / 2, d.v1 - 8); x.stroke()
}

/** Кусок 3: два круга на створках — справа (для смотрящего) сура 112, слева 48:29 (часть) */
function doorCircles(x: Ctx, d: DoorBox): void {
  const cy = d.v0 + (d.v1 - d.v0) * 0.3, r = Math.min(74, (d.u1 - d.u0) / 4 - 10)
  for (const [cx, lines] of [[(d.u0 + d.u1 * 3) / 4, IKHLAS], [(d.u0 * 3 + d.u1) / 4, SITARA_FATH]] as const) {
    x.lineWidth = 5; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke()
    x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, r - 8, 0, Math.PI * 2); x.stroke()
    circleText(x, lines, cx, cy, r - 12, (r - 12) * 1.7 / lines.length, 24, 8)
  }
}

/** По бокам двери — по три медальона «الله ربي» / «الله حسبي» */
function medallions(x: Ctx, w: number, d: DoorBox): void {
  for (const cx of [d.u0 / 2 + 10, (w + d.u1) / 2 - 10])
    for (let k = 0; k < 3; k++) {
      const cy = d.v0 + 60 + k * (d.v1 - d.v0 - 120) / 2, s = SITARA_MEDALLIONS[k % 2]
      x.lineWidth = 6; x.beginPath(); x.arc(cx, cy, 52, 0, Math.PI * 2); x.stroke(); fitText(x, s, 84, 32); x.fillText(s, cx, cy + 2)
    }
}

/** Кусок 5: на месте плиты-посвящения — ряд ромбов без текста (между низом двери и рамкой полотна) */
function ornament(x: Ctx, w: number, y0: number, y1: number): void {
  const cy = (y0 + y1) / 2, rh = Math.max(3, (y1 - y0) / 2 - 2)
  for (let cx = 70; cx <= w - 70; cx += rh * 3) diamond(x, cx, cy, rh, rh)
}

function sitaraMat(k: KaabaMeta): MeshStandardMaterial {
  const [st0, st1, sz0, sz1] = k.sitara, [dt0, dt1, dz0, dz1] = k.door
  const SH = Math.round(SW * (sz1 - sz0) / (st1 - st0)), read = readPx(SW, st1 - st0)
  const d: DoorBox = {
    u0: (dt0 - st0) / (st1 - st0) * SW, u1: (dt1 - st0) / (st1 - st0) * SW,
    v0: (1 - (dz1 - sz0) / (sz1 - sz0)) * SH, v1: (1 - (dz0 - sz0) / (sz1 - sz0)) * SH,   // верх и низ двери на холсте
  }
  const mat = embMat(SW, SH, (x, w, h, bg) => {
    x.lineWidth = 12; x.strokeRect(14, 14, w - 28, h - 28); x.lineWidth = 3; x.strokeRect(34, 34, w - 68, h - 68)
    upperBands(x, w, d, read)
    doorFrame(x, d)
    doorCircles(x, d)
    medallions(x, w, d)
    const dh = d.v1 - d.v0
    // кусок 3 — 39:53 в две строки ниже середины двери, во всю ширину (между средними и нижними медальонами)
    band(x, 52, w - 52, d.v0 + dh * 0.6, d.v0 + dh * 0.8, SITARA_ZUMAR, read, bg)
    // кусок 4 — у низа двери, в её ширину (по бокам — нижние медальоны)
    band(x, d.u0 + 8, d.u1 - 8, d.v0 + dh * 0.84, d.v1 - 10, [SITARA_TAWHID], read, bg)
    ornament(x, w, d.v1 + 2, h - 36)
  }, { polygonOffset: false })
  for (const t of [mat.map, mat.metalnessMap]) if (t) t.flipY = false   // UV из glTF: v = 0 — верх холста
  return mat
}

/** Материал «sitara» из haram.glb — только у этого объекта: заменяем шитьём, старый освобождаем */
export function dressSitara(haram: Object3D, k: KaabaMeta): void {
  const o = haram.getObjectByName('sitara') as Mesh | undefined
  if (!o?.isMesh) return
  const old = o.material
  o.material = sitaraMat(k)
  for (const m of ([] as { dispose(): void }[]).concat(old)) m.dispose()
}
