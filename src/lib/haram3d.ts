/* Этап 1а «Харам заранее (3D)»: чистая логика просмотрщика, без three.js (её проверяют юнит-тесты).
   Система координат данных — как в haram_meta.json и walk_route.json: метры от центра Каабы,
   x — на восток, y — на север, z — вверх. В three.js точка (x, y, z) становится (x, z, −y). */

export type Layer = 'google' | 'ours'
/** Почему показан именно этот слой: ok — Фото-3D работает; chosen — паломник сам выбрал нашу модель;
    nokey — ключ Google не задан при сборке; offline — нет сети; quota — лимит на сегодня; failed — Фото-3D не загрузилось */
export type LayerReason = 'ok' | 'chosen' | 'nokey' | 'offline' | 'quota' | 'failed'
export type P2 = readonly [number, number]
export type P3 = readonly [number, number, number]

export interface LayerInput {
  online: boolean
  hasKey: boolean
  blockedToday: boolean
  wanted: Layer
  /** Фото-3D уже не загрузилось в этом открытии просмотрщика — не пробуем снова (каждая попытка — платное «открытие») */
  failed?: boolean
}

/** Какой слой показать и почему. Порядок причин: выбор человека → ключ → сеть → лимит → прошлый сбой */
export function chooseLayer(i: LayerInput): { layer: Layer; reason: LayerReason } {
  if (i.wanted === 'ours') return { layer: 'ours', reason: 'chosen' }
  if (!i.hasKey) return { layer: 'ours', reason: 'nokey' }
  if (!i.online) return { layer: 'ours', reason: 'offline' }
  if (i.blockedToday) return { layer: 'ours', reason: 'quota' }
  if (i.failed) return { layer: 'ours', reason: 'failed' }
  return { layer: 'google', reason: 'ok' }
}

/* ───── Ошибки Google ───── */

export type GoogleErrorKind = 'quota' | 'denied' | 'network' | 'other'
interface HttpLike { status?: number; message?: string }

const QUOTA_WORDS = /quota|rate ?limit|RESOURCE_EXHAUSTED/i
const CODE_IN_TEXT = /error code (\d{3})/i

/** Похоже на исчерпанный лимит: 429 — всегда; 403 — только если в тексте ответа есть слова о квоте */
export function isQuotaError(e: HttpLike): boolean {
  if (e.status === 429) return true
  return e.status === 403 && QUOTA_WORDS.test(e.message ?? '')
}

/** Код ответа и текст из того, что бросила библиотека или вернул fetch */
function asHttp(e: unknown): HttpLike {
  if (!e || typeof e !== 'object') return {}
  const o = e as { status?: unknown; message?: unknown }
  const message = typeof o.message === 'string' ? o.message : ''
  const status = typeof o.status === 'number' ? o.status : Number(CODE_IN_TEXT.exec(message)?.[1]) || undefined
  return { status, message }
}

/** Разбор ошибки Фото-3D: лимит (запомнить до завтра), отказ ключа, сбой сети или прочее */
export function classifyGoogleError(e: unknown): GoogleErrorKind {
  const h = asHttp(e)
  if (isQuotaError(h)) return 'quota'
  if (h.status && h.status >= 400 && h.status < 500) return 'denied'
  if (e instanceof TypeError) return 'network'   // fetch бросает TypeError при обрыве сети (Chrome: Failed to fetch, Safari: Load failed)
  return 'other'
}

/* ───── Флаг «Фото-3D недоступно до завтра» ───── */

export const BLOCK_KEY = 'jurt.3dBlocked'

/** Лимит исчерпан сегодня (дата YYYY-MM-DD по Казахстану — kzToday()) */
export function isBlockedToday(today: string): boolean {
  try { return localStorage.getItem(BLOCK_KEY) === today } catch { return false }
}

export function setBlockedToday(today: string): void {
  try { localStorage.setItem(BLOCK_KEY, today) } catch { /* приватный режим: просто не запоминаем */ }
}

/* ───── Виды камеры ───── */

export type ViewId = 'city' | 'haram' | 'route' | 'masaa' | 'kaaba' | 'tawaf' | 'sai'
export interface View {
  id: ViewId
  /** Камера и точка взгляда, метры в системе данных (x восток, y север, z вверх) */
  pos: P3
  target: P3
  /** Спрятать верхние ярусы и крышу Масъа, чтобы путь саи был виден сверху */
  cutMasaa?: boolean
}

/** Углы Каабы из haram_meta.json (kaaba.A…D); A — угол Чёрного камня */
const KAABA_CORNERS: readonly P2[] = [[6.26, -2.06], [-0.21, 7.62], [-2.14, -7.78], [-8.78, 2.2]]
export const KAABA_CENTER: P2 = [
  KAABA_CORNERS.reduce((s, p) => s + p[0], 0) / 4,
  KAABA_CORNERS.reduce((s, p) => s + p[1], 0) / 4,
]
/** Угол Чёрного камня (kaaba.A), высота камня */
export const BLACK_STONE: P3 = [6.26, -2.06, 1.5]

/** «Кааба вблизи» — как на старой странице haram3d (VIEWS.kaaba): сверху под углом ≈ 36° с востока, чуть к северу.
    В кадре вся Кааба (стена с дверью и угол Чёрного камня — к камере), Макам и люди на матафе.
    Расстояние подобрано под телефон 390 × 844 (поле зрения 42° по вертикали): Кааба — около половины ширины кадра;
    ближе (25–30 м) Кааба в портретном кадре не помещается по ширине */
const KAABA_VIEW = { target: [1, 3, 2] as P3, dist: 72, elevDeg: 36, azDeg: 3.6 }

function kaabaClose(): View {
  const { target: t, dist, elevDeg, azDeg } = KAABA_VIEW
  const el = (elevDeg * Math.PI) / 180, az = (azDeg * Math.PI) / 180, h = dist * Math.cos(el)
  return { id: 'kaaba', pos: [t[0] + h * Math.cos(az), t[1] + h * Math.sin(az), t[2] + dist * Math.sin(el)], target: t }
}

/** Фото-3D Google: пол матафа после выравнивания по земле — около z = 0 (google.ts) */
export const GOOGLE_VIEWS: readonly View[] = [
  { id: 'city', pos: [-950, -1250, 900], target: [-150, -50, 0] },
  { id: 'haram', pos: [-260, -380, 300], target: [0, 40, 0] },
  // путь от отеля Address Jabal Omar (запад) до ворот № 79: середина пути ≈ (−500, −95)
  { id: 'route', pos: [-470, -620, 430], target: [-500, -95, 0] },
  // галерея Масъа — к востоку от мечети, линия Сафа (135, −75) — Марва (91, 302)
  { id: 'masaa', pos: [360, 40, 320], target: [113, 113, 0] },
]

export const OUR_VIEWS: readonly View[] = [
  kaabaClose(),
  { id: 'tawaf', pos: [55, -85, 62], target: [8, -6, 0] },
  // из-за Сафы, сверху: путь саи уходит вперёд к Марве
  { id: 'sai', pos: [139, -104, 34], target: [122, 40, 0], cutMasaa: true },
  { id: 'haram', pos: [-260, -380, 300], target: [0, 40, 0] },
]

export function viewsOf(layer: Layer): readonly View[] {
  return layer === 'google' ? GOOGLE_VIEWS : OUR_VIEWS
}

/** С какого вида начинать слой */
export const FIRST_VIEW: Record<Layer, ViewId> = { google: 'haram', ours: 'tawaf' }

/* ───── Путь и минуты ───── */

export function pathLength(pts: readonly P2[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return s
}

/** Шаг паломника в толпе — 4,5–5 км/ч (м/мин); это допущение, на деле зависит от толпы */
const WALK_FAST = 5000 / 60
const WALK_SLOW = 4500 / 60

/** Минуты пешком «от–до», не меньше минуты */
export function walkMinutes(meters: number): [number, number] {
  return [Math.max(1, Math.round(meters / WALK_FAST)), Math.max(1, Math.round(meters / WALK_SLOW))]
}

/* ───── Таваф и сай ───── */

/** Удвоенная площадь со знаком: > 0 — точки идут против часовой стрелки (если смотреть сверху, x восток, y север) */
export function signedArea(pts: readonly P2[]): number {
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s
}

/** Кольцо тавафа в порядке «против часовой» (исходный массив не меняется) */
export function toCcw<T extends P2>(pts: readonly T[]): T[] {
  return signedArea(pts) < 0 ? [...pts].reverse() : [...pts]
}

/** Концы пути саи из meta.spots */
export function saiEnds(spots: Partial<Record<string, readonly number[]>>): { safa: P2; marwa: P2 } | null {
  const s = spots.safa, m = spots.marwa
  if (!s || !m || s.length < 2 || m.length < 2) return null
  return { safa: [s[0], s[1]], marwa: [m[0], m[1]] }
}

/* ───── Файлы нашей модели и что из них показывать ───── */

/** Каталог модели с версией. Кэш CacheFirst (vite.config.ts → haram3d-model-v1) держит файлы бессрочно,
    поэтому при новой модели — новый каталог v2 и новое имя кэша haram3d-model-v2, иначе у паломников останется старая */
export const MODEL_BASE = '/haram3d/v1/'
/** Всё, что нужно нашей модели без сети — и для отметки «сохранено»: три glb, метаданные, путь от отеля и декодер Draco */
export const MODEL_URLS: readonly string[] = [
  'haram.glb', 'props.glb', 'haram_city.glb', 'haram_meta.json', 'walk_route.json',
  'draco/draco_decoder.wasm', 'draco/draco_wasm_wrapper.js',
].map(f => MODEL_BASE + f)

/** Фигуры паломников толпы в props.glb: мужчина и женщина, пять уровней детализации (и их сетки *_mesh) */
const CROWD_NODE = /^fig_[mw]_(hi|near|mid|far|xfar)(_pol)?(_mesh)?$/

/** Вера: герой «Вы» (hero и его чаша), птицы и любые фигуры людей вне толпы не показываются.
    Фигуры fig_* разрешены только модулю толпы (allowCrowd) — у них вместо лица нур, без черт (crowd/shader.ts) */
export function isForbiddenNode(name: string, opt: { allowCrowd?: boolean } = {}): boolean {
  if (opt.allowCrowd && CROWD_NODE.test(name)) return false
  return /^(fig_|bird|hero|cup)/.test(name)
}

/** Из props.glb берём только подробные святыни, стоящие на своих местах: Макам Ибрахим, Хиджр Исмаил (Хатым), Мизаб,
    шазарван (мраморный цоколь Каабы) и Йеменский угол, а также форму медного кольца кисвы (kiswa_ring — для колец на шазарване).
    Остальное в файле — заготовки для расстановки (стулья, барьеры, коляски) и фигуры; их не показываем */
export const PROP_NODES: readonly string[] = ['maqam', 'hatim', 'mizab', 'shazarwan', 'yemeni', 'kiswa_ring']
