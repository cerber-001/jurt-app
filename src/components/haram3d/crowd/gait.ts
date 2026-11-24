/* Толпа: походка и скелет фигуры — чистая логика без three.js (её проверяют юнит-тесты).
   Скелет — как на старой странице haram3d (v3.19): 12 звеньев, каждое поворачивается в плоскости «вперёд-вверх»
   вокруг своего сустава. Своя система координат фигуры: y — вверх, −z — вперёд по ходу, +x — правая сторона.
   Знаки (проверены по геометрии в gait.test.ts — теми же матрицами, что в шейдере):
   • звено ноги: угол «+» уводит колено и стопу вперёд (−z); корпус: «−» — наклон вперёд;
   • рука: угол «вперёд» «+» уводит кисть вперёд (−z).
   Ошибка старой страницы: правая рука и правая нога шли вперёд вместе. Здесь шаг накрест (stride). */

/** Рука: [вперёд, в сторону (+ — от тела), сгиб локтя, поворот предплечья] */
export type ArmAngles = readonly [number, number, number, number]

/** Доля маха рукой, уходящая в шаг ногой: fsw = sw · STRIDE_LEG */
export const STRIDE_LEG = 0.45
/** Угол бедра на единицу fsw — в шейдере: th = ±THIGH_K · fsw (правая нога «+», левая «−») */
export const THIGH_K = 2.4

/** Рука в ходьбе: у бедра, локоть мягко сгибается на взмахе вперёд и почти выпрямляется назад */
export const walkArm = (fwd: number): ArmAngles => [fwd, 0.05, 0.2 + Math.max(0, fwd) * 1.1, 0]

export interface Stride {
  /** Шаг ногами: > 0 — вперёд правая нога */
  fsw: number
  right: ArmAngles
  left: ArmAngles
}

/** Шаг накрест: правая нога вперёд — правая рука назад, левая вперёд; и наоборот */
export function stride(sw: number): Stride {
  return { fsw: sw * STRIDE_LEG, right: walkArm(-sw), left: walkArm(sw) }
}

/** Быстрый шаг (сай, мужчины между зелёными огнями): руки согнуты и машут накрест сильнее */
export function brisk(sw: number): Stride {
  return { fsw: sw * STRIDE_LEG, right: [0.1 - sw * 0.7, 0.1, 1.3, 0], left: [0.1 + sw * 0.7, 0.1, 1.3, 0] }
}

/* ───── Скелет: углы звеньев (зеркало fkAng в шейдере) ───── */

/** Родитель звена: 0 таз, 1 живот, 2 грудь, 3 шея+голова, 4–7 правые бедро/голень/стопа/пальцы, 8–11 левые */
export const FK_PAR: readonly number[] = [-1, 0, 1, 2, 0, 4, 5, 6, 0, 8, 9, 10]
/** Сустав, вокруг которого поворачивается звено (ключи мерок из свойств корня фигуры в props.glb) */
export const FK_PIV: readonly string[] = ['HP', 'S4', 'S2', 'N', 'HP', 'K', 'A', 'B', 'HP', 'K', 'A', 'B']
/** Поклон «руку» (для наклона корпуса вперёд на быстром шаге) */
export const FK_RUKU: readonly number[] = [-1.25, -1.45, -1.5, -1.45, 0.1, 0.1, 0, 0, 0.1, 0.1, 0, 0]

/** Угол звена ноги j (0 бедро … 3 пальцы) при угле бедра th: колено сгибается мягко, стопа отталкивается */
const legJoint = (j: number, th: number): number =>
  j === 0 ? th : j === 1 ? (th > 0 ? 0.25 * th : th) : j === 2 && th < 0 ? 0.8 * th : 0

/** Углы всех 12 звеньев: tilt — наклон корпуса (−: вперёд), fsw — шаг (+: правая нога вперёд) */
export function fkAngles(tilt: number, fsw: number): number[] {
  const aR = Math.min(1, Math.max(0, -tilt / 1.35)), up = Math.max(tilt, 0)
  return FK_PAR.map((_, i) => {
    const t = FK_RUKU[i] * aR
    if (i < 4) return t + up
    const th = i < 8 ? THIGH_K * fsw : -THIGH_K * fsw
    return t + legJoint(i & 3, th)
  })
}

/** Поворот в плоскости (y, z) — как r2(a) в шейдере: mat2(c, s, −s, c) по столбцам */
export function rotYZ(a: number, y: number, z: number): [number, number] {
  const c = Math.cos(a), s = Math.sin(a)
  return [c * y - s * z, s * y + c * z]
}

/** Поворот вокруг оси x — как rX(a) в шейдере (рука вперёд-назад) */
export function rotX(a: number, x: number, y: number, z: number): [number, number, number] {
  const c = Math.cos(a), s = Math.sin(a)
  return [x, c * y - s * z, s * y + c * z]
}

/** Суставы фигуры: (y, z) по ключу — HP, K, A, B, S4, S2, N, TT, HL, IN, KF, FH, NT */
export type Joints = Readonly<Record<string, readonly [number, number]>>
export const JOINT_KEYS: readonly string[] = ['HP', 'K', 'A', 'B', 'S4', 'S2', 'N', 'TT', 'HL', 'IN', 'KF', 'FH', 'NT']

/** Мерки из свойств корня fig_* (HPY, HPZ, …); нет хотя бы одной — null (фигуру не показываем) */
export function jointsOf(u: Readonly<Record<string, unknown>>): Joints | null {
  const out: Record<string, [number, number]> = {}
  for (const k of JOINT_KEYS) {
    const y = Number(u[k + 'Y']), z = Number(u[k + 'Z'])
    if (!Number.isFinite(y) || !Number.isFinite(z)) return null
    out[k] = [y, z]
  }
  return out
}

/** Куда встаёт сустав каждого звена после поворотов (цепочкой от таза) */
function pivots(J: Joints, T: readonly number[]): [number, number][] {
  const O: [number, number][] = [[J.HP[0], J.HP[1]]]
  for (let c = 1; c < 12; c++) {
    const p = FK_PAR[c], a = J[FK_PIV[c]], b = J[FK_PIV[p]]
    const [dy, dz] = rotYZ(T[p], a[0] - b[0], a[1] - b[1])
    O.push([O[p][0] + dy, O[p][1] + dz])
  }
  return O
}

/** Точка фигуры (ключ мерки), принадлежащая звену c, после поворотов */
export function pointOf(J: Joints, T: readonly number[], key: string, c: number): [number, number] {
  const O = pivots(J, T), a = J[key], b = J[FK_PIV[c]]
  const [dy, dz] = rotYZ(T[c], a[0] - b[0], a[1] - b[1])
  return [O[c][0] + dy, O[c][1] + dz]
}

/** Точки касания пола: пальцы, пятки, подъём стопы (правая и левая) */
const GROUND_PTS: readonly (readonly [string, number])[] = [['TT', 7], ['TT', 11], ['HL', 6], ['HL', 10], ['IN', 6], ['IN', 10]]

/** На сколько опустить фигуру, чтобы нижняя точка стоп легла на пол (в шаге ноги «короче» — фигура чуть ниже) */
export function groundLift(J: Joints, tilt: number, fsw: number): number {
  const T = fkAngles(tilt, fsw), O = pivots(J, T)
  let lo = Math.min(O[7][0], O[11][0])
  for (const [k, c] of GROUND_PTS) {
    const a = J[k], b = J[FK_PIV[c]]
    lo = Math.min(lo, O[c][0] + rotYZ(T[c], a[0] - b[0], a[1] - b[1])[0])
  }
  return -lo
}

/** Кэш опускания по округлённым позам: в ходьбе позы повторяются, считать каждый кадр незачем */
export function groundCache(J: Joints): (tilt: number, fsw: number) => number {
  const memo = new Map<number, number>()
  return (tilt, fsw) => {
    const qt = Math.round(tilt * 100), qs = Math.round(fsw * 100), key = (qt + 512) * 1024 + qs + 512
    let g = memo.get(key)
    if (g === undefined) {
      g = groundLift(J, qt / 100, qs / 100)
      if (memo.size > 4000) memo.clear()
      memo.set(key, g)
    }
    return g
  }
}
