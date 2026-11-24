import { describe, expect, it } from 'vitest'
import {
  brisk, fkAngles, groundCache, groundLift, jointsOf, pointOf, rotX, rotYZ, stride, THIGH_K, type ArmAngles, type Stride,
} from './gait'
import { FIG_MAIN, figHead } from './shader'

/** Мерки fig_m_hi и fig_w_hi из public/haram3d/v1/props.glb (свойства корня) */
const MAN = {
  JX: 0.2052, JY: 1.3942, EX: 0.237, EY: 1.1416, EZ: 0.0003, WX: 0.2281, WY: 0.8851,
  HPY: 0.9493, HPZ: 0.0235, KY: 0.5072, KZ: -0.0145, AY: 0.0744, AZ: 0.0057, BY: 0.0282, BZ: -0.1341,
  S4Y: 1.0379, S4Z: 0.0447, S2Y: 1.1586, S2Z: 0.0427, NY: 1.4969, NZ: 0.0061, TTY: 0.0201, TTZ: -0.1895,
  HLY: 0.0222, HLZ: 0.0669, INY: 0.1708, INZ: -0.0263, KFY: 0.5436, KFZ: -0.0738, FHY: 1.6711, FHZ: -0.1381, NTY: 1.5976, NTZ: -0.1544,
}
const WOMAN = {
  JX: 0.1522, JY: 1.2685, EX: 0.1531, EY: 1.0296, EZ: -0.0112, WX: 0.1574, WY: 0.8107,
  HPY: 0.8513, HPZ: 0.0011, KY: 0.4672, KZ: -0.0271, AY: 0.0644, AZ: 0.0028, BY: 0.0206, BZ: -0.1129,
  S4Y: 0.9259, S4Z: 0.0424, S2Y: 1.0628, S2Z: 0.0121, NY: 1.3545, NZ: 0.0186, TTY: 0.0162, TTZ: -0.1594,
  HLY: 0.023, HLZ: 0.0435, INY: 0.171, INZ: -0.0174, KFY: 0.4949, KFZ: -0.086, FHY: 1.5328, FHZ: -0.1163, NTY: 1.4648, NTZ: -0.1332,
}
type Fig = typeof MAN

/** Кисть руки после поворотов — теми же формулами, что ARMS в шейдере: предплечье вокруг локтя, рука вокруг плеча.
    Поворот «в сторону» (rZ) и вращение предплечья (rY) на z не влияют при нулевом x-смещении — для знака шага их опускаем */
function handZ(u: Fig, a: ArmAngles): number {
  const [, ey, ez] = rotX(a[2], 0, u.WY - u.EY, 0 - u.EZ)
  const wy = u.EY + ey, wz = u.EZ + ez
  const [, , z] = rotX(a[0], 0, wy - u.JY, wz)
  return z
}

/** Локоть после поворота плеча: + — позади плеча, − — впереди (у согнутой руки быстрого шага кисть может быть впереди
    даже на махе назад — поэтому мах судим по локтю, а кисти сравниваем между собой) */
function elbowZ(u: Fig, a: ArmAngles): number {
  return rotX(a[0], 0, u.EY - u.JY, u.EZ)[2]
}

/** Колено ноги (звено бедра: 4 — правое, 8 — левое): z после поворотов; −z — вперёд */
function kneeZ(u: Fig, st: Stride, link: 4 | 8): number {
  const J = jointsOf(u)!
  return pointOf(J, fkAngles(0, st.fsw), 'K', link)[1]
}

describe('походка накрест (по геометрии фигуры)', () => {
  const cases: [string, Fig, (sw: number) => Stride][] = [
    ['мужчина, обычный шаг', MAN, stride],
    ['женщина, обычный шаг', WOMAN, stride],
    ['мужчина, быстрый шаг сая', MAN, brisk],
    ['ребёнок (та же фигура, уменьшена)', WOMAN, sw => stride(sw * 0.3 / 0.32)],
  ]
  for (const [name, u, gait] of cases) {
    it(`${name}: правое бедро впереди — правая рука сзади, левая впереди`, () => {
      const st = gait(0.5)
      expect(st.fsw).toBeGreaterThan(0)
      expect(kneeZ(u, st, 4)).toBeLessThan(kneeZ(u, st, 8))   // правое колено впереди левого
      expect(kneeZ(u, st, 4)).toBeLessThan(u.KZ)
      expect(elbowZ(u, st.right)).toBeGreaterThan(0)           // правая рука — назад
      expect(elbowZ(u, st.left)).toBeLessThan(0)               // левая — вперёд
      expect(handZ(u, st.left)).toBeLessThan(handZ(u, st.right) - 0.05)
    })
    it(`${name}: левое бедро впереди — левая рука сзади, правая впереди`, () => {
      const st = gait(-0.5)
      expect(kneeZ(u, st, 8)).toBeLessThan(kneeZ(u, st, 4))
      expect(elbowZ(u, st.left)).toBeGreaterThan(0)
      expect(elbowZ(u, st.right)).toBeLessThan(0)
      expect(handZ(u, st.right)).toBeLessThan(handZ(u, st.left) - 0.05)
    })
  }

  it('обычный шаг: кисть идёт за рукой (правая сзади, левая впереди)', () => {
    const st = stride(0.5)
    expect(handZ(MAN, st.right)).toBeGreaterThan(0)
    expect(handZ(MAN, st.left)).toBeLessThan(0)
  })

  it('стоя (шаг 0) — руки симметричны, ноги вместе', () => {
    const st = stride(0)
    expect(st.fsw).toBe(0)
    expect(handZ(MAN, st.right)).toBeCloseTo(handZ(MAN, st.left), 6)
    expect(kneeZ(MAN, st, 4)).toBeCloseTo(kneeZ(MAN, st, 8), 6)
  })
})

describe('скелет: функции в TS и в шейдере — одни и те же', () => {
  it('угол бедра в шейдере — тот же THIGH_K, правая нога «+», левая «−»', () => {
    const head = figHead([-1, 0, 1, 2, 0, 4, 5, 6, 0, 8, 9, 10], ['HP', 'S4', 'S2', 'N', 'HP', 'K', 'A', 'B', 'HP', 'K', 'A', 'B'], new Array(12).fill(0))
    expect(head).toContain(`i < 8 ? ${THIGH_K} * s : -${THIGH_K} * s`)
    expect(head).toContain('mat3 rX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }')
    expect(head).toContain('mat2 r2(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }')
    expect(FIG_MAIN).toContain('mat3 fSh = rZ(fS * fA.y) * rX(fA.x)')
  })
  it('rotYZ и rotX — поворот на 90° переводит «вниз» во «вперёд» при отрицательном угле… и назад при положительном', () => {
    const [y1, z1] = rotYZ(Math.PI / 2, -1, 0)
    expect(y1).toBeCloseTo(0, 6); expect(z1).toBeCloseTo(-1, 6)
    const [, y2, z2] = rotX(Math.PI / 2, 0, -1, 0)
    expect(y2).toBeCloseTo(0, 6); expect(z2).toBeCloseTo(-1, 6)
  })
  it('jointsOf: нет мерки — null', () => {
    expect(jointsOf(MAN)).not.toBeNull()
    const { KY: _drop, ...noKnee } = MAN
    expect(jointsOf(noKnee)).toBeNull()
  })
})

describe('опускание на пол', () => {
  const J = jointsOf(MAN)!
  it('стоя — подошва почти на полу (2 см и меньше)', () => {
    expect(Math.abs(groundLift(J, 0, 0))).toBeLessThan(0.03)
  })
  it('в шаге ноги «короче» — фигура опускается, не взлетает', () => {
    expect(groundLift(J, 0, 0.2)).toBeLessThanOrEqual(groundLift(J, 0, 0) + 1e-9)
    expect(groundLift(J, 0, -0.2)).toBeLessThanOrEqual(groundLift(J, 0, 0) + 1e-9)
  })
  it('кэш даёт то же, что прямой расчёт по округлённой позе', () => {
    const g = groundCache(J)
    expect(g(-0.151, 0.123)).toBeCloseTo(groundLift(J, -0.15, 0.12), 9)
    expect(g(-0.151, 0.123)).toBe(g(-0.149, 0.1249))
  })
})
