/* Толпа: фигуры из props.glb (fig_m_* — мужчина в ихраме, fig_w_* — женщина в абае; пять уровней детализации)
   и пулы экземпляров — по одному на пол и уровень. Поза и цвета считает шейдер (shader.ts), процессор только
   кладёт по 32 числа на человека в буфер. Всё созданное здесь освобождается через disposePools. */
import {
  Color, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, FrontSide, InstancedBufferGeometry, InstancedInterleavedBuffer,
  InterleavedBufferAttribute, Matrix4, Mesh, MeshStandardMaterial, type BufferGeometry, type Object3D,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { isForbiddenNode } from '../../../lib/haram3d'
import { FIG_TIERS } from './budget'
import { FK_PAR, FK_PIV, FK_RUKU, jointsOf, type Joints } from './gait'
import {
  FIG_EMISSIVE, FIG_FRAG, FIG_FRAG_HEAD, FIG_MAIN, FIG_ROUGH, INST_ATTRS, INST_STRIDE, NUR_CENTER_HEX, NUR_EDGE_HEX, figHead, shaderMat,
} from './shader'

export interface FigSource {
  geo: BufferGeometry
  /** Мерки (плечо, локоть, суставы) — для шейдера */
  defines: Record<string, string>
  joints: Joints
}

export interface Pool {
  mesh: Mesh
  arr: Float32Array
  buf: InstancedInterleavedBuffer
  geo: InstancedBufferGeometry
  cap: number
  n: number
}

/** Мерки лица для нура (м, своя система фигуры; −z — вперёд). Сняты с геометрии fig_m_hi и fig_w_hi:
    лицо мужчины — z −0,154 (нос) … −0,10, глаза −0,13, губы −0,146; у женщины открытый овал z −0,133 … −0,072.
    Нур — от z −0,03 (середина головы, мягкий край) до −0,09 (полный); по высоте — от подбородка (шея + 0…4 см).
    front — плоскость, вровень с которой сглаживаются нос, губы и брови. oval — овал лица для цвета и мягкого края
    нура: центр на fy ниже глаз, полуоси rx, ry. У детей те же мерки — фигура лишь уменьшена */
const NUR_FACE = {
  z0: 0.03, z1: 0.09, y0: -0.005, y1: 0.035, cy: -0.02, cz: -0.03, front: { m: -0.12, w: -0.098 },
  oval: { m: { fy: -0.035, rx: 0.075, ry: 0.105 }, w: { fy: -0.03, rx: 0.068, ry: 0.095 } },
}

const glColor = (hex: number) => { const c = new Color(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})` }

const isMeshObj = (o: Object3D): o is Mesh => (o as Mesh).isMesh === true

/** Геометрия одной фигуры: все её сетки в системе корня, атрибуты aPart (кость·16 + материал, вес) и aSk (звено, вес) */
function figGeometry(root: Object3D): BufferGeometry | null {
  root.updateWorldMatrix(true, true)
  const inv = root.matrixWorld.clone().invert(), M = new Matrix4(), parts: BufferGeometry[] = []
  root.traverse(o => {
    if (!isMeshObj(o)) return
    const mm = /fig_m(\d+)/.exec((o.material as { name?: string }).name ?? '')
    const mt = mm ? shaderMat(Number(mm[1])) : -1
    if (mt < 0) return   // очки, брюки формы — не берём
    const g = o.geometry.clone().applyMatrix4(M.multiplyMatrices(inv, o.matrixWorld))
    const uv = g.attributes.uv, u1 = g.attributes.uv1, n = g.attributes.position.count
    if (!uv) { g.dispose(); return }
    const a = new Float32Array(n * 2), sk = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      a[i * 2] = Math.round(uv.getY(i)) * 16 + mt; a[i * 2 + 1] = uv.getX(i)
      sk[i * 2] = u1 ? Math.round(u1.getY(i)) : 0; sk[i * 2 + 1] = u1 ? u1.getX(i) : 1
    }
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k)
    g.setAttribute('aPart', new Float32BufferAttribute(a, 2))
    g.setAttribute('aSk', new Float32BufferAttribute(sk, 2))
    parts.push(g)
  })
  const merged = parts.length ? mergeGeometries(parts) : null
  for (const p of parts) p.dispose()
  return merged
}

/** Мерки из свойств корня в define шейдера */
function figDefines(u: Readonly<Record<string, unknown>>, J: Joints, woman: boolean): Record<string, string> {
  const D: Record<string, string> = {}
  for (const k of ['JX', 'JY', 'EX', 'EY', 'EZ']) D[k] = Number(u[k] ?? 0).toFixed(4)
  for (const [k, [y, z]] of Object.entries(J)) { D[`FK_${k}Y`] = y.toFixed(4); D[`FK_${k}Z`] = z.toFixed(4) }
  const ny = J.N[0], eye = Number(u.EYE ?? ny + 0.14), f = NUR_FACE
  D.NUR_Z0 = f.z0.toFixed(4); D.NUR_Z1 = f.z1.toFixed(4)
  D.NUR_Y0 = (ny + f.y0).toFixed(4); D.NUR_Y1 = (ny + f.y1).toFixed(4)
  D.NUR_CY = (eye + f.cy).toFixed(4); D.NUR_CZ = f.cz.toFixed(4); D.NUR_FRONT = f.front[woman ? 'w' : 'm'].toFixed(4)
  const ov = f.oval[woman ? 'w' : 'm']
  D.NUR_FY = (eye + ov.fy).toFixed(4); D.NUR_RX = ov.rx.toFixed(4); D.NUR_RY = ov.ry.toFixed(4)
  D.NUR_IN = glColor(NUR_CENTER_HEX); D.NUR_OUT = glColor(NUR_EDGE_HEX)
  return D
}

/** Фигура уровня tier из props.glb; узла нет, он не из толпы или мерок нет — null */
export function figSource(props: Object3D, woman: boolean, tier: string): FigSource | null {
  const name = `fig_${woman ? 'w' : 'm'}_${tier}`
  if (isForbiddenNode(name, { allowCrowd: true })) return null
  const root = props.getObjectByName(name)
  const joints = root ? jointsOf(root.userData) : null
  if (!root || !joints) return null
  const geo = figGeometry(root)
  return geo ? { geo, defines: figDefines(root.userData, joints, woman), joints } : null
}

/** Материал фигуры: стандартный three.js + наш шейдер (поза, цвета, нур) */
function figMaterial(woman: boolean, double: boolean, defines: Record<string, string>): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: double ? DoubleSide : FrontSide })
  ;(m as MeshStandardMaterial & { defines: Record<string, string> }).defines = { ...defines }
  m.customProgramCacheKey = () => 'crowd2' + (woman ? 'w' : 'm')
  m.onBeforeCompile = sh => {
    sh.vertexShader = figHead(FK_PAR, FK_PIV, FK_RUKU) + sh.vertexShader
      .replace('void main() {', 'void main() {' + FIG_MAIN)
      .replace('#include <begin_vertex>', 'vec3 transformed = figP;')
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = figN;')
    sh.fragmentShader = FIG_FRAG_HEAD + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>' + FIG_FRAG)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>' + FIG_ROUGH)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>' + FIG_EMISSIVE)
  }
  return m
}

/** Пул экземпляров одной фигуры: буфер на cap человек, рисуется ровно n */
function makePool(src: FigSource, woman: boolean, tierIdx: number, cap: number): Pool {
  const g = new InstancedBufferGeometry()
  g.index = src.geo.index
  for (const k of ['position', 'normal', 'aPart', 'aSk']) g.setAttribute(k, src.geo.attributes[k])
  const arr = new Float32Array(cap * INST_STRIDE)
  const buf = new InstancedInterleavedBuffer(arr, INST_STRIDE, 1).setUsage(DynamicDrawUsage)
  INST_ATTRS.forEach((k, i) => g.setAttribute(k, new InterleavedBufferAttribute(buf, 4, i * 4)))
  g.instanceCount = 0
  // вблизи видна изнанка подола и рукавов — двусторонний материал только для двух ближних уровней
  const mesh = new Mesh(g, figMaterial(woman, tierIdx < 2, src.defines))
  mesh.frustumCulled = false   // люди по всему матафу — отсекаем каждого сами (crowd.ts)
  mesh.name = `crowd_${woman ? 'w' : 'm'}_${FIG_TIERS[tierIdx]}`
  return { mesh, arr, buf, geo: g, cap, n: 0 }
}

export interface Pools {
  /** [мужчины, женщины][уровень] */
  pools: readonly (readonly Pool[])[]
  /** Мерки мужчины и женщины (для опускания на пол) */
  joints: readonly [Joints, Joints]
  meshes: readonly Mesh[]
}

/** Все пулы; хотя бы одной фигуры нет в props.glb — null (толпу не показываем, остаётся поток света) */
export function buildPools(props: Object3D, caps: readonly number[]): Pools | null {
  const srcs = [false, true].map(w => FIG_TIERS.map(t => figSource(props, w, t)))
  if (srcs.some(row => row.some(s => !s))) {
    for (const s of srcs.flat()) s?.geo.dispose()
    return null
  }
  const pools = srcs.map((row, w) => row.map((s, ti) => makePool(s as FigSource, w === 1, ti, caps[ti])))
  return {
    pools,
    joints: [(srcs[0][0] as FigSource).joints, (srcs[1][0] as FigSource).joints],
    meshes: pools.flat().map(p => p.mesh),
  }
}

/** Начать кадр: пулы пустые */
export function beginPools(p: Pools): void {
  for (const row of p.pools) for (const q of row) q.n = 0
}

/** Закончить кадр: отправить на видеокарту только занятую часть буфера */
export function flushPools(p: Pools): void {
  for (const row of p.pools) for (const q of row) {
    if (q.n) { q.buf.clearUpdateRanges(); q.buf.addUpdateRange(0, q.n * INST_STRIDE); q.buf.needsUpdate = true }
    q.geo.instanceCount = q.n
  }
}

/** Освободить геометрии и материалы (WebGL-буферы) всех пулов */
export function disposePools(p: Pools): void {
  for (const m of p.meshes) {
    m.geometry.dispose()
    ;(m.material as MeshStandardMaterial).dispose()
    m.removeFromParent()
  }
}
