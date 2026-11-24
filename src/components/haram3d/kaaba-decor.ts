/* Кааба вблизи: убранство кисвы (перенесено со старой страницы haram3d, тексты и расстановка — по сверке кисвы 23.11.2026,
   отчёт «Гид_паломника_Сверка_кисвы_23.11.2026.md», правки П1–П5). Хизам — 16 кусков с аятами, по 4 на стену, на высоте ≈ 8,7–9,65 м;
   под ним — 4 самадии (сура 112) на углах, 12 ламп и 6 рамок с аятами; ситара — kaaba-sitara.ts; жаккард — kaaba-shaders.ts;
   шазарван и Йеменский угол — подробные модели из props.glb; 60 позолоченных колец кисвы на скате шазарвана.
   Все размеры — из haram_meta.json → kaaba (их же использует сборка модели в Blender). */
import {
  Group, InstancedMesh, MeshStandardMaterial, Object3D, Vector2,
  type BufferGeometry, type CanvasTexture, type Material, type Mesh, type Vector3,
} from 'three'
import { toV3 } from './engine'
import { canvasH, circleText, diamond, embMat, readPx, wallPanel, type Wall } from './kaaba-emb'
import { drawLines, fitText, jacquardTexture, layoutText, patchGranite, patchKiswa, patchMarble } from './kaaba-shaders'
import { dressSitara } from './kaaba-sitara'
import { HIZAM, IKHLAS, LAMPS, UNDER_HIZAM } from './kaaba-texts'

/** haram_meta.json → kaaba: углы A (Чёрный камень), B (север), C (Йеменский), D (запад); door/sitara — [t0, t1, z0, z1, вынос] по стене A→B */
export interface KaabaMeta {
  A: readonly number[]; B: readonly number[]; C: readonly number[]; D: readonly number[]
  door: readonly number[]; sitara: readonly number[]; hizam: readonly number[]
  shad: { h: number; gap: readonly number[] }
}

export interface DecorInput {
  haram: Object3D
  kaaba: KaabaMeta
  /** Узел props.glb, если он разрешён (PROP_NODES, вера) и есть в файле */
  pick: (name: string) => Object3D | null
  /** Вырезать треугольники простого цоколя из haram.glb (как cutHaram в ours.ts) */
  cut: (mats: readonly string[], hit: (v: Vector3) => 0 | 1 | 2) => void
}

export interface KaabaDecor {
  group: Group
  /** То, чего нет в материалах группы: жаккард в uniform шейдера и буфер колец. Геометрию и холсты группы освобождает disposeTree */
  dispose(): void
}

/* ───── Шрифт ───── */

const AMIRI_URL = '/fonts/amiri-400.woff2'
const FONT_WAIT_MS = 4000

/** @font-face Amiri есть в styles/tokens.css; если его нет в документе — регистрируем тот же файл */
function ensureAmiri(fonts: FontFaceSet): void {
  let has = false
  fonts.forEach(f => { if (f.family.replace(/["']/g, '') === 'Amiri') has = true })
  if (!has && typeof FontFace === 'function') fonts.add(new FontFace('Amiri', `url(${AMIRI_URL}) format("woff2")`, { weight: '400', display: 'swap' }))
}

/** Дождаться Amiri перед рисованием холстов. true — загружен; false — нет (офлайн до кэша, долго) — рисуем запасным из K_FONT */
export async function kaabaFontReady(ms = FONT_WAIT_MS): Promise<boolean> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  if (!fonts || typeof fonts.load !== 'function') return false
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    ensureAmiri(fonts)
    const timeout = new Promise<false>(r => { timer = setTimeout(() => r(false), ms) })
    const faces = await Promise.race([fonts.load('bold 64px Amiri', 'الله'), timeout])
    return Array.isArray(faces) && faces.length > 0
  } catch {
    return false   // сеть или формат: не падаем, шитьё будет системным арабским шрифтом
  } finally {
    clearTimeout(timer)
  }
}

const v2 = (p: readonly number[]) => new Vector2(p[0], p[1])

/** Стены против часовой (нормаль наружу, u растёт слева направо для смотрящего): 0 — стена двери (A→B), 1 — стена Хиджра */
function kaabaWalls(k: KaabaMeta): Wall[] {
  const E = v2(k.A), N = v2(k.B), S = v2(k.C), W = v2(k.D)
  return [[E, N], [N, W], [W, S], [S, E]]
}

/* ───── Хизам ───── */

/** Доля стены под один кусок хизама (4 куска с полями 0,01 у углов) */
const HZ_PIECE = 0.245
const HZ_W = 768

/** Кусок хизама: рамка и аят — одной строкой или двумя ярусами, если одной мельче читаемого */
const hizamMat = (s: string, wM: number, hM: number) => {
  const h = canvasH(HZ_W, wM, hM), read = readPx(HZ_W, wM)
  return embMat(HZ_W, h, (x, w) => {
    x.lineWidth = 6; x.strokeRect(10, 12, w - 20, h - 24); x.lineWidth = 2; x.strokeRect(22, 22, w - 44, h - 44)
    drawLines(x, layoutText(x, s, w - 70, h - 56, 64, read), w / 2, h / 2 + 4)
  })
}

/** 16 кусков, по 4 на стену; кусок 1 — справа для смотрящего (письмо справа налево), t растёт слева направо */
function hizam(walls: Wall[], k: KaabaMeta): Mesh[] {
  return walls.flatMap((wall, i) => HIZAM[i].map((s, n) => {
    const l = wall[0].distanceTo(wall[1]), t1 = 0.99 - n * HZ_PIECE
    return wallPanel(wall, t1 - HZ_PIECE, t1, k.hizam[0], k.hizam[1], 0.03, hizamMat(s, l * HZ_PIECE, k.hizam[1] - k.hizam[0]))
  }))
}

/* ───── Под хизамом: самадии, лампы, рамки с аятами ───── */

/** Самадия: сура 112 в круге, вписанном в квадрат орнамента (уголки — ромбы) */
const samadMat = () => embMat(384, 384, (x, w, h) => {
  x.lineWidth = 6; x.strokeRect(8, 8, w - 16, h - 16)
  for (const [cx, cy] of [[30, 30], [w - 30, 30], [30, h - 30], [w - 30, h - 30]]) diamond(x, cx, cy, 14, 14)
  x.lineWidth = 16; x.beginPath(); x.arc(w / 2, h / 2, 174, 0, Math.PI * 2); x.stroke()
  x.lineWidth = 3; x.beginPath(); x.arc(w / 2, h / 2, 150, 0, Math.PI * 2); x.stroke()
  circleText(x, IKHLAS, w / 2, h / 2, 146, 50, 36, 24)
})

const lampMat = ([t1, t2]: readonly [string, string]) => embMat(256, 400, (x, w) => {
  x.lineWidth = 10; x.beginPath(); x.moveTo(w / 2, 22); x.lineTo(w - 36, 112); x.lineTo(w - 36, 296); x.quadraticCurveTo(w / 2, 410, 36, 296); x.lineTo(36, 112); x.closePath(); x.stroke()
  x.lineWidth = 3; x.beginPath(); x.moveTo(w / 2, 52); x.lineTo(w - 56, 124); x.lineTo(w - 56, 286); x.quadraticCurveTo(w / 2, 372, 56, 286); x.lineTo(56, 124); x.closePath(); x.stroke()
  fitText(x, t1, w - 90, 46); x.fillText(t1, w / 2, 170); fitText(x, t2, w - 90, 46); x.fillText(t2, w / 2, 245)
})

/** Рамка с аятом под хизамом: 2,0 × 1,2 м (в отчёте 2,2 м — сужено, чтобы не наезжать на соседние лампы) */
const AYA = { hw: 1.0, z0: 6.7, z1: 7.9, w: 640 }
const ayaMat = (s: string) => {
  const h = canvasH(AYA.w, AYA.hw * 2, AYA.z1 - AYA.z0), read = readPx(AYA.w, AYA.hw * 2)
  return embMat(AYA.w, h, (x, w) => {
    x.lineWidth = 8; x.strokeRect(10, 10, w - 20, h - 20); x.lineWidth = 2; x.strokeRect(26, 26, w - 52, h - 52)
    drawLines(x, layoutText(x, s, w - 80, h - 70, 56, read), w / 2, h / 2 + 3)
  })
}

const LAMP = { hw: 0.475, z0: 6.55, z1: 8.05 }
/** Самадия у угла a стены: центр в 0,6 м от угла, 1,0 × 1,0 м (не заходит под ситару, она начинается в 1,105 м от камня) */
const SAMAD = { at: 0.6, hw: 0.5, z0: 6.8, z1: 7.8 }
/** Стена двери — 3 лампы правее ситары; стены 1–3 — лампа, рамка [1], лампа, рамка [0], лампа (рамка [0] — правее).
    Порядок и места — допущение отчёта (П2), по фото не проверено. Плиту-посвящение на стене двери не рисуем */
const DOOR_LAMPS = [0.55, 0.69, 0.83]
const ROW: readonly (readonly [number, 'L' | 0 | 1])[] = [[0.2, 'L'], [0.35, 1], [0.5, 'L'], [0.65, 0], [0.8, 'L']]

function underHizam(walls: Wall[]): Mesh[] {
  const samad = samadMat(), lamps = LAMPS.map(lampMat), out: Mesh[] = []
  walls.forEach((wall, i) => {
    const l = wall[0].distanceTo(wall[1])
    const at = (t: number, hw: number, z0: number, z1: number, m: MeshStandardMaterial) => out.push(wallPanel(wall, t - hw / l, t + hw / l, z0, z1, 0.06, m))
    at(SAMAD.at / l, SAMAD.hw, SAMAD.z0, SAMAD.z1, samad)   // 4 стены → 4 угла: камень, Иракский, Шами, Йеменский
    if (i === 0) { DOOR_LAMPS.forEach((t, k) => at(t, LAMP.hw, LAMP.z0, LAMP.z1, lamps[k])); return }
    ROW.forEach(([t, s], k) => (s === 'L' ? at(t, LAMP.hw, LAMP.z0, LAMP.z1, lamps[(k / 2) % 3])
      : at(t, AYA.hw, AYA.z0, AYA.z1, ayaMat(UNDER_HIZAM[i][s]))))
  })
  return out
}

/* ───── Шазарван, Йеменский угол, кольца ───── */

/** Простой цоколь из haram.glb: мрамор в полосе 0,6 м снаружи стен ниже 0,35 м (его место займёт шазарван из props.glb) */
const plinthHit = (walls: Wall[]) => (v: Vector3): 0 | 1 | 2 => {
  if (v.y > 0.35) return 0
  for (const [a, b] of walls) {
    const l = a.distanceTo(b), ex = (b.x - a.x) / l, ey = (b.y - a.y) / l, px = v.x - a.x, py = -v.z - a.y
    const t = px * ex + py * ey, d = px * ey - py * ex
    if (t > -0.45 && t < l + 0.45 && d > -0.1 && d < 0.6) return v.y > 0.01 ? 2 : 1
  }
  return 0
}

/** Материалы подробных моделей: кисва подвёрнута аркой до ≈ 2,3 м, край — валик с кантом; мрамор и гранит — свой узор */
function tuneStone(root: Object3D): void {
  root.traverse(o => {
    if (!(o as Mesh).isMesh) return
    const m = (o as Mesh).material as MeshStandardMaterial
    if (m.name === 'yemeni_hem') { m.envMapIntensity = 0.35; m.roughness = 0.86 }
    if (m.name === 'yemeni_band') { m.emissive.set(0x2a1f08); m.emissiveIntensity = 0.2; m.envMapIntensity = 1.3 }
    if (m.name === 'shazarwan_marble') { m.envMapIntensity = 1.05; patchMarble(m) }
    if (m.name === 'yemeni_granite') { m.envMapIntensity = 1.1; patchGranite(m) }
  })
}

/** Шазарван: плиты ≈ 1 м, скат от стены (0,26 м) к скруглённому носу (0,35 м); у стены Хиджра его нет, под дверью разрыв.
    Модель уже в координатах Каабы — ставится как есть. Йеменский угол — в угол C */
function placeStone(inp: DecorInput, walls: Wall[], out: Group): void {
  const shaz = inp.pick('shazarwan'), yem = inp.pick('yemeni')
  if (shaz) { inp.cut(['marble'], plinthHit(walls)); tuneStone(shaz); out.add(shaz) }
  if (yem) { yem.position.copy(toV3(inp.kaaba.C[0], inp.kaaba.C[1])); tuneStone(yem); out.add(yem) }
}

/** Позолоченные кольца кисвы — 60 шт. (S1 «Умм аль-Кура» 10.07.2024; отчёт П5, сверка 23.11.2026): шаг ≈ 0,53 м по скату шазарвана;
    у стены Хиджра шазарвана нет, под дверью — разрыв. На числах модели выходит ровно 60 (тест) */
const RING_STEP = 0.53
function rings(geo: BufferGeometry, walls: Wall[], k: KaabaMeta): InstancedMesh {
  const RO = 0.12, RZ = 0.255 - 0.51 * (RO - 0.03) + 0.07   // центр кольца над скатом шазарвана
  const at: [number, number, number, number][] = []
  walls.forEach(([a, b], i) => {
    if (i === 1) return
    const l = a.distanceTo(b), n = Math.round(l / RING_STEP), nx = (b.y - a.y) / l, ny = -(b.x - a.x) / l
    for (let j = 0; j < n; j++) {
      const m = (j + 0.5) / n * l
      if (i === 0 && m > k.shad.gap[0] - 0.15 && m < k.shad.gap[1] + 0.15) continue
      const p = a.clone().lerp(b, m / l)
      at.push([p.x + nx * RO, p.y + ny * RO, nx, ny])
    }
  })
  const gilded = new MeshStandardMaterial({ color: 0xd4af37, metalness: 1, roughness: 0.3, envMapIntensity: 1.3 })
  const im = new InstancedMesh(geo, gilded, at.length), o3 = new Object3D()
  at.forEach(([x, y, nx, ny], i) => { o3.position.copy(toV3(x, y, RZ)); o3.lookAt(o3.position.clone().add(toV3(nx, ny, 0))); o3.updateMatrix(); im.setMatrixAt(i, o3.matrix) })
  return im
}

/** Кисва: жаккард (sheen и цвет — в tuneHaram, ours.ts) */
function dressKiswa(haram: Object3D, jac: CanvasTexture): void {
  haram.traverse(o => {
    const m = (o as Mesh).isMesh ? (o as Mesh).material as Material : null
    if (m?.name === 'kiswa') patchKiswa(m, jac)
  })
}

/** Собрать убранство Каабы. Холсты рисуются сразу — шрифт ждать заранее (kaabaFontReady) */
export function buildKaabaDecor(inp: DecorInput): KaabaDecor {
  const walls = kaabaWalls(inp.kaaba)
  const group = new Group()
  group.name = 'kaaba-decor'
  const jac = jacquardTexture()
  dressKiswa(inp.haram, jac)
  dressSitara(inp.haram, inp.kaaba)
  group.add(...hizam(walls, inp.kaaba), ...underHizam(walls))
  placeStone(inp, walls, group)
  const ring = inp.pick('kiswa_ring') as Mesh | null
  const im = ring?.isMesh ? rings(ring.geometry.clone(), walls, inp.kaaba) : null
  if (im) group.add(im)
  return { group, dispose: () => { jac.dispose(); im?.dispose() } }
}
