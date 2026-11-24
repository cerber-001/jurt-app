import { describe, expect, it } from 'vitest'
import { FIG_TIERS, TIER_DIST, crowdBudget, deviceClass, renderBudget, tierOf } from './budget'

describe('толпа по силе устройства', () => {
  const pc = crowdBudget({ coarse: false, minSide: 900, cores: 8, memory: 8 })
  const phone = crowdBudget({ coarse: true, minSide: 390, cores: 6, memory: 6 })
  const weak = crowdBudget({ coarse: true, minSide: 360, cores: 4, memory: 2 })
  it('компьютер ≥ телефон ≥ слабый телефон — по людям, подробным фигурам и проходам решателя', () => {
    expect(pc.density).toBeGreaterThan(phone.density)
    expect(phone.density).toBeGreaterThan(weak.density)
    expect(pc.sai).toBeGreaterThan(phone.sai); expect(phone.sai).toBeGreaterThan(weak.sai)
    expect(pc.solveIters).toBeGreaterThanOrEqual(phone.solveIters)
    pc.caps.forEach((c, i) => { expect(c).toBeGreaterThan(phone.caps[i]); expect(phone.caps[i]).toBeGreaterThan(weak.caps[i]) })
    expect(pc.caps).toHaveLength(FIG_TIERS.length)
  })
  it('узкое окно без «пальца» — тоже телефонный бюджет; память неизвестна (0) — не «слабый»', () => {
    expect(crowdBudget({ coarse: false, minSide: 400, cores: 8, memory: 0 })).toEqual(phone)
    expect(crowdBudget({ coarse: true, minSide: 390, cores: 0, memory: 0 })).toEqual(phone)
  })
  it('уровень детализации по расстоянию', () => {
    expect(tierOf(0)).toBe(0)
    expect(tierOf(6.9 ** 2)).toBe(0)
    expect(tierOf(TIER_DIST[0] ** 2)).toBe(1)
    expect(tierOf(30 ** 2)).toBe(2)
    expect(tierOf(50 ** 2)).toBe(3)
    expect(tierOf(1e6)).toBe(FIG_TIERS.length - 1)
  })
})

describe('свет и эффекты по силе устройства', () => {
  const pcH = { coarse: false, minSide: 900, cores: 8, memory: 8 }
  const phoneH = { coarse: true, minSide: 390, cores: 6, memory: 6 }
  const weakH = { coarse: true, minSide: 360, cores: 4, memory: 2 }
  it('класс устройства', () => {
    expect(deviceClass(pcH)).toBe('desktop')
    expect(deviceClass(phoneH)).toBe('phone')
    expect(deviceClass(weakH)).toBe('weak')
    expect(deviceClass({ coarse: false, minSide: 900, cores: 2, memory: 1 })).toBe('desktop')   // слабость считаем только у телефона
  })
  it('компьютер: тени 2048, мягкие, свечение; телефон: 1024 без свечения; слабый: без карты теней; SSAO — нигде', () => {
    expect(renderBudget(pcH)).toEqual({ shadowMap: 2048, softShadows: true, bloom: true, ssao: false })
    expect(renderBudget(phoneH)).toEqual({ shadowMap: 1024, softShadows: false, bloom: false, ssao: false })
    expect(renderBudget(weakH)).toEqual({ shadowMap: 0, softShadows: false, bloom: false, ssao: false })
  })
})
