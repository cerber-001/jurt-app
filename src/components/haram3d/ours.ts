/* Этап 1а: «Наша модель» — Харам JURT из трёх glb (Кааба и мечеть, святыни из props.glb, город по OSM).
   Работает без сети после первого открытия: файлы /haram3d/v1/ кэширует service worker (vite.config.ts → haram3d-model-v1).
   Люди тавафа и сая — модуль crowd/ (у всех вместо лица нур, без черт); если фигур в props.glb нет —
   таваф и сай показаны светом, потоком мягких точек. */
import {
  BufferAttribute, BufferGeometry, CanvasTexture, Group, NormalBlending, Points, PointsMaterial, Vector3,
  type Material, type Mesh, type MeshPhysicalMaterial, type MeshStandardMaterial, type Object3D,
} from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { KAABA_CENTER, MODEL_BASE, PROP_NODES, isForbiddenNode, saiEnds, toCcw, type P2 } from '../../lib/haram3d'
import { disposeTree, glowTexture, toV3, type Engine, type LayerHandle } from './engine'
import { buildKaabaDecor, kaabaFontReady, type KaabaMeta } from './kaaba-decor'
import { createCrowd } from './crowd/crowd'
import { blobShift } from './crowd/blobs'

interface Meta {
  lanes: { d: number; pts: P2[] }[]
  spots: Record<string, number[]>
  /** Линия Чёрного камня: угол камня → зелёная лампа (жест истилям у толпы) */
  start?: number[][]
  /** Углы, дверь, ситара, хизам, шазарван — для убранства Каабы (kaaba-decor.ts); нет — Кааба без убранства */
  kaaba?: KaabaMeta
}

export interface OursHandle {
  /** Спрятать верхние ярусы и крышу Масъа (вид «Сай»): путь саи виден сверху */
  setCut(on: boolean): void
}

/** Окно закрыли, пока модель грузилась */
const aborted = () => new DOMException('3D закрыто до конца загрузки', 'AbortError')

/** Сцены glb: заголовок хорош только для haram.glb, остальные — с Draco.
    signal: окно закрыли — fetch отменяется, а то, что GLTFLoader всё же успел собрать, освобождается здесь же */
async function loadAll(signal: AbortSignal): Promise<[GLTF, GLTF, GLTF, Meta]> {
  const draco = new DRACOLoader().setDecoderPath(MODEL_BASE + 'draco/')
  const loader = new GLTFLoader().setDRACOLoader(draco)
  // GLTFLoader не принимает signal — отмену проверяем, когда каждый файл собран.
  // gaveUp: Promise.all уже упал на другом файле — пришедшее позже тоже освобождаем, а не теряем
  let gaveUp = false
  const loaded: GLTF[] = []
  const glb = (f: string) => loader.loadAsync(MODEL_BASE + f).then(g => {
    if (signal.aborted || gaveUp) { disposeTree(g.scene); throw aborted() }
    loaded.push(g)
    return g
  })
  try {
    const all = await Promise.all([
      glb('haram.glb'),
      glb('props.glb'),
      glb('haram_city.glb'),
      fetch(MODEL_BASE + 'haram_meta.json', { signal })
        .then(r => { if (!r.ok) throw new Error('haram_meta.json: ' + r.status); return r.json() as Promise<Meta> }),
    ])
    if (signal.aborted) throw aborted()
    return all
  } catch (e) {
    gaveUp = true
    for (const g of loaded) disposeTree(g.scene)   // часть файлов пришла, часть нет (или окно закрыли) — не держим в памяти
    throw e
  } finally {
    draco.dispose()   // воркеры декодера больше не нужны
  }
}

const isMesh = (o: Object3D): o is Mesh => (o as Mesh).isMesh === true
const matOf = (o: Mesh) => o.material as MeshStandardMaterial

/** Материалы Каабы и мечети — как на старой странице, без сложных шейдеров */
function tuneHaram(root: Object3D) {
  root.traverse(o => {
    if (!isMesh(o)) return
    const m = matOf(o)
    m.flatShading = !['kiswa', 'gold'].includes(m.name)
    if (m.name === 'kiswa') {   // чёрный бархат: почти не отражает, лишь мягкий ворсовый отсвет (sheen, KHR_materials_sheen) на ребре
      m.color.set(0x0b0c0d); m.roughness = 0.82; m.metalness = 0; m.envMapIntensity = 0.35
      const p = m as MeshPhysicalMaterial
      if (p.sheenColor) { p.sheen = 0.7; p.sheenRoughness = 0.6; p.sheenColor.set(0x262626) }
    }
    if (m.name === 'gold') { m.color.set(0xd4af37); m.metalness = 1; m.roughness = 0.26; m.emissive.set(0x3a2a08); m.emissiveIntensity = 0.25; m.envMapIntensity = 1.4 }
    if (m.name === 'start') m.emissive.set(0xf07a1e)
    if (m.name === 'glass') { m.flatShading = false; m.transparent = true; m.opacity = 0.28; m.depthWrite = false; m.roughness = 0.05; m.envMapIntensity = 1.6; o.renderOrder = 2 }
    if (m.name === 'granite') { m.flatShading = false; m.roughness = 0.3; m.envMapIntensity = 1.2 }
    m.needsUpdate = true
  })
}

/** Вырезать треугольники простых версий святынь, запечённых в haram.glb, — их место займут подробные из props.glb.
    hit(v) по мировой вершине: 0 — не трогать, 1 — можно вместе с другими, 2 — режем треугольник */
function cutHaram(root: Object3D, mats: readonly string[], hit: (v: Vector3) => 0 | 1 | 2) {
  const v = new Vector3()
  root.updateMatrixWorld(true)
  root.traverse(o => {
    if (!isMesh(o) || !mats.includes(matOf(o).name)) return
    const g = o.geometry, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count
    const keep: number[] = []
    const h = (i: number) => { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); return hit(v) }
    let cut = 0
    for (let t = 0; t < n; t += 3) {
      const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2
      const k = [h(a), h(b), h(c)]
      if (k.every(x => x) && k.some(x => x === 2)) { cut++; continue }
      keep.push(a, b, c)
    }
    if (cut) { g.setIndex(keep); g.clearGroups() }
  })
}

/** Узел props.glb — только из списка PROP_NODES и не запрещённый верой */
const pickProp = (props: Object3D, n: string): Object3D | null =>
  (PROP_NODES.includes(n) && !isForbiddenNode(n) ? props.getObjectByName(n) ?? null : null)

/** Хатым, Мизаб и Макам на свои места (координаты и вырезы — со старой страницы haram3d, сверены там с фото) */
function placeShrines(haram: Object3D, props: Object3D, meta: Meta, out: Group) {
  const pick = (n: string) => pickProp(props, n)
  const HT_C = toV3(-6.665, 8.763), MZ = toV3(-4.495, 4.91), MZ_Z = 12.65, mq = meta.spots.maqam
  const mqP = mq ? toV3(mq[0], mq[1]) : null
  const kc = toV3(KAABA_CENTER[0], KAABA_CENTER[1])

  const hatim = pick('hatim'), mizab = pick('mizab'), maqam = pick('maqam')
  if (hatim) {
    // старая тонкая стена Хиджра — мрамор в кольце 4,3–6,05 м от центра дуги (пол ниже 0,5 м не трогаем)
    cutHaram(haram, ['marble'], v => { const r = Math.hypot(v.x - HT_C.x, v.z - HT_C.z); return r > 4.3 && r < 6.05 && v.y < 1.45 ? (v.y > 0.5 ? 2 : 1) : 0 })
    hatim.position.copy(HT_C)
    out.add(hatim)
  }
  if (mizab) {
    cutHaram(haram, ['gold'], v => (v.y > 12.5 && v.y < 13.0 && Math.hypot(v.x - MZ.x, v.z - MZ.z) < 2.3 ? 2 : 0))
    mizab.position.set(MZ.x, MZ_Z, MZ.z)
    mizab.rotation.y = Math.atan2(-0.532, -0.847)   // локальная +z — наружу, к Хиджру
    out.add(mizab)
  }
  if (maqam && mqP) {
    // простой Макам из haram.glb: всё ближе 0,9 м к центру по горизонтали и ниже 3,2 м (пол матафа не трогаем)
    cutHaram(haram, ['gold', 'granite', 'marble', 'glass', 'silver'],
      v => (Math.hypot(v.x - mqP.x, v.z - mqP.z) < 0.9 && v.y < 3.2 ? (v.y < 0.01 ? 1 : 2) : 0))
    maqam.position.copy(mqP)
    maqam.rotation.y = Math.atan2(kc.x - mqP.x, kc.z - mqP.z)   // грань с аркой — к Каабе
    maqam.traverse(o => {
      if (!isMesh(o)) return
      const m = matOf(o)
      if (m.name === 'maqam_crystal' || m.name === 'maqam_pane') { m.transparent = true; m.opacity = m.name === 'maqam_crystal' ? 0.14 : 0.06; m.depthWrite = false; o.renderOrder = 3 }
    })
    out.add(maqam)
  }
}

/** Город: прячем простую мечеть из haram.glb (в городе своя, подробнее) и оранжевую «коробку» Макама из OSM */
function prepareCity(city: Object3D, haram: Object3D, meta: Meta): Object3D[] {
  for (const n of ['mosque', 'minaret', 'masaa']) { const o = haram.getObjectByName(n); if (o) o.visible = false }
  const mq = meta.spots.maqam
  const mqC = mq ? toV3(mq[0], mq[1]) : null
  const c = new Vector3()
  city.updateMatrixWorld(true)
  city.traverse(o => {
    if (!isMesh(o)) return
    o.geometry.computeBoundingSphere()
    const bs = o.geometry.boundingSphere
    if (mqC && bs) {
      c.copy(bs.center).applyMatrix4(o.matrixWorld)
      if (bs.radius < 3 && Math.hypot(c.x - mqC.x, c.z - mqC.z) < 1.5) { o.visible = false; return }
    }
    if (/Земля/.test(o.name + ' ' + (o.parent?.name ?? ''))) {   // земля чуть ниже пола мечети — отодвигаем по глубине, чтобы не мерцала
      const m = o.material as Material
      m.polygonOffset = true; m.polygonOffsetFactor = 4; m.polygonOffsetUnits = 4
    }
  })
  const base = city.getObjectByName('L_base') ?? city
  return base.children.filter(o => /Масъа.*(верх|купол)/.test(o.name))
}

/* ───── Тени ───── */

/** Не отбрасывают тень: светящиеся и стеклянные части (лампы, линия старта, стекло купола Макама) */
const NO_CAST = new Set(['glass', 'green_lamp', 'start', 'hatim_lamp', 'maqam_crystal', 'maqam_pane'])

/** Тени по смыслу: здания, Кааба, Макам, Хатым, колонны и ярусы Масъа — отбрасывают и принимают; земля города,
    убранство Каабы (тонкие панели, кольца) — только принимают; прозрачное и несветящееся сами по себе — ничего */
function tagShadows(root: Object3D, receiveOnly: ReadonlySet<Object3D>): void {
  root.traverse(o => {
    if (!isMesh(o)) return
    const m = o.material as MeshStandardMaterial
    if (m.transparent || !('roughness' in m)) return   // стекло, хрусталь, MeshBasic (огни сая) — без теней
    o.receiveShadow = true
    o.castShadow = !receiveOnly.has(o) && !NO_CAST.has(m.name)
  })
}

/** Всё, что внутри узлов: для «только принимает тень» */
function allIn(...roots: (Object3D | null | undefined)[]): Set<Object3D> {
  const out = new Set<Object3D>()
  for (const r of roots) r?.traverse(o => out.add(o))
  return out
}

/** Золото ночью: к собственному тёплому свечению — добавка от прожекторов (только у материалов, где оно уже есть) */
function goldMaterials(root: Object3D): { m: MeshStandardMaterial; base: number }[] {
  const out = new Map<MeshStandardMaterial, number>()
  root.traverse(o => {
    if (!isMesh(o)) return
    const m = matOf(o)
    if (m.metalness >= 0.9 && m.emissive && m.emissive.getHex() !== 0 && !out.has(m)) out.set(m, m.emissiveIntensity)
  })
  return [...out].map(([m, base]) => ({ m, base }))
}

/* ───── Свет вместо людей: потоки точек ───── */

/** Ломаная с накопленной длиной — для движения точек с постоянной скоростью */
interface Track { pts: P2[]; acc: number[]; len: number; closed: boolean }

function track(pts: P2[], closed: boolean): Track {
  const all = closed ? [...pts, pts[0]] : pts
  const acc = [0]
  for (let i = 1; i < all.length; i++) acc.push(acc[i - 1] + Math.hypot(all[i][0] - all[i - 1][0], all[i][1] - all[i - 1][1]))
  return { pts: all, acc, len: acc[acc.length - 1], closed }
}

function at(t: Track, s: number): P2 {
  let lo = 0, hi = t.acc.length - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t.acc[mid] <= s) lo = mid; else hi = mid }
  const seg = t.acc[hi] - t.acc[lo] || 1, k = (s - t.acc[lo]) / seg, a = t.pts[lo], b = t.pts[hi]
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
}

interface Mover { tr: Track; s: number; dir: 1 | -1 }

/** Каждая третья дорожка тавафа (кольца из Blender), точка через ~2,6 м; идут против часовой стрелки */
function tawafMovers(meta: Meta): Mover[] {
  const out: Mover[] = []
  meta.lanes.filter((_, i) => i % 3 === 1).forEach(l => {
    const tr = track(toCcw(l.pts), true)
    const n = Math.max(6, Math.round(tr.len / 2.6))
    for (let i = 0; i < n; i++) out.push({ tr, s: (i / n) * tr.len + Math.random() * 1.2, dir: 1 })
  })
  return out
}

/** Сай: четыре дорожки вдоль Масъа; к Марве — по одной стороне, обратно к Сафе — по другой */
function saiMovers(meta: Meta): Mover[] {
  const e = saiEnds(meta.spots)
  if (!e) return []
  const dx = e.marwa[0] - e.safa[0], dy = e.marwa[1] - e.safa[1], L = Math.hypot(dx, dy)
  const sx = -dy / L, sy = dx / L   // поперёк пути
  const out: Mover[] = []
  for (const lat of [-7, -3.5, 3.5, 7]) {
    const tr = track([[e.safa[0] + sx * lat, e.safa[1] + sy * lat], [e.marwa[0] + sx * lat, e.marwa[1] + sy * lat]], false)
    const n = Math.round(tr.len / 4)
    for (let i = 0; i < n; i++) out.push({ tr, s: (i / n) * tr.len + Math.random() * 2, dir: lat < 0 ? 1 : -1 })
  }
  return out
}

/** Высота точек над полом: таваф — пол матафа 0, сай — пол нижнего яруса Масъа ≈ 0,08 м */
const GLOW_Y = 1.1
const SPEED = 1.3   // м/с: чуть быстрее шага, чтобы движение читалось на обзоре

function flowPoints(movers: Mover[], tex: CanvasTexture, size: number) {
  const pos = new Float32Array(movers.length * 3)
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  // на белом мраморе чисто «сложение света» не видно — тёплое золото с мягким краем (обычное смешивание)
  const mat = new PointsMaterial({
    map: tex, size, sizeAttenuation: true, color: 0xf2a93b, transparent: true, opacity: 0.95,
    blending: NormalBlending, depthWrite: false, toneMapped: false,
  })
  const pts = new Points(geo, mat)
  pts.frustumCulled = false
  const write = () => {
    movers.forEach((m, i) => {
      const p = at(m.tr, m.s)
      pos[i * 3] = p[0]; pos[i * 3 + 1] = GLOW_Y; pos[i * 3 + 2] = -p[1]
    })
    geo.attributes.position.needsUpdate = true
  }
  write()
  const step = (dt: number) => {
    for (const m of movers) {
      m.s += m.dir * SPEED * dt
      if (m.s > m.tr.len) m.s -= m.tr.len
      if (m.s < 0) m.s += m.tr.len
    }
    write()
  }
  return { pts, step }
}

/** Загрузить нашу модель и подключить её слоем 'ours'. Бросает при сетевой ошибке (первое открытие без интернета)
    и AbortError, если окно закрыли до конца загрузки (тогда к движку ничего не добавляется) */
export async function loadOurs(engine: Engine, opt: { reducedMotion: boolean; signal: AbortSignal }): Promise<OursHandle> {
  if (opt.signal.aborted) throw aborted()
  // шрифт Amiri для шитья кисвы грузится вместе с моделью; не загрузился — kaabaFontReady вернёт false, не бросит
  const [[haram, props, city, meta]] = await Promise.all([loadAll(opt.signal), kaabaFontReady()])
  if (opt.signal.aborted) { for (const g of [haram, props, city]) disposeTree(g.scene); throw aborted() }
  const group = new Group()
  group.name = 'ours'
  tuneHaram(haram.scene)
  placeShrines(haram.scene, props.scene, meta, group)
  const decor = meta.kaaba ? buildKaabaDecor({
    haram: haram.scene, kaaba: meta.kaaba,
    pick: n => pickProp(props.scene, n),
    cut: (mats, hit) => cutHaram(haram.scene, mats, hit),
  }) : null
  if (decor) group.add(decor.group)
  const masaaTop = prepareCity(city.scene, haram.scene, meta)
  group.add(haram.scene, city.scene)
  const ground: Object3D[] = []
  city.scene.traverse(o => { if (/Земля/.test(o.name)) ground.push(o) })   // земля города: тень принимает, сама не отбрасывает
  tagShadows(group, allIn(decor?.group, ...ground))
  const golds = goldMaterials(group)
  // люди: фигуры fig_* копируются из props.glb в пулы толпы (у всех — нур вместо лица)
  const crowd = createCrowd({ props: props.scene, meta, camera: engine.camera, reducedMotion: opt.reducedMotion })
  disposeTree(props.scene)   // остальное в props.glb (заготовки) — не показываем и сразу освобождаем (кольца кисвы и фигуры — уже копии геометрии)
  if (crowd) {
    group.add(crowd.group)
    crowd.group.traverse(o => { if (isMesh(o) && o.name.startsWith('crowd_') && !/halo|blobs/.test(o.name)) o.receiveShadow = true })   // люди в тени зданий темнее; сами тень не отбрасывают — у них пятна под ногами
  }

  // фигур нет — по-старому: поток света вместо людей
  const tex = crowd ? null : new CanvasTexture(glowTexture())
  const tawaf = tex ? flowPoints(tawafMovers(meta), tex, 1.6) : null
  const sai = tex ? flowPoints(saiMovers(meta), tex, 3) : null
  if (tawaf && sai) group.add(tawaf.pts, sai.pts)

  // свет по времени Мекки: золото ночью ярче, пятна под людьми — по силе и направлению света
  const offLight = engine.onLight(L => {
    for (const g of golds) g.m.emissiveIntensity = g.base + L.goldGlow
    crowd?.setLight(L.blob, blobShift(L.keyDir))
  })
  const handle: LayerHandle = {
    group,
    // толпа сама знает про «уменьшить движение» (люди стоят); точки при нём стоят — update не нужен
    update: crowd ? dt => crowd.update(dt) : opt.reducedMotion ? undefined : dt => { tawaf?.step(dt); sai?.step(dt) },
    dispose: () => { offLight(); crowd?.dispose(); disposeTree(group); decor?.dispose(); tex?.dispose() },
  }
  engine.addLayer('ours', handle)
  engine.invalidateShadows()   // модель на месте — карта теней рисуется заново
  return {
    setCut: on => {
      if (masaaTop.every(o => o.visible === !on)) return
      for (const o of masaaTop) o.visible = !on
      engine.invalidateShadows()   // крыша Масъа исчезла или вернулась — тени на пути саи другие
    },
  }
}
