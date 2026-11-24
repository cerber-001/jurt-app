/* Этап 1а: слой «Фото-3D» — Photorealistic 3D Tiles Google через 3d-tiles-renderer.
   Отдельный ленивый модуль: без ключа он не загружается вовсе (viewer решает через chooseLayer).
   Правила Google: тайлы не кэшируем (в service worker для tile.googleapis.com правил нет — vite.config.ts,
   в IndexedDB и localStorage ничего не пишем), логотип/надпись Google и копирайты из getAttributions() — поверх canvas.
   Одно открытие окна = один TilesRenderer = одна загрузка root tileset (платное «открытие» по тарифу Google). */
import {
  CurvePath, Group, LineCurve3, MathUtils, Mesh, MeshBasicMaterial, Raycaster, TubeGeometry, Vector3,
} from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { TilesRenderer } from '3d-tiles-renderer/three'
import { GLTFExtensionsPlugin, ReorientationPlugin, TileCompressionPlugin, UpdateOnChangePlugin } from '3d-tiles-renderer/three/plugins'
// GoogleCloudAuthPlugin в сборке 0.5.4 экспортируется только из core/plugins (типы three/plugins его переэкспортируют, а файл — нет)
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/core/plugins'
import { classifyGoogleError, isQuotaError, type GoogleErrorKind, type P2 } from '../../lib/haram3d'
import type { Engine } from './engine'
import { MODEL_BASE } from '../../lib/haram3d'

/** Центр Каабы, градусы. Допущение (общеизвестные координаты), сверить на ключе по совпадению с нашей моделью */
const KAABA_LAT = 21.4225, KAABA_LON = 39.8262
/** Стартовая высота над эллипсоидом, м: пол матафа ≈ 277 м над морем + ондуляция геоида. Допущение —
    после загрузки тайлов землю находим лучом и подвигаем группу (fixGround) */
const START_H = 300
/** Где мерить пол: открытый матаф в 25 м от Каабы, к востоку и к западу (не крыша Каабы и не галереи) */
const PROBES: readonly P2[] = [[25, 0], [-25, 0], [0, 25]]
const RAY_TOP = 1500
const ROUTE_LIFT = 3        // линию пути поднимаем над землёй на 3 м
const ROUTE_R = 1.6         // толщина «светящейся» трубки, м
const MAX_TILE_ERRORS = 3
/** Линию пути перестраиваем не чаще, чем раз в это время после прихода тайлов, и только если земля под ней
    сдвинулась больше чем на ROUTE_EPS: иначе каждая порция тайлов — сотни лучей и новая геометрия */
const ROUTE_DEBOUNCE_MS = 800
const ROUTE_EPS = 0.5
const MB = 1024 * 1024
/** Память под тайлы. По умолчанию библиотека держит 300–400 МБ — на iPhone Safari это выгрузка страницы.
    Телефон: 80–150 МБ; компьютер: 250–350 МБ */
const CACHE_PHONE = { min: 80 * MB, max: 150 * MB }
const CACHE_DESKTOP = { min: 250 * MB, max: 350 * MB }
/** Допустимая ошибка экрана, px: больше — меньше подробных тайлов. Рекомендованные настройки Google ставят 20;
    на маленьком экране телефона разница не видна, а памяти и трафика меньше */
const ERROR_TARGET_PHONE = 24

export interface GoogleEvents {
  onFirstTile(): void
  onError(kind: GoogleErrorKind): void
}

export interface GoogleHandle {
  /** Строка копирайтов из tiles.getAttributions() (тип string) */
  credits(): string
  /** Путь от отеля до ворот: линия по точкам (null — спрятать) и метки старта/финиша */
  showRoute(pts: readonly P2[] | null, labels?: { start: HTMLElement; end: HTMLElement }): void
  dispose(): void
}

/** Настроить память и подробность тайлов под устройство (после регистрации плагина Google: он ставит свои значения) */
export function tuneForDevice(tiles: TilesRenderer, phone: boolean): void {
  const c = phone ? CACHE_PHONE : CACHE_DESKTOP
  tiles.lruCache.minBytesSize = c.min
  tiles.lruCache.maxBytesSize = c.max
  if (phone) tiles.errorTarget = ERROR_TARGET_PHONE
}

/** Следим за ответами Google: 429 и 403 «quota» — лимит; текст ответа читаем с копии, библиотеке он остаётся */
function watchAuth(plugin: GoogleCloudAuthPlugin, onQuota: () => void) {
  const auth = (plugin as unknown as { auth?: { fetch?: (u: string, o?: RequestInit) => Promise<unknown> } }).auth
  const orig = auth?.fetch?.bind(auth)
  // без auth.fetch (другая версия библиотеки) лимит узнаем только по ошибкам загрузки (load-error)
  if (!auth || !orig) return
  auth.fetch = async (url, opts) => {
    const r = await orig(url, opts)
    if (r instanceof Response && !r.ok) {
      const text = r.status === 403 ? await r.clone().text().catch(() => '') : ''
      if (isQuotaError({ status: r.status, message: text })) onQuota()
    } else if (r && typeof r === 'object' && 'error' in r) {
      const e = (r as { error?: { code?: number; message?: string; status?: string } }).error
      if (isQuotaError({ status: e?.code, message: `${e?.status ?? ''} ${e?.message ?? ''}` })) onQuota()
    }
    return r
  }
}

/** Бросает, если библиотека не смогла подняться; всё, что успело создаться, к этому моменту уже освобождено */
export function createGoogle(engine: Engine, key: string, ev: GoogleEvents): GoogleHandle {
  // уборка копится по ходу создания: упали на середине — снимаем ровно то, что успели
  const cleanups: (() => void)[] = []
  const cleanup = () => { while (cleanups.length) { try { cleanups.pop()!() } catch { /* уборка не должна бросать дальше */ } } }
  try {
    return build(engine, key, ev, cleanups, cleanup)
  } catch (e) {
    cleanup()
    throw e
  }
}

function build(
  engine: Engine, key: string, ev: GoogleEvents, cleanups: (() => void)[], cleanup: () => void,
): GoogleHandle {
  const tiles = new TilesRenderer()
  cleanups.push(() => tiles.dispose())   // снимает плагины (и декодер Draco), выгружает тайлы
  const auth = new GoogleCloudAuthPlugin({ apiToken: key, autoRefreshToken: true, useRecommendedSettings: true })
  let dead = false, gotTile = false, tileErrors = 0
  const fail = (kind: GoogleErrorKind) => { if (!dead) { dead = true; ev.onError(kind) } }
  watchAuth(auth, () => fail('quota'))
  tiles.registerPlugin(auth)
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: new DRACOLoader().setDecoderPath(MODEL_BASE + 'draco/') }))
  tiles.registerPlugin(new TileCompressionPlugin())
  tiles.registerPlugin(new UpdateOnChangePlugin())
  tiles.registerPlugin(new ReorientationPlugin({
    lat: MathUtils.degToRad(KAABA_LAT), lon: MathUtils.degToRad(KAABA_LON), height: START_H, recenter: true,
  }))
  tuneForDevice(tiles, matchMedia('(pointer: coarse)').matches)

  // ReorientationPlugin кладёт тайлы: +Y вверх, +X на запад, +Z на север. Поворот на 180° — и оси как у нашей модели:
  // +X восток, −Z север. Высоту подправляет fixGround сдвигом этой же группы
  const holder = new Group()
  holder.name = 'google'
  holder.rotation.y = Math.PI
  holder.add(tiles.group)
  tiles.setCamera(engine.camera)
  tiles.setResolutionFromRenderer(engine.camera, engine.renderer)

  const ray = new Raycaster()
  const down = new Vector3(0, -1, 0)
  /** Высота поверхности тайлов в точке данных (x, y) или null */
  const groundAt = (x: number, y: number): number | null => {
    ray.set(new Vector3(x, RAY_TOP, -y), down)
    ray.far = RAY_TOP * 2
    const hit = ray.intersectObject(tiles.group, true)[0]
    return hit ? hit.point.y : null
  }

  /** Пол матафа — к нулю нашей системы: тогда виды, линия пути и наша модель совпадают по высоте */
  const fixGround = () => {
    const ys = PROBES.map(p => groundAt(p[0], p[1])).filter((y): y is number => y !== null)
    if (!ys.length) return
    const floor = Math.min(...ys)
    if (Math.abs(floor) > 0.3) { holder.position.y -= floor; holder.updateMatrixWorld(true) }
  }

  // путь от отеля до ворот — в системе нашей модели, поверх всего (depthTest выключен: линия «светится» сквозь дома)
  const routeMat = new MeshBasicMaterial({ color: 0xf07a1e, transparent: true, opacity: 0.92, depthTest: false, toneMapped: false })
  const route = new Mesh(new TubeGeometry(), routeMat)
  cleanups.push(() => { route.geometry.dispose(); routeMat.dispose() })
  route.renderOrder = 10
  route.visible = false
  // слой целиком: тайлы и линия пути прячутся и показываются вместе
  const layer = new Group()
  layer.add(holder, route)
  let routePts: readonly P2[] | null = null
  let routeLabels: { start: HTMLElement; end: HTMLElement } | null = null
  /** Высоты земли под точками пути, под которые построена текущая линия */
  let builtHeights: number[] | null = null
  const heightsUnder = (pts: readonly P2[]): number[] => {
    let last = 0
    return pts.map(p => { const g = groundAt(p[0], p[1]); if (g !== null) last = g; return last })
  }
  const buildRoute = (hs?: number[]) => {
    if (!routePts || routePts.length < 2) return
    const heights = hs ?? heightsUnder(routePts)
    builtHeights = heights
    const vs = routePts.map((p, i) => new Vector3(p[0], heights[i] + ROUTE_LIFT, -p[1]))
    const path = new CurvePath<Vector3>()
    for (let i = 1; i < vs.length; i++) path.add(new LineCurve3(vs[i - 1], vs[i]))
    route.geometry.dispose()
    route.geometry = new TubeGeometry(path, vs.length * 4, ROUTE_R, 6, false)
    if (routeLabels) {
      const a = vs[0], b = vs[vs.length - 1]
      engine.setLabels([
        { el: routeLabels.start, p: [a.x, -a.z, a.y + 4] },
        { el: routeLabels.end, p: [b.x, -b.z, b.y + 4] },
      ])
    }
  }

  const onModel = () => { if (!gotTile) { gotTile = true; ev.onFirstTile() } }
  const onError = (e: { tile: unknown; error: Error }) => {
    const kind = classifyGoogleError(e.error)
    if (e.tile === null || kind === 'quota') { fail(kind); return }   // корень не загрузился или лимит — сразу на нашу модель
    if (!gotTile && ++tileErrors >= MAX_TILE_ERRORS) fail(kind)
  }
  let routeTimer: ReturnType<typeof setTimeout> | undefined
  cleanups.push(() => clearTimeout(routeTimer))
  /** Пришли новые тайлы: через паузу сверить землю под линией и перестроить, только если она заметно сдвинулась */
  const refreshRoute = () => {
    routeTimer = undefined
    if (dead || !route.visible || !routePts || routePts.length < 2) return
    const hs = heightsUnder(routePts)
    const moved = !builtHeights || builtHeights.length !== hs.length || hs.some((h, i) => Math.abs(h - builtHeights![i]) > ROUTE_EPS)
    if (moved) buildRoute(hs)
  }
  let fixes = 0
  const onLoadEnd = () => {
    if (fixes++ < 8) fixGround()   // первые загрузки: земля уточняется по мере прихода подробных тайлов
    if (route.visible) { clearTimeout(routeTimer); routeTimer = setTimeout(refreshRoute, ROUTE_DEBOUNCE_MS) }
  }
  tiles.addEventListener('load-model', onModel)
  tiles.addEventListener('load-error', onError)
  tiles.addEventListener('tiles-load-end', onLoadEnd)
  cleanups.push(() => {
    tiles.removeEventListener('load-model', onModel)
    tiles.removeEventListener('load-error', onError)
    tiles.removeEventListener('tiles-load-end', onLoadEnd)
  })

  const onResize = () => tiles.setResolutionFromRenderer(engine.camera, engine.renderer)
  addEventListener('resize', onResize)
  cleanups.push(() => removeEventListener('resize', onResize))

  // после addLayer слой освобождает движок (при закрытии окна или замене слоя)
  engine.addLayer('google', {
    group: layer,
    update: () => { if (!dead) tiles.update() },
    dispose: () => { dead = true; cleanup() },
  })

  return {
    credits() {
      return tiles.getAttributions()
        .filter(a => a.type === 'string' && typeof a.value === 'string' && a.value.trim())
        .map(a => a.value as string).join(' · ')
    },
    showRoute(pts, labels) {
      routePts = pts
      routeLabels = labels ?? null
      route.visible = !!pts
      clearTimeout(routeTimer)
      if (pts) buildRoute(); else engine.setLabels(null)
    },
    dispose() { dead = true; clearTimeout(routeTimer) },
  }
}
