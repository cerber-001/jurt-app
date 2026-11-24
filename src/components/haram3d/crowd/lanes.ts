/* Толпа: дорожки тавафа и сая, кто где идёт — чистая логика без three.js (проверяют юнит-тесты).
   Координаты данных: метры от центра Каабы, x — восток, y — север (как haram_meta.json).
   Перенесено со старой страницы haram3d (v3.14: кольца от оболочки «Кааба + Хиджр», дети за руку,
   жест у линии Чёрного камня, касание Йеменского угла; сай — Сафа ↔ Марва, зелёные огни).
   В горячем цикле кадра функции пишут в переданный out — без новых объектов на каждого человека. */
import type { P2 } from '../../../lib/haram3d'

/** Замкнутая или открытая ломаная с накопленной длиной */
export interface Ring {
  /** Отступ от оболочки (таваф) или от оси пути (сай), м */
  d: number
  xs: Float64Array
  ys: Float64Array
  cum: Float64Array
  len: number
  /** Дорожка вплотную к стене Каабы (за шазарваном) */
  wall: boolean
}

/** Точка на дорожке и направление хода (tx, ty — не нормированы) */
export interface Pt { x: number; y: number; tx: number; ty: number }

/** Генератор случайных Парка — Миллера: одна и та же толпа при каждом открытии */
export function rng(seed: number): () => number {
  let s = seed % 2147483647 || 1
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

/** Замкнуть ломаную: накопленная длина по всем точкам и обратно к первой */
export function closedRing(pts: readonly P2[], d: number, wall = false): Ring {
  const n = pts.length, xs = new Float64Array(n + 1), ys = new Float64Array(n + 1), cum = new Float64Array(n + 1)
  for (let i = 0; i <= n; i++) {
    xs[i] = pts[i % n][0]; ys[i] = pts[i % n][1]
    if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1])
  }
  return { d, xs, ys, cum, len: cum[n], wall }
}

/** Точка на s метрах пути (по кругу) */
export function along(r: Ring, s: number, out: Pt): Pt {
  const L = r.len
  s = ((s % L) + L) % L
  let lo = 0, hi = r.cum.length - 1
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (r.cum[m] <= s) lo = m; else hi = m }
  const ax = r.xs[lo], ay = r.ys[lo], bx = r.xs[hi], by = r.ys[hi]
  const k = (s - r.cum[lo]) / (r.cum[hi] - r.cum[lo] || 1)
  out.x = ax + (bx - ax) * k; out.y = ay + (by - ay) * k
  out.tx = bx - ax; out.ty = by - ay
  return out
}

/* ───── Таваф ───── */

/** Центр дуги Хиджра и её радиус для оболочки (по модели; как на старой странице) */
export const HIJR_C: P2 = [-6.665, 8.763]
const HIJR_R = 5.7

/** Оболочка «Кааба + Хиджр» без Макама: 4 угла Каабы и 64 точки дуги */
export function hullPoints(corners: readonly P2[]): P2[] {
  const arc: P2[] = Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI
    return [HIJR_C[0] + HIJR_R * Math.cos(a), HIJR_C[1] + HIJR_R * Math.sin(a)] as P2
  })
  return [...corners, ...arc]
}

/** Кольцо в d м от выпуклой оболочки (опорная функция). Угол растёт — точки идут против часовой стрелки */
export function hullRing(hull: readonly P2[], d: number, n = 240): Ring {
  const pts: P2[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a)
    let best = -Infinity, bp = hull[0]
    for (const q of hull) { const h = q[0] * c + q[1] * s; if (h > best) { best = h; bp = q } }
    pts.push([bp[0] + c * d, bp[1] + s * d])
  }
  return closedRing(pts, d, d < 1)
}

/** Отступы дорожек: вплотную к стене (0,65 м — за шазарваном) и все кольца из Blender */
export const tawafDistances = (laneD: readonly number[]): number[] => [0.65, ...laneD]

export interface Look {
  woman: boolean
  /** Цвет одежды (ихрам, абая, платье), кожи, волос или хиджаба — hex */
  cloth: number
  skin: number
  hair: number
  /** Волосы: 0 — бритая голова, иначе длина; у женщин — хиджаб (1) */
  hairLen: number
  beard: boolean
  /** Рост относительно взрослого (ребёнок ~0,7) */
  sc: number
}

export interface Walker {
  ring: Ring
  /** Пройденный путь по дорожке, м */
  q: number
  /** Сдвиг поперёк дорожки, м (+ — вправо, наружу) */
  off: number
  /** Своя скорость (доля общей) */
  v: number
  /** Фаза шага */
  ph: number
  look: Look
  /** Ребёнок за левую руку — или null */
  kid: Look | null
}

const SKIN = [0xe0b48f, 0xc99872, 0xb07a52, 0x8c5a3a, 0x6b4128, 0xd8a982]
const ABAYA = [0x1d1d22, 0x1d1d22, 0x16161b, 0x2a2622, 0x3a3a40, 0x55565c, 0x6f7377]
const HIJAB = [0x1d1d22, 0x1d1d22, 0x2b2b31, 0x4b4b52, 0x1f2a3a, 0x3a2e28, 0x6f7377]
const HAIR = [0x141414, 0x141414, 0x2b1d14, 0x3d2b1f, 0x5a5a5a, 0x8a8a8a]
const KID_C = [0x1d1d22, 0x2b2b31, 0x4b3a5a, 0x1f3a5a, 0x6b4a3a, 0xe8e2d6, 0x8a2f45]
/** Белый ихрам: чуть разный тон у каждого */
const ihram = (r: () => number) => {
  const k = 1 - r() * 0.06
  return (Math.round(0xf3 * k) << 16) | (Math.round(0xf0 * k) << 8) | Math.round(0xea * k)
}
const pick = (a: readonly number[], r: () => number) => a[Math.floor(r() * a.length)]

/** Взрослый: около трети — женщины в абае и хиджабе; мужчины в ихраме, у части бритая голова, у половины борода */
export function adultLook(r: () => number, womanShare = 0.32): Look {
  if (r() < womanShare) return { woman: true, cloth: pick(ABAYA, r), skin: pick(SKIN, r), hair: pick(HIJAB, r), hairLen: 1, beard: false, sc: 1 }
  const shaved = r() < 0.3
  return { woman: false, cloth: ihram(r), skin: pick(SKIN, r), hair: pick(HAIR, r), hairLen: shaved ? 0 : 0.75 + r() * 0.55, beard: r() < 0.55, sc: 1 }
}

/** Ребёнок: девочка в платье и платке или мальчик в белом, рост 0,62–0,75 */
export function kidLook(r: () => number): Look {
  const girl = r() < 0.5, sc = 0.62 + r() * 0.13
  if (girl) { const c = pick(KID_C, r); return { woman: true, cloth: c, skin: pick(SKIN, r), hair: r() < 0.5 ? c : pick(HIJAB, r), hairLen: 1, beard: false, sc } }
  return { woman: false, cloth: ihram(r), skin: pick(SKIN, r), hair: HAIR[Math.floor(r() * 4)], hairLen: 0.8, beard: false, sc }
}

/** Доля взрослых, ведущих ребёнка; у самой стены детей не водят — ребёнку слева не хватит места */
const KID_SHARE = 0.12
const KID_MIN_D = 2.5

/** Идущие тавафа: шаг между людьми растёт к краю матафа; density (0…1) — по силе устройства */
export function tawafWalkers(rings: readonly Ring[], density: number, seed = 7): Walker[] {
  const r = rng(seed), rk = rng(seed * 31 + 3), out: Walker[] = []
  for (const ring of rings) {
    const spacing = 1.55 + 0.035 * ring.d, n = Math.floor(ring.len / spacing), fill = (0.97 - 0.006 * ring.d) * density
    for (let i = 0; i < n; i++) {
      if (r() >= fill) continue
      const look = adultLook(r)
      const kid = ring.d >= KID_MIN_D && rk() < KID_SHARE ? kidLook(rk) : null
      out.push({ ring, q: i * spacing + r() * 0.5, off: ring.wall ? r() * 0.25 : (r() - 0.5) * 0.9, v: 1.15 + r() * 0.35, ph: r() * 6.28, look, kid })
    }
  }
  return out
}

/** Слева ли точка (cx, cy) от хода (tx, ty) в точке (x, y): > 0 — слева */
export const leftOf = (x: number, y: number, tx: number, ty: number, cx: number, cy: number): number =>
  tx * (cy - y) - ty * (cx - x)

/* ───── Линия Чёрного камня: истилям на ходу ───── */

/** Веса жеста: повернуть корпус к камню, поднять ладони, поцеловать их */
export interface Gesture { turn: number; up: number; kiss: number }

const smooth = (x: number, a: number, b: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Линия камня — луч от угла Чёрного камня (a) через зелёную лампу (b). На ней (ханафиты; ад-Дурр аль-Мухтар):
    не останавливаясь повернуться к камню, указать на него ладонями на уровне плеч, поцеловать ладони — и дальше.
    Жест укладывается в ~2,5 м пути вокруг линии */
export function stoneGesture(a: P2, dir: P2, x: number, y: number, fx: number, fy: number, out: Gesture): Gesture {
  out.turn = out.up = out.kiss = 0
  const dx = x - a[0], dy = y - a[1]
  if (dx * dir[0] + dy * dir[1] < 0) return out
  const sg = fx * dir[1] - fy * dir[0], g = (dx * dir[1] - dy * dir[0]) * Math.sign(sg || 1)
  if (g < -1.4 || g > 1.4) return out
  out.turn = smooth(g, -1.3, -0.6) * (1 - smooth(g, 0.7, 1.3))
  out.up = smooth(g, -1.2, -0.5) * (1 - smooth(g, 0.05, 0.5))
  out.kiss = smooth(g, 0.05, 0.45) * (1 - smooth(g, 0.8, 1.3))
  return out
}

/* ───── Сай ───── */

/** Зелёные огни: участок быстрого шага ≈ 55 м с серединой на 0,4 пути от Сафы (место — по описаниям, приблизительно) */
export const GREEN_LEN = 55
export const GREEN_MID = 0.4
/** Во сколько раз быстрее мужчины идут между зелёными огнями */
export const GREEN_F = 1.8
/** Разворот у холма — не доходя 4 м до конца пути */
const SAI_TURN = 4

export interface SaiAxis {
  safa: P2
  marwa: P2
  len: number
  /** Единичный вектор от Сафы к Марве и поперёк (к Марве идут при lat < 0, к Сафе — при lat > 0) */
  ux: number
  uy: number
  sx: number
  sy: number
}

export function saiAxis(safa: P2, marwa: P2): SaiAxis {
  const dx = marwa[0] - safa[0], dy = marwa[1] - safa[1], len = Math.hypot(dx, dy)
  const ux = dx / len, uy = dy / len
  // как на старой странице: saiN — от Марвы к Сафе, saiS = (−saiN.y, saiN.x)
  return { safa, marwa, len, ux, uy, sx: uy, sy: -ux }
}

/** Точка оси на доле пути q от Сафы со сдвигом lat поперёк */
export const saiPoint = (ax: SaiAxis, q: number, lat: number): P2 =>
  [ax.safa[0] + ax.ux * ax.len * q + ax.sx * lat, ax.safa[1] + ax.uy * ax.len * q + ax.sy * lat]

/** Петля одного человека: к Марве по своей стороне (lat < 0), разворот, обратно к Сафе по другой (lat > 0) */
export function saiLoop(ax: SaiAxis, lat: number): Ring {
  const q0 = SAI_TURN / ax.len, q1 = 1 - q0
  return closedRing([saiPoint(ax, q0, -lat), saiPoint(ax, q1, -lat), saiPoint(ax, q1, lat), saiPoint(ax, q0, lat)], lat)
}

/** Доля пути от Сафы для точки (x, y) */
export const saiFrac = (ax: SaiAxis, x: number, y: number): number =>
  ((x - ax.safa[0]) * ax.ux + (y - ax.safa[1]) * ax.uy) / ax.len

/** Между зелёными огнями? */
export function inGreen(ax: SaiAxis, x: number, y: number): boolean {
  const h = GREEN_LEN / 2 / ax.len, f = saiFrac(ax, x, y)
  return f > GREEN_MID - h && f < GREEN_MID + h
}

/** Скорость на этом месте: мужчины (без ребёнка за руку) между огнями — быстрым шагом, женщины — обычным */
export const saiSpeed = (ax: SaiAxis, w: Walker, x: number, y: number): number =>
  !w.look.woman && !w.kid && inGreen(ax, x, y) ? GREEN_F : 1

/** Идущие сая: в обе стороны, по 2,3–8,8 м от оси; около 8 % — семьи с ребёнком */
export function saiWalkers(ax: SaiAxis, count: number, seed = 11): Walker[] {
  const r = rng(seed), out: Walker[] = []
  for (let k = 0; k < count; k++) {
    const ring = saiLoop(ax, 2.3 + r() * 6.5)
    const look = adultLook(r, 0.3)
    out.push({ ring, q: r() * ring.len, off: 0, v: 0.95 + r() * 0.3, ph: r() * 6.28, look, kid: r() < 0.08 ? kidLook(r) : null })
  }
  return out
}
