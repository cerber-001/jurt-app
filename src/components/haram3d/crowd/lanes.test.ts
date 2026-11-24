import { describe, expect, it } from 'vitest'
import type { P2 } from '../../../lib/haram3d'
import {
  GREEN_F, GREEN_LEN, GREEN_MID, adultLook, along, closedRing, hullPoints, hullRing, inGreen, kidLook, leftOf, rng, saiAxis,
  saiFrac, saiLoop, saiPoint, saiSpeed, saiWalkers, stoneGesture, tawafWalkers, type Gesture, type Pt, type Walker,
} from './lanes'

/** Углы Каабы и точки из public/haram3d/v1/haram_meta.json (x — восток, y — север) */
const CORNERS: P2[] = [[6.26, -2.06], [-0.21, 7.62], [-2.14, -7.78], [-8.78, 2.2]]
const STONE: P2 = [6.26, -2.06]
const LAMP: P2 = [66.7883, -25.012475]
const SAFA: P2 = [135.83, -75.36]
const MARWA: P2 = [91.41, 301.79]

const pt = (): Pt => ({ x: 0, y: 0, tx: 0, ty: 0 })
const signedArea = (xs: Float64Array, ys: Float64Array) => {
  let a = 0
  for (let i = 0; i + 1 < xs.length; i++) a += xs[i] * ys[i + 1] - xs[i + 1] * ys[i]
  return a / 2
}

describe('таваф: против часовой стрелки, Кааба слева', () => {
  const hull = hullPoints(CORNERS)
  for (const d of [0.65, 1.6, 8, 30]) {
    it(`кольцо в ${d} м: обход против часовой (площадь > 0), Кааба всё время слева`, () => {
      const r = hullRing(hull, d)
      expect(signedArea(r.xs, r.ys)).toBeGreaterThan(0)
      const p = pt()
      for (let s = 0; s < r.len; s += r.len / 37) {
        along(r, s, p)
        expect(leftOf(p.x, p.y, p.tx, p.ty, 0, 0)).toBeGreaterThan(0)
      }
    })
  }
  it('кольцо у стены — вплотную (wall), дальние — нет', () => {
    expect(hullRing(hull, 0.65).wall).toBe(true)
    expect(hullRing(hull, 3.5).wall).toBe(false)
  })
  it('along идёт по кругу: s и s + длина — одна точка', () => {
    const r = closedRing([[0, 0], [4, 0], [4, 3]], 0)
    expect(r.len).toBeCloseTo(12, 9)
    const a = along(r, 2, pt()), b = along(r, 14, pt()), c = along(r, -10, pt())
    expect([b.x, b.y]).toEqual([a.x, a.y])
    expect(c.x).toBeCloseTo(a.x, 9)
    expect(a).toMatchObject({ x: 2, y: 0 })
  })
  it('толпа повторяется от открытия к открытию; меньше плотность — меньше людей; дети не у самой стены', () => {
    const rings = [0.65, 3.5, 8, 15].map(d => hullRing(hull, d))
    const a = tawafWalkers(rings, 1), b = tawafWalkers(rings, 1), half = tawafWalkers(rings, 0.5)
    expect(a.length).toBe(b.length)
    expect(a.map(w => w.q)).toEqual(b.map(w => w.q))
    expect(half.length).toBeLessThan(a.length * 0.65)
    expect(a.some(w => w.kid)).toBe(true)
    expect(a.filter(w => w.kid).every(w => w.ring.d >= 2.5)).toBe(true)
  })
})

describe('жест у линии Чёрного камня', () => {
  const dir: P2 = (() => { const dx = LAMP[0] - STONE[0], dy = LAMP[1] - STONE[1], l = Math.hypot(dx, dy); return [dx / l, dy / l] })()
  const g = (): Gesture => ({ turn: 0, up: 0, kiss: 0 })
  // идём против часовой вокруг Каабы — направление хода в точке на линии
  const onLine = (k: number): P2 => [STONE[0] + dir[0] * k, STONE[1] + dir[1] * k]
  const fwd: P2 = [-dir[1], dir[0]]   // поворот на +90°: против часовой, Кааба слева
  it('на самой линии — ладони подняты к камню, корпус повёрнут', () => {
    const [x, y] = onLine(5)
    const out = stoneGesture(STONE, dir, x - fwd[0] * 0.2, y - fwd[1] * 0.2, fwd[0], fwd[1], g())
    expect(out.up).toBeGreaterThan(0.5)
    expect(out.turn).toBeGreaterThan(0.5)
  })
  it('сразу за линией — целуют ладони; далеко от линии — идут обычно', () => {
    const [x, y] = onLine(5)
    expect(stoneGesture(STONE, dir, x + fwd[0] * 0.6, y + fwd[1] * 0.6, fwd[0], fwd[1], g()).kiss).toBeGreaterThan(0.5)
    expect(stoneGesture(STONE, dir, x + fwd[0] * 3, y + fwd[1] * 3, fwd[0], fwd[1], g())).toEqual({ turn: 0, up: 0, kiss: 0 })
  })
  it('по ту сторону Каабы (за углом камня) жеста нет', () => {
    const x = STONE[0] - dir[0] * 5, y = STONE[1] - dir[1] * 5
    expect(stoneGesture(STONE, dir, x, y, fwd[0], fwd[1], g())).toEqual({ turn: 0, up: 0, kiss: 0 })
  })
})

describe('сай: в обе стороны, зелёные огни', () => {
  const ax = saiAxis(SAFA, MARWA)
  it('ось: длина около 380 м, к Марве идут при lat < 0, к Сафе — при lat > 0', () => {
    expect(ax.len).toBeGreaterThan(370); expect(ax.len).toBeLessThan(390)
    const loop = saiLoop(ax, 4), p = along(loop, 1, pt())
    expect(p.tx * ax.ux + p.ty * ax.uy).toBeGreaterThan(0)          // первая половина петли — к Марве…
    expect((p.x - SAFA[0]) * ax.sx + (p.y - SAFA[1]) * ax.sy).toBeCloseTo(-4, 6)   // …по стороне lat < 0
    const q = along(loop, loop.len / 2 + 1, pt())
    expect(q.tx * ax.ux + q.ty * ax.uy).toBeLessThan(0)             // обратно к Сафе…
    expect((q.x - SAFA[0]) * ax.sx + (q.y - SAFA[1]) * ax.sy).toBeGreaterThan(0)  // …по другой стороне
  })
  it('saiFrac обратна saiPoint', () => {
    const [x, y] = saiPoint(ax, 0.37, 3)
    expect(saiFrac(ax, x, y)).toBeCloseTo(0.37, 9)
  })
  it(`зелёная зона — ${GREEN_LEN} м вокруг доли ${GREEN_MID}`, () => {
    const h = GREEN_LEN / 2 / ax.len
    expect(inGreen(ax, ...saiPoint(ax, GREEN_MID, 5))).toBe(true)
    expect(inGreen(ax, ...saiPoint(ax, GREEN_MID + h * 0.9, -5))).toBe(true)
    expect(inGreen(ax, ...saiPoint(ax, GREEN_MID + h * 1.1, 5))).toBe(false)
    expect(inGreen(ax, ...saiPoint(ax, 0.1, 5))).toBe(false)
  })
  it('между огнями мужчина ускоряется, женщина и мужчина с ребёнком — обычным шагом; вне огней все обычно', () => {
    const r = rng(3)
    let man = adultLook(r, 0); while (man.woman) man = adultLook(r, 0)
    const woman = adultLook(r, 1)
    const w = (look = man, kid: Walker['kid'] = null): Walker => ({ ring: saiLoop(ax, 4), q: 0, off: 0, v: 1, ph: 0, look, kid })
    const [gx, gy] = saiPoint(ax, GREEN_MID, -4), [ox, oy] = saiPoint(ax, 0.1, -4)
    expect(saiSpeed(ax, w(), gx, gy)).toBe(GREEN_F)
    expect(GREEN_F).toBeGreaterThan(1.5)
    expect(saiSpeed(ax, w(woman), gx, gy)).toBe(1)
    expect(saiSpeed(ax, w(man, kidLook(r)), gx, gy)).toBe(1)
    expect(saiSpeed(ax, w(), ox, oy)).toBe(1)
  })
  it('идущие сая — в обе стороны поровну по построению, около трети женщин', () => {
    const ws = saiWalkers(ax, 400)
    expect(ws).toHaveLength(400)
    const toMarwa = ws.filter(w => along(w.ring, w.q, pt()).tx * ax.ux + along(w.ring, w.q, pt()).ty * ax.uy > 0).length
    expect(toMarwa).toBeGreaterThan(140); expect(toMarwa).toBeLessThan(260)
    const women = ws.filter(w => w.look.woman).length
    expect(women).toBeGreaterThan(80); expect(women).toBeLessThan(170)
  })
})
