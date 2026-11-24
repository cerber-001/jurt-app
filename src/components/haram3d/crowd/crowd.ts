/* Толпа «Харама заранее»: таваф (против часовой стрелки по кольцам, Кааба слева; дети за руку; истилям на линии
   Чёрного камня) и сай (Сафа ↔ Марва в обе стороны; между зелёными огнями мужчины идут быстрым шагом).
   Вера: это обычные паломники, у всех вместо лица — нур (shader.ts); героя «Вы», полиции, птиц и стаканов здесь нет.
   Каждый кадр: продвинуть людей → посчитать позы → развести столкновения → отсечь невидимых → разложить по уровням
   детализации. При «уменьшить движение» люди стоят; пересчёт — только когда двигается камера. */
import {
  BoxGeometry, Color, Frustum, Group, Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Sphere, Vector3, type Camera, type Object3D,
} from 'three'
import type { P2 } from '../../../lib/haram3d'
import { crowdBudget, tierOf, type CrowdBudget, type DeviceHints } from './budget'
import { beginPools, buildPools, disposePools, flushPools, type Pools } from './figures'
import { brisk, groundCache, stride, type ArmAngles, type Stride } from './gait'
import {
  GREEN_LEN, GREEN_MID, along, hullPoints, hullRing, saiAxis, saiPoint, saiSpeed, saiWalkers, stoneGesture,
  tawafDistances, tawafWalkers, type Gesture, type Look, type Pt, type SaiAxis, type Walker,
} from './lanes'
import { BlobBatch } from './blobs'
import { HaloBatch, HeadOf } from './halo'
import { saiPushOut, tawafPushOut } from './obstacles'
import { INST_STRIDE } from './shader'
import { Solver } from './solve'

export interface CrowdMeta {
  lanes: { d: number }[]
  spots: Record<string, number[]>
  /** Линия Чёрного камня: [угол камня, зелёная лампа] */
  start?: readonly (readonly number[])[]
  /** Углы Каабы; A — угол Чёрного камня, C — Йеменский */
  kaaba?: { A: readonly number[]; B: readonly number[]; C: readonly number[]; D: readonly number[] }
}

export interface CrowdHandle {
  group: Group
  update(dt: number): void
  dispose(): void
  /** Сколько людей в толпе (таваф и сай, с детьми) */
  readonly count: number
  /** Свет сцены изменился: сила пятен-теней под ногами и их сдвиг от солнца (м на рост 1, three.js x/z) */
  setLight(blob: number, shift: readonly [number, number]): void
}

/** Общий темп: чуть быстрее настоящего шага (×1,3), чтобы движение читалось на экране */
const SPEED = 1.6
const SAI_SPEED = 1.3
/** Пол нижнего яруса Масъа */
const SAI_FLOOR = 0.08
/** Ребёнок идёт в 0,8 м слева от взрослого — так руки сходятся */
const KID_D = 0.8
const R_ADULT = 0.25, R_KID = 0.17
/** Шаг (радиан фазы на метр): обычный и быстрый */
const STEP_WALK = 4.8, STEP_KID = 6.2, STEP_BRISK = 3.6
const HOLD_ADULT: ArmAngles = [0.05, 0.12, 0.1, 0]
const HOLD_KID: ArmAngles = [0.05, 1.12, 0.05, 0]

const faceTo = (dx: number, dy: number) => Math.atan2(-dx, dy)
const lerpAng = (a: number, b: number, e: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * e
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Цвета человека в линейном пространстве (для шейдера): одежда, кожа, волосы/хиджаб */
function lin(look: Look): Float32Array {
  const c = new Color(), out = new Float32Array(9)
  ;[look.cloth, look.skin, look.hair].forEach((h, i) => { c.setHex(h); out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b })
  return out
}

/** Одна запись человека в кадре (32 числа, как в буфере экземпляров; x и z дописываются после решателя) */
interface Pose { x: number; y: number; h: number; rot: number; tilt: number; st: Stride; R: ArmAngles; L: ArmAngles; cover: number }

class Stage {
  readonly data: Float32Array
  readonly woman: Uint8Array
  readonly slot: Int32Array
  readonly solver: Uint8Array
  n = 0
  constructor(cap: number) {
    this.data = new Float32Array(cap * INST_STRIDE); this.woman = new Uint8Array(cap)
    this.slot = new Int32Array(cap); this.solver = new Uint8Array(cap)
  }
}

/** Записать человека в кадр: место, рост, цвета, внешность, поза, руки */
function stagePut(S: Stage, look: Look, col: Float32Array, p: Pose, lift: number, slot: number, solver: number): void {
  const i = S.n++, o = i * INST_STRIDE, a = S.data
  S.woman[i] = look.woman ? 1 : 0; S.slot[i] = slot; S.solver[i] = solver
  a[o] = p.x; a[o + 1] = p.h; a[o + 2] = -p.y; a[o + 3] = p.rot
  a[o + 4] = col[0]; a[o + 5] = col[1]; a[o + 6] = col[2]; a[o + 7] = look.sc
  a[o + 8] = col[3]; a[o + 9] = col[4]; a[o + 10] = col[5]; a[o + 11] = lift
  a[o + 12] = col[6]; a[o + 13] = col[7]; a[o + 14] = col[8]; a[o + 15] = 0
  a[o + 16] = look.woman ? 1 : look.hairLen; a[o + 17] = look.beard ? 1 : 0; a[o + 18] = p.cover; a[o + 19] = look.woman ? 1 : 0
  a[o + 20] = p.tilt; a[o + 21] = p.st.fsw; a[o + 22] = 0; a[o + 23] = 0
  for (let k = 0; k < 4; k++) { a[o + 24 + k] = p.R[k]; a[o + 28 + k] = p.L[k] }
}

/** Признаки устройства для бюджета толпы */
export function deviceHints(): DeviceHints {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return {
    coarse: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    minSide: Math.min(innerWidth, innerHeight),
    cores: nav.hardwareConcurrency || 0,
    memory: nav.deviceMemory || 0,
  }
}

/** Зелёные огни сая: две светящиеся полосы поперёк пути и лёгкая зелёная дорожка между ними (место — приблизительно) */
function greenZone(ax: SaiAxis): Group {
  const g = new Group(), h = GREEN_LEN / 2 / ax.len, rot = faceTo(ax.ux, ax.uy)
  const bar = new BoxGeometry(18.2, 0.06, 0.5), barM = new MeshBasicMaterial({ color: 0x4dff8a, toneMapped: false })
  for (const q of [GREEN_MID - h, GREEN_MID + h]) {
    const m = new Mesh(bar, barM), p = saiPoint(ax, q, 0)
    m.position.set(p[0], SAI_FLOOR + 0.04, -p[1]); m.rotation.y = rot
    g.add(m)
  }
  const strip = new Mesh(new PlaneGeometry(18.2, GREEN_LEN), new MeshBasicMaterial({ color: 0x4dff8a, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }))
  const c = saiPoint(ax, GREEN_MID, 0)
  strip.position.set(c[0], SAI_FLOOR + 0.02, -c[1]); strip.rotation.set(-Math.PI / 2, 0, rot, 'YXZ')
  g.add(strip)
  g.name = 'sai_green'
  return g
}

interface Ctx {
  meta: CrowdMeta
  budget: CrowdBudget
  pools: Pools
  tawaf: Walker[]
  sai: Walker[]
  ax: SaiAxis | null
  cols: Map<Look, Float32Array>
  lift: [(t: number, s: number) => number, (t: number, s: number) => number]
  stone: { a: P2; dir: P2 } | null
  KE: P2
  KS: P2
  maqam: P2 | null
}

const colOf = (c: Ctx, l: Look) => { let v = c.cols.get(l); if (!v) { v = lin(l); c.cols.set(l, v) } return v }
const liftOf = (c: Ctx, l: Look, tilt: number, st: Stride) => c.lift[l.woman ? 1 : 0](tilt, st.fsw)

const P: Pt = { x: 0, y: 0, tx: 0, ty: 0 }, PA: Pt = { x: 0, y: 0, tx: 0, ty: 0 }, PB: Pt = { x: 0, y: 0, tx: 0, ty: 0 }
const G: Gesture = { turn: 0, up: 0, kiss: 0 }

/** Место идущего тавафа: дорожка, сдвиг, очередь у Чёрного камня (по стене), огибание ограды Макама */
function tawafSpot(c: Ctx, w: Walker): [number, number, number, number] {
  const p = along(w.ring, w.q, P), l = Math.hypot(p.tx, p.ty) || 1, fx = p.tx / l, fy = p.ty / l
  let o = w.off
  if (w.ring.wall) o = Math.max(0, o) + 1.3 * clamp01((8.5 - Math.hypot(p.x - c.KE[0], p.y - c.KE[1])) / 4)
  let x = p.x + fy * o, y = p.y - fx * o   // (fy, −fx) — правая сторона, наружу
  if (c.maqam) {
    const dx = x - c.maqam[0], dy = y - c.maqam[1], dm = Math.hypot(dx, dy)
    if (dm < 3.2) { const k = (1.6 + dm * 0.5) / (dm || 1); x = c.maqam[0] + dx * k; y = c.maqam[1] + dy * k }
  }
  return [x, y, fx, fy]
}

/** Поза идущего тавафа: шаг накрест, жест к камню, у Йеменского угла — рука к стене */
function tawafPose(c: Ctx, w: Walker, x: number, y: number, fx: number, fy: number, motion: boolean): Pose {
  let rot = faceTo(fx, fy)
  if (c.stone) stoneGesture(c.stone.a, c.stone.dir, x, y, fx, fy, G); else G.turn = G.up = G.kiss = 0
  if (G.turn) rot = lerpAng(rot, faceTo(c.stone!.a[0] - x, c.stone!.a[1] - y), 0.6 * G.turn)
  const yem = Math.hypot(x - c.KS[0], y - c.KS[1]) < 2.8 && w.ring.d < 4.5 ? (w.ring.d < 2.6 ? 1 : 0.6) : 0
  const k = Math.max(G.up, G.kiss), sw = motion ? (1 - Math.max(k, yem)) * Math.sin(w.ph) * 0.32 : 0
  const st = stride(sw)
  let R: ArmAngles, L: ArmAngles
  if (k > 0.01) {   // ладони к камню на уровне плеч → к губам
    const a = 1.35 * G.up + 0.6 * G.kiss, b = 0.14 * G.up + 0.05 * G.kiss, e = 0.3 * G.up + 2.4 * G.kiss, m = 1 - k
    R = [a + m * st.right[0], b + m * 0.08, e + m * 0.3, 0]
    L = w.kid ? HOLD_ADULT : [a + m * st.left[0], b + m * 0.08, e + m * 0.3, 0]
  } else {
    const kk = yem * 0.35
    R = [kk * 2.3 + st.right[0], 0.05 + kk * 0.43 - yem * 1.3, st.right[2] + yem * 0.4, 0]
    L = w.kid ? HOLD_ADULT : st.left
  }
  return { x, y, h: 0, rot, tilt: 0, st, R, L, cover: w.look.woman ? 1 : 0 }
}

/** Ребёнок слева от взрослого, правой рукой держит его левую; шагает чаще */
function kidPose(w: Walker, x: number, y: number, fx: number, fy: number, h: number, motion: boolean): Pose {
  const st = stride(motion ? Math.sin(w.ph * (STEP_KID / STEP_WALK)) * 0.3 : 0), k = w.kid as Look
  return { x: x - fy * KID_D, y: y + fx * KID_D, h, rot: faceTo(fx, fy), tilt: 0, st, R: HOLD_KID, L: st.left, cover: k.woman ? 1 : 0 }
}

/** Сай: поза по петле; между зелёными огнями мужчины — быстрым шагом (корпус чуть вперёд, лёгкий подскок) */
function saiPose(w: Walker, fast: boolean, motion: boolean): Pose {
  const p = along(w.ring, w.q, P), x = p.x, y = p.y
  const a = along(w.ring, w.q + 1.2, PA), b = along(w.ring, w.q - 1.2, PB)   // направление по соседям — разворот у холма плавный
  const rot = faceTo(a.x - b.x, a.y - b.y), s = Math.sin(w.ph)
  const st = motion ? (fast ? brisk(s * 0.6) : stride(s * 0.32)) : stride(0)
  const h = SAI_FLOOR + (motion && fast ? Math.abs(s) * 0.06 : 0)
  return { x, y, h, rot, tilt: motion && fast ? -0.15 : 0, st, R: w.kid ? HOLD_ADULT : st.right, L: w.kid ? HOLD_ADULT : st.left, cover: 1 }
}

/** Продвинуть всех на dt секунд (фаза шага копится по пройденному пути) */
function advance(c: Ctx, dt: number): void {
  for (const w of c.tawaf) { const ds = dt * w.v * SPEED; w.q += ds; w.ph += ds * STEP_WALK }
  if (!c.ax) return
  for (const w of c.sai) {
    const p = along(w.ring, w.q, P), f = saiSpeed(c.ax, w, p.x, p.y), ds = dt * w.v * SAI_SPEED * f
    w.q += ds; w.ph += ds * (f > 1 ? STEP_BRISK : STEP_WALK)
  }
}

export interface CrowdOpts {
  props: Object3D
  meta: CrowdMeta
  camera: Camera
  reducedMotion: boolean
  hints?: DeviceHints
}

/** Линия Чёрного камня: от угла камня к зелёной лампе, направление единичное */
function stoneLine(st: CrowdMeta['start']): { a: P2; dir: P2 } | null {
  if (!st || st.length < 2) return null
  const dx = st[1][0] - st[0][0], dy = st[1][1] - st[0][1], l = Math.hypot(dx, dy) || 1
  return { a: [st[0][0], st[0][1]], dir: [dx / l, dy / l] }
}

const p2 = (v: readonly number[]): P2 => [v[0], v[1]]

/** Собрать толпу; фигур нет в props.glb, нет углов Каабы или файл неожиданный — null (остаётся поток света, окно не падает) */
export function createCrowd(o: CrowdOpts): CrowdHandle | null {
  try { return buildCrowd(o) } catch { return null }
}

function buildCrowd(o: CrowdOpts): CrowdHandle | null {
  const k = o.meta.kaaba
  if (!k) return null
  const budget = crowdBudget(o.hints ?? deviceHints())
  const pools = buildPools(o.props, budget.caps)
  if (!pools) return null
  const corners: P2[] = [p2(k.A), p2(k.B), p2(k.C), p2(k.D)], hull = hullPoints(corners)
  const rings = tawafDistances(o.meta.lanes.map(l => l.d)).map(d => hullRing(hull, d))
  const sp = o.meta.spots, ax = sp.safa && sp.marwa ? saiAxis([sp.safa[0], sp.safa[1]], [sp.marwa[0], sp.marwa[1]]) : null
  const stone = stoneLine(o.meta.start)
  const c: Ctx = {
    meta: o.meta, budget, pools, ax, stone, KE: corners[0], KS: corners[2],
    tawaf: tawafWalkers(rings, budget.density), sai: ax ? saiWalkers(ax, budget.sai) : [],
    cols: new Map(), lift: [groundCache(pools.joints[0]), groundCache(pools.joints[1])],
    maqam: sp.maqam ? [sp.maqam[0], sp.maqam[1]] : null,
  }
  return assemble(c, o, corners)
}

/** Таваф в кадре: позы, места в решателе, дети за руку рядом со взрослым */
function stageTawaf(c: Ctx, S: Stage, sol: Solver, motion: boolean, jump: boolean): void {
  c.tawaf.forEach((w, i) => {
    const [x, y, fx, fy] = tawafSpot(c, w), p = tawafPose(c, w, x, y, fx, fy, motion)
    const a = sol.add(x, y, R_ADULT, i * 2, jump)
    stagePut(S, w.look, colOf(c, w.look), p, liftOf(c, w.look, 0, p.st), a, 0)
    if (!w.kid) return
    const kp = kidPose(w, x, y, fx, fy, 0, motion), b = sol.add(kp.x, kp.y, R_KID, i * 2 + 1, jump)
    sol.pair(a, b)
    stagePut(S, w.kid, colOf(c, w.kid), kp, liftOf(c, w.kid, 0, kp.st), b, 0)
  })
}

/** Сай в кадре: между зелёными огнями мужчины — быстрым шагом */
function stageSai(c: Ctx, S: Stage, sol: Solver, motion: boolean, jump: boolean): void {
  c.sai.forEach((w, i) => {
    const p0 = along(w.ring, w.q, P), fast = !!c.ax && saiSpeed(c.ax, w, p0.x, p0.y) > 1
    const p = saiPose(w, fast, motion), a = sol.add(p.x, p.y, R_ADULT, i * 2, jump)
    stagePut(S, w.look, colOf(c, w.look), p, liftOf(c, w.look, p.tilt, p.st), a, 1)
    if (!w.kid) return
    const fx = -Math.sin(p.rot), fy = Math.cos(p.rot), kp = kidPose(w, p.x, p.y, fx, fy, SAI_FLOOR, motion)
    const b = sol.add(kp.x, kp.y, R_KID, i * 2 + 1, jump)
    sol.pair(a, b)
    stagePut(S, w.kid, colOf(c, w.kid), kp, liftOf(c, w.kid, 0, kp.st), b, 1)
  })
}

const FRU = new Frustum(), FM = new Matrix4(), SPH = new Sphere(new Vector3(), 1.2)

/** Ореолы нура и пятна-тени: по одному на каждого нарисованного человека, голова — по мерке мужчины или женщины */
interface Halos { batch: HaloBatch; heads: readonly [HeadOf, HeadOf]; blobs: BlobBatch }

/** Разложить по пулам: только видимых камерой (сфера вокруг человека), ближних — подробнее; уровень полон — в следующий.
    Каждому нарисованному — ореол (расстояние до камеры — то же, по которому выбран уровень) */
function drawPools(c: Ctx, S: Stage, sols: readonly [Solver, Solver], cam: Camera, H: Halos): void {
  cam.updateMatrixWorld()
  FRU.setFromProjectionMatrix(FM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse))
  const cp = cam.position, d = S.data
  beginPools(c.pools); H.batch.begin(); H.blobs.begin()
  for (let i = 0; i < S.n; i++) {
    const o2 = i * INST_STRIDE, sol = sols[S.solver[i]], s = S.slot[i]
    if (s >= 0) { d[o2] = sol.x[s]; d[o2 + 2] = -sol.y[s] }
    SPH.center.set(d[o2], d[o2 + 1] + 0.9, d[o2 + 2])
    if (!FRU.intersectsSphere(SPH)) continue
    const row = c.pools.pools[S.woman[i]], dx = d[o2] - cp.x, dy = d[o2 + 1] - cp.y, dz = d[o2 + 2] - cp.z
    const d2 = dx * dx + dy * dy + dz * dz
    let t = tierOf(d2)
    while (t < row.length - 1 && row[t].n >= row[t].cap) t++
    const q = row[t]
    if (q.n >= q.cap) continue
    q.arr.set(d.subarray(o2, o2 + INST_STRIDE), q.n++ * INST_STRIDE)
    const dist = Math.sqrt(d2)
    H.batch.push(d, o2, H.heads[S.woman[i]], dist)
    H.blobs.push(d, o2, dist)
  }
  flushPools(c.pools); H.batch.flush(); H.blobs.flush()
}

function disposeGroup(g: Group | null): void {
  g?.traverse(m => { const mm = m as Mesh; if (mm.isMesh) { mm.geometry.dispose(); (mm.material as MeshBasicMaterial).dispose() } })
}

function assemble(c: Ctx, o: CrowdOpts, corners: readonly P2[]): CrowdHandle {
  const group = new Group()
  group.name = 'crowd'
  for (const m of c.pools.meshes) group.add(m)
  const green = c.ax ? greenZone(c.ax) : null
  if (green) group.add(green)
  const nT = c.tawaf.length + c.tawaf.filter(w => w.kid).length, nS = c.sai.length + c.sai.filter(w => w.kid).length
  const H: Halos = {
    batch: new HaloBatch(nT + nS), heads: [new HeadOf(c.pools.joints[0]), new HeadOf(c.pools.joints[1])], blobs: new BlobBatch(nT + nS),
  }
  group.add(H.batch.mesh, H.blobs.mesh)
  const solT = new Solver(nT, { x0: -70, y0: -70, w: 140, h: 140 }, nT)
  const solS = new Solver(Math.max(1, nS), { x0: 70, y0: -100, w: 90, h: 420 }, Math.max(1, nS))
  const pushT = tawafPushOut(corners, c.maqam ?? [1e6, 1e6]), pushS = c.ax ? saiPushOut(c.ax) : null
  const S = new Stage(nT + nS)
  const sols = [solT, solS] as const, lastCam = new Matrix4()
  const motion = !o.reducedMotion
  let jump = true, drawn = false

  const stageAll = () => {
    S.n = 0; solT.begin(); solS.begin()
    stageTawaf(c, S, solT, motion, jump)
    stageSai(c, S, solS, motion, jump)
    solT.solve(c.budget.solveIters, pushT)
    if (pushS) solS.solve(c.budget.solveIters, pushS)
    jump = false
  }

  return {
    group,
    count: nT + nS,
    update(dt) {
      if (typeof document !== 'undefined' && document.hidden) return   // вкладка скрыта — не считаем
      if (!motion) {   // люди стоят: позы один раз, раскладка — только когда двигается камера
        o.camera.updateMatrixWorld()
        if (drawn && lastCam.equals(o.camera.matrixWorld)) return
        lastCam.copy(o.camera.matrixWorld)
        if (!drawn) stageAll()
        drawPools(c, S, sols, o.camera, H); drawn = true
        return
      }
      advance(c, dt)
      stageAll()
      drawPools(c, S, sols, o.camera, H)
    },
    setLight(blob, shift) { H.blobs.setLight(blob, shift) },   // форма — в uniform: раскладку пересчитывать не нужно
    dispose() {
      disposePools(c.pools)
      H.batch.dispose()
      H.blobs.dispose()
      disposeGroup(green)
      group.clear()
    },
  }
}

