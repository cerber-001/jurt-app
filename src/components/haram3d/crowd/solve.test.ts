import { describe, expect, it } from 'vitest'
import type { P2 } from '../../../lib/haram3d'
import { rng } from './lanes'
import { SAI_RAIL, SAI_WALL, kaabaEdges, saiPushOut, tawafPushOut } from './obstacles'
import { saiAxis, saiPoint } from './lanes'
import { Solver } from './solve'

const CORNERS: P2[] = [[6.26, -2.06], [-0.21, 7.62], [-2.14, -7.78], [-8.78, 2.2]]
const MAQAM: P2 = [11.54, 6.83]
const GRID = { x0: -70, y0: -70, w: 140, h: 140 }

describe('столкновения', () => {
  it('плотная толпа расходится: после решения наложений нет', () => {
    const s = new Solver(400, GRID, 400), r = rng(5)
    s.begin()
    for (let i = 0; i < 300; i++) s.add(20 + r() * 9, 20 + r() * 9, 0.25, i, true)
    expect(s.overlaps()).toBeGreaterThan(0)
    s.solve(40, null)
    expect(s.overlaps()).toBe(0)
  })
  it('два человека в одной точке расходятся (без деления на ноль)', () => {
    const s = new Solver(4, GRID, 4)
    s.begin(); s.add(1, 1, 0.25, 0, true); s.add(1, 1, 0.25, 1, true)
    s.solve(4, null)
    expect(Number.isFinite(s.x[0])).toBe(true)
    expect(Math.hypot(s.x[1] - s.x[0], s.y[1] - s.y[0])).toBeGreaterThan(0.45)
  })
  it('взрослый и ребёнок за руку двигаются вместе и друг друга не расталкивают', () => {
    const s = new Solver(4, GRID, 4)
    s.begin()
    const a = s.add(0, 0, 0.25, 0, true), k = s.add(0.3, 0, 0.17, 1, true), o = s.add(0.1, 0.2, 0.25, 2, true)
    s.pair(a, k)
    s.solve(10, null)
    expect(Math.hypot(s.x[k] - s.x[a], s.y[k] - s.y[a])).toBeCloseTo(0.3, 5)
    expect(s.overlaps()).toBe(0)
    expect(o).toBe(2)
  })
  it('смещение помнится между кадрами, но не больше 1,5 м', () => {
    const s = new Solver(60, GRID, 60)
    s.begin()
    for (let i = 0; i < 50; i++) s.add(0, 0, 0.25, i, true)
    s.solve(30, null)
    s.begin()
    const a = s.add(0, 0, 0.25, 49, false)
    expect(Math.hypot(s.x[a], s.y[a])).toBeLessThanOrEqual(1.5 * 0.96 + 1e-5)
  })
  it('Кааба, Хатым и Макам выталкивают людей наружу', () => {
    const s = new Solver(8, GRID, 8)
    s.begin()
    const inK = s.add(0, 0, 0.25, 0, true), inWall = s.add(-6.665, 8.763 + 5.2, 0.25, 1, true), inMq = s.add(MAQAM[0] + 0.1, MAQAM[1], 0.25, 2, true)
    s.solve(2, tawafPushOut(CORNERS, MAQAM))
    expect(kaabaEdges(CORNERS)).toHaveLength(4)
    const out = kaabaEdges(CORNERS).some(e => (s.x[inK] - e[0]) * e[2] + (s.y[inK] - e[1]) * e[3] >= 0.25 + 0.15 - 1e-6)
    expect(out).toBe(true)
    const R = Math.hypot(s.x[inWall] + 6.665, s.y[inWall] - 8.763)
    expect(R < 4.4 - 0.24 || R > 5.97 + 0.24).toBe(true)
    expect(Math.hypot(s.x[inMq] - MAQAM[0], s.y[inMq] - MAQAM[1])).toBeGreaterThanOrEqual(0.65 + 0.25 - 1e-6)
  })
  it('сай: человек остаётся в своём коридоре — между перилами и колоннами', () => {
    const ax = saiAxis([135.83, -75.36], [91.41, 301.79])
    const s = new Solver(4, { x0: 70, y0: -100, w: 90, h: 420 }, 4)
    s.begin()
    const a = s.add(...saiPoint(ax, 0.5, -0.5), 0.25, 0, true), b = s.add(...saiPoint(ax, 0.5, 12), 0.25, 1, true)
    s.solve(1, saiPushOut(ax))
    const lat = (i: number) => (s.x[i] - ax.safa[0]) * ax.sx + (s.y[i] - ax.safa[1]) * ax.sy
    expect(lat(a)).toBeCloseTo(-(SAI_RAIL + 0.25), 5)
    expect(lat(b)).toBeCloseTo(SAI_WALL - 0.25, 5)
  })
})
