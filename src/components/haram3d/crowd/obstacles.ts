/* Толпа: препятствия для решателя столкновений (сняты со старой страницы haram3d, там — лучами по самой модели).
   Таваф: Кааба (+0,15 м — шазарван у основания), стена Хиджра (Хатым) — кольцо 4,4…5,97 м от центра дуги по углам
   0,251…3,961 рад, тумба Макама — круг 0,65 м. Сай: коридоры между перилами (1,6 м от оси) и колоннами (9,1 м). */
import type { P2 } from '../../../lib/haram3d'
import { HIJR_C, saiFrac, type SaiAxis } from './lanes'
import type { PushOut, Solver } from './solve'

const HJ_IN = 4.4, HJ_OUT = 5.97, HJ_A0 = 0.251, HJ_A1 = 3.961, MQ_R = 0.65, SHAZ = 0.15
const TAU = Math.PI * 2

/** Стороны выпуклого четырёхугольника Каабы с внешними нормалями: [ax, ay, nx, ny] */
export function kaabaEdges(corners: readonly P2[]): number[][] {
  const cx = corners.reduce((s, p) => s + p[0], 0) / corners.length, cy = corners.reduce((s, p) => s + p[1], 0) / corners.length
  // обход по углу вокруг центра — порядок углов в meta не важен
  const ring = [...corners].sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx))
  return ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length], l = Math.hypot(b[0] - a[0], b[1] - a[1])
    let nx = (b[1] - a[1]) / l, ny = -(b[0] - a[0]) / l
    if ((a[0] - cx) * nx + (a[1] - cy) * ny < 0) { nx = -nx; ny = -ny }
    return [a[0], a[1], nx, ny]
  })
}

/** Наружу из Каабы: самая «внешняя» сторона ближе r + шазарван — сдвиг по её нормали */
function pushKaaba(s: Solver, a: number, edges: readonly number[][]): void {
  let best = -1e9, bi = 0
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i], d = (s.x[a] - e[0]) * e[2] + (s.y[a] - e[1]) * e[3]
    if (d > best) { best = d; bi = i }
  }
  const m = s.r[a] + SHAZ - best
  if (m > 0) s.move(a, edges[bi][2] * m, edges[bi][3] * m)
}

/** Из стены Хатыма — к ближней грани: внутрь Хиджра, наружу или за торец */
function pushHatim(s: Solver, a: number): void {
  const r = s.r[a], dx = s.x[a] - HIJR_C[0], dy = s.y[a] - HIJR_C[1], R = Math.hypot(dx, dy)
  if (!(R > HJ_IN - r && R < HJ_OUT + r && R > 1)) return
  let f = Math.atan2(dy, dx)
  if (f < 0) f += TAU
  const m = r / R, ux = dx / R, uy = dy / R
  if (!(f > HJ_A0 - m && f < HJ_A1 + m)) return
  const pIn = R - (HJ_IN - r), pOut = HJ_OUT + r - R, e0 = (f - HJ_A0 + m) * R, e1 = (HJ_A1 + m - f) * R
  const pm = Math.min(pIn, pOut, e0, e1)
  if (pm === pIn) s.move(a, -ux * pIn, -uy * pIn)
  else if (pm === pOut) s.move(a, ux * pOut, uy * pOut)
  else if (pm === e0) s.move(a, uy * e0, -ux * e0)
  else s.move(a, -uy * e1, ux * e1)
}

/** Из круга (тумба Макама) */
function pushCircle(s: Solver, a: number, c: P2, R: number): void {
  const dx = s.x[a] - c[0], dy = s.y[a] - c[1], d = Math.hypot(dx, dy), rr = R + s.r[a]
  if (d >= rr) return
  if (d > 1e-6) s.move(a, (dx / d) * (rr - d), (dy / d) * (rr - d)); else s.move(a, rr, 0)
}

/** Таваф: проверяем только тех, кто рядом с Каабой и Макамом (дальше препятствий нет) */
export function tawafPushOut(corners: readonly P2[], maqam: P2): PushOut {
  const edges = kaabaEdges(corners)
  return (s, a) => {
    const x = s.x[a], y = s.y[a]
    if (x > -15 && x < 11 && y > -13 && y < 17) { pushKaaba(s, a, edges); pushHatim(s, a) }
    if (Math.abs(x - maqam[0]) < 1.6 && Math.abs(y - maqam[1]) < 1.6) pushCircle(s, a, maqam, MQ_R)
  }
}

/** Перила между коридорами — 1,6 м от оси, колонны — 9,1 м; у холмов (12 м) перил нет — там разворачиваются */
export const SAI_RAIL = 1.6
export const SAI_WALL = 9.1
const SAI_END = 12

/** Сай: остаться в своём коридоре (по ту сторону перил, где идёт) и не уйти в колонны */
export function saiPushOut(ax: SaiAxis): PushOut {
  const qEnd = SAI_END / ax.len
  return (s, a) => {
    const x = s.x[a], y = s.y[a], r = s.r[a]
    const lat = (x - ax.safa[0]) * ax.sx + (y - ax.safa[1]) * ax.sy, f = saiFrac(ax, x, y)
    const side = Math.sign(lat || 1), al = Math.abs(lat)
    const lo = f > qEnd && f < 1 - qEnd ? SAI_RAIL + r : 0, hi = SAI_WALL - r
    const t = al < lo ? lo : al > hi ? hi : al
    if (t !== al) s.move(a, ax.sx * side * (t - al), ax.sy * side * (t - al))
  }
}
