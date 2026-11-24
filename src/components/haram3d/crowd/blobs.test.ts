import { describe, expect, it } from 'vitest'
import { BLOB_FADE_FAR, BLOB_FADE_NEAR, BLOB_R, blobFade, blobShape, blobShift } from './blobs'
import { shadowHalf, snap, SHADOW_HALF_STEPS } from '../light'

describe('пятна-тени под людьми', () => {
  it('взрослый стоя — круг радиуса BLOB_R, без сдвига вперёд', () => {
    expect(blobShape(1, 0)).toEqual({ r: BLOB_R, stretch: 1, fwd: 0 })
  })

  it('ребёнок (рост 0,6) — пятно меньше взрослого', () => {
    expect(blobShape(0.6, 0).r).toBeCloseTo(BLOB_R * 0.6)
  })

  it('в поклоне пятно шире, длиннее и смещено вперёд; знак наклона не важен', () => {
    const bow = blobShape(1, 1.35)
    expect(bow.r).toBeGreaterThan(BLOB_R)
    expect(bow.stretch).toBeCloseTo(1.9)
    expect(bow.fwd).toBeGreaterThan(0)
    expect(blobShape(1, -1.35)).toEqual(bow)
  })

  it('земной поклон не раздувает пятно без меры (потолок 1,5 поклона)', () => {
    expect(blobShape(1, 10)).toEqual(blobShape(1, 1.35 * 1.5))
  })

  it('вблизи пятно полное, дальше BLOB_FADE_FAR — гаснет', () => {
    expect(blobFade(0)).toBe(1)
    expect(blobFade(BLOB_FADE_NEAR)).toBe(1)
    expect(blobFade(BLOB_FADE_FAR)).toBe(0)
    const mid = blobFade((BLOB_FADE_NEAR + BLOB_FADE_FAR) / 2)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })

  it('солнце в зените — пятно под ногами', () => {
    expect(blobShift([0, 0, 1])).toEqual([0, 0])
  })

  it('низкое солнце на юге — пятно уходит на север (в three.js −z), не дальше 0,35 м', () => {
    const [x, z] = blobShift([0, -0.95, 0.31])
    expect(Math.abs(x)).toBeLessThan(1e-9)
    expect(z).toBeLessThan(0)
    expect(Math.hypot(x, z)).toBeLessThanOrEqual(0.35 + 1e-9)
  })

  it('солнце на востоке — пятно на запад (−x)', () => {
    const [x] = blobShift([0.7, 0, 0.7])
    expect(x).toBeLessThan(0)
  })
})

describe('рамка карты теней', () => {
  it('вблизи — матаф ±70 м', () => {
    expect(shadowHalf(50)).toBe(70)
  })

  it('растёт ступенями по расстоянию до точки взгляда', () => {
    expect(shadowHalf(150)).toBe(110)
    expect(shadowHalf(400)).toBe(260)
  })

  it('очень далеко — наибольшая ступень, не больше', () => {
    expect(shadowHalf(5000)).toBe(SHADOW_HALF_STEPS[SHADOW_HALF_STEPS.length - 1])
  })

  it('центр рамки — по сетке в четверть рамки', () => {
    expect(snap(10, 70)).toBeCloseTo(17.5)
    expect(snap(-3, 70)).toBeCloseTo(0)
    expect(snap(100, 400)).toBe(100)
  })
})
