import { describe, expect, it } from 'vitest'
import { jointsOf } from './gait'
import { HALO_ALPHA, HALO_HEADS, HALO_STRIDE, HaloBatch, HeadOf, haloFade, headLocal } from './halo'
import { INST_STRIDE } from './shader'

// мерки fig_m_hi (как в gait.test.ts)
const MAN = {
  HPY: 0.9493, HPZ: 0.0235, KY: 0.5072, KZ: -0.0145, AY: 0.0744, AZ: 0.0057, BY: 0.0282, BZ: -0.1341,
  S4Y: 1.0379, S4Z: 0.0447, S2Y: 1.1586, S2Z: 0.0427, NY: 1.4969, NZ: 0.0061, TTY: 0.0201, TTZ: -0.1895,
  HLY: 0.0222, HLZ: 0.0669, INY: 0.1708, INZ: -0.0263, KFY: 0.5436, KFZ: -0.0738, FHY: 1.6711, FHZ: -0.1381, NTY: 1.5976, NTZ: -0.1544,
}
const J = jointsOf(MAN)!

/** 32 числа человека: место (x, h, z), поворот, рост sc, подъём к полу, наклон */
function person(x: number, h: number, z: number, rot: number, sc: number, tilt = 0, lift = 0): Float32Array {
  const a = new Float32Array(INST_STRIDE)
  a[0] = x; a[1] = h; a[2] = z; a[3] = rot; a[7] = sc; a[11] = lift; a[20] = tilt
  return a
}

describe('ореол нура', () => {
  it('стоит над шеей, на высоте головы, чуть впереди её середины', () => {
    const [y, z] = headLocal(J, 0)
    expect(y).toBeGreaterThan(MAN.NY + 0.05)
    expect(y).toBeLessThan(MAN.FHY + 0.03)
    expect(z).toBeLessThan(0.02)
    expect(z).toBeGreaterThan(-0.12)
  })
  it('позиция — над головой человека в мире: с учётом места, поворота, пола и роста', () => {
    const b = new HaloBatch(4), head = new HeadOf(J)
    b.push(person(10, 0.08, -5, Math.PI / 2, 1), 0, head, 5)
    const [hy, hz] = head.at(0), a = b.arr
    expect(a[0]).toBeCloseTo(10 + hz, 5)   // повёрнут на 90° — «вперёд» (−z) смотрит в −x
    expect(a[1]).toBeCloseTo(0.08 + hy, 5)
    expect(a[2]).toBeCloseTo(-5, 5)
    expect(a[3]).toBeCloseTo(head.size * HALO_HEADS, 5)
    expect(a[4]).toBeCloseTo(HALO_ALPHA, 5)
  })
  it('в поклоне голова ниже и впереди', () => {
    const up = headLocal(J, 0), bow = headLocal(J, -1.35)
    expect(bow[0]).toBeLessThan(up[0] - 0.3)
    expect(bow[1]).toBeLessThan(up[1] - 0.2)
  })
  it('у ребёнка ореол ниже и меньше — пропорционально росту', () => {
    const b = new HaloBatch(2), head = new HeadOf(J)
    b.push(person(0, 0, 0, 0, 1), 0, head, 5)
    b.push(person(0, 0, 0, 0, 0.65), 0, head, 5)
    const s = HALO_STRIDE
    expect(b.arr[s + 1] / b.arr[1]).toBeCloseTo(0.65, 5)
    expect(b.arr[s + 3] / b.arr[3]).toBeCloseTo(0.65, 5)
  })
  it('ореолов ровно столько, сколько нарисовано людей; сверх буфера — не пишет', () => {
    const b = new HaloBatch(5), head = new HeadOf(J), p = person(0, 0, 0, 0, 1)
    b.begin()
    for (let i = 0; i < 3; i++) b.push(p, 0, head, 10 + i * 30)
    b.flush()
    expect(b.n).toBe(3)
    expect((b.mesh.geometry as { instanceCount: number }).instanceCount).toBe(3)
    b.begin()
    for (let i = 0; i < 9; i++) b.push(p, 0, head, 10)
    b.flush()
    expect(b.n).toBe(5)
    b.dispose()
  })
  it('один draw call на всех, свет складывается, глубину не пишет', () => {
    const b = new HaloBatch(10), m = b.mesh.material as { depthWrite: boolean; transparent: boolean; blending: number }
    expect(Array.isArray(b.mesh.material)).toBe(false)
    expect(m.depthWrite).toBe(false)
    expect(m.transparent).toBe(true)
    expect(m.blending).toBe(2)   // AdditiveBlending
  })
  it('с расстоянием — меньше и тусклее, плавно: без скачков на границах уровней 7, 14, 40, 60 м', () => {
    let prev = haloFade(0)
    for (let d = 0.5; d <= 400; d += 0.5) {
      const f = haloFade(d)
      expect(f.size).toBeLessThanOrEqual(prev.size + 1e-9)
      expect(f.alpha).toBeLessThanOrEqual(prev.alpha + 1e-9)
      expect(Math.abs(f.alpha - prev.alpha)).toBeLessThan(0.01)
      expect(Math.abs(f.size - prev.size)).toBeLessThan(0.01)
      prev = f
    }
    expect(haloFade(5).alpha).toBeGreaterThanOrEqual(0.35)
    expect(haloFade(5).alpha).toBeLessThanOrEqual(0.5)
    expect(haloFade(60).alpha).toBeLessThan(haloFade(14).alpha)
    expect(haloFade(400).alpha).toBe(0)
  })
})
