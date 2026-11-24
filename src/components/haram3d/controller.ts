/* Этап 1а: логика окна 3D без разметки — какой слой показан и почему, загрузка слоёв, переход на нашу модель
   при сбое Фото-3D, виды камеры. Состояние — сигнал: окно (viewer.tsx) только рисует его. */
import { signal, type Signal } from '@preact/signals'
import {
  FIRST_VIEW, MODEL_BASE, chooseLayer, isBlockedToday, pathLength, setBlockedToday, viewsOf,
  type GoogleErrorKind, type Layer, type LayerReason, type P2, type View, type ViewId,
} from '../../lib/haram3d'
import type { DayPhase } from '../../lib/sun'
import { createEngine, type Engine } from './engine'
import { loadOurs, type OursHandle } from './ours'
import type { GoogleHandle } from './google'

export type GoogleState = 'off' | 'loading' | 'ready' | 'failed'
export type OursState = 'loading' | 'ready' | 'error'

export interface ViewerState {
  /** WebGL недоступен — 3D не показать вовсе */
  noGl: boolean
  /** Браузер отобрал WebGL уже во время показа (на iPhone — нехватка памяти) */
  lost: boolean
  layer: Layer
  reason: LayerReason
  view: ViewId
  google: GoogleState
  ours: OursState
  /** Копирайты Фото-3D из getAttributions() */
  credits: string
  /** Длина пути от отеля до ворот, м (из walk_route.json) */
  routeLen: number | null
  /** Часы Мекки и время суток — по ним свет нашей модели (null — 3D не показать) */
  clock: { hm: string; phase: DayPhase } | null
}

export interface ControllerDeps {
  /** Ключ Google (VITE_GOOGLE_MAPS_KEY); пустой — Фото-3D не грузим вообще */
  key: string
  online: () => boolean
  /** Сегодня по Казахстану (kzToday) — для флага «лимит до завтра» */
  today: () => string
  reducedMotion: boolean
  /** Метки старта и финиша пути (элементы поверх canvas) */
  labels: { start: HTMLElement; end: HTMLElement }
  /** Текущее время (подменяется параметром отладки ?h3time= для снимков ночи); по умолчанию — часы устройства */
  now?: () => Date
}

export interface Controller {
  state: Signal<ViewerState>
  selectLayer(l: Layer): void
  selectView(id: ViewId): void
  retryOurs(): void
  dispose(): void
}

/** Нет ни одного тайла за это время (считая от загрузки модуля google.ts) — Фото-3D считаем не загрузившимся */
export const GOOGLE_TIMEOUT_MS = 12_000
const CREDITS_EVERY_MS = 1000
/** Как часто сверять свет со временем Мекки: солнце за 30 с сдвигается на ≈ 0,1° */
export const CLOCK_EVERY_MS = 10_000   // 24.11: было 30 с — часы «стояли» до полуминуты после смены минуты

/** Ключ строки статуса: какой слой показан и почему */
export function statusKey(s: ViewerState): string {
  if (s.noGl) return 'h3.nogl'
  if (s.lost) return 'h3.lost'
  if (s.layer === 'google') return s.google === 'ready' ? 'h3.s.ok' : 'h3.s.loading'
  return 'h3.s.' + s.reason
}

export function createController(host: HTMLElement, deps: ControllerDeps): Controller {
  const first = chooseLayer({
    online: deps.online(), hasKey: !!deps.key, blockedToday: isBlockedToday(deps.today()), wanted: 'google',
  })
  const state = signal<ViewerState>({
    noGl: false, lost: false, layer: first.layer, reason: first.reason, view: FIRST_VIEW[first.layer],
    google: 'off', ours: 'loading', credits: '', routeLen: null, clock: null,
  })
  const set = (p: Partial<ViewerState>) => { state.value = { ...state.value, ...p } }

  let disposed = false
  /** Закрытие окна отменяет загрузки (модель, путь) — их результат не попадёт в освобождённый движок */
  const abort = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined

  let engine: Engine
  try {
    engine = createEngine(host, {
      reducedMotion: deps.reducedMotion,
      onContextLost: () => {
        if (disposed) return
        clearTimeout(timer)
        set({ lost: true })
      },
    })
  } catch {
    set({ noGl: true })
    return { state, selectLayer() {}, selectView() {}, retryOurs() {}, dispose() {} }
  }

  // свет по времени Мекки: сразу, потом раз в 10 с (переход плавный; при «уменьшить движение» — сразу)
  const now = deps.now ?? (() => new Date())
  const tick = (instant: boolean) => {
    const c = engine.setTime(now(), instant)
    const prev = state.value.clock
    if (!prev || prev.hm !== c.clock || prev.phase !== c.phase) set({ clock: { hm: c.clock, phase: c.phase } })
  }
  tick(true)
  const clock = setInterval(() => { if (!disposed) tick(false) }, CLOCK_EVERY_MS)

  let ours: OursHandle | null = null
  let google: GoogleHandle | null = null
  let routePts: P2[] | null = null

  const viewOf = (layer: Layer, id: ViewId): View => viewsOf(layer).find(v => v.id === id) ?? viewsOf(layer)[0]

  /** Показать вид: камера, вырез Масъа, линия пути */
  const show = (layer: Layer, id: ViewId, instant: boolean) => {
    const v = viewOf(layer, id)
    engine.flyTo(v, instant || deps.reducedMotion)
    ours?.setCut(layer === 'ours' && !!v.cutMasaa)
    google?.showRoute(layer === 'google' && v.id === 'route' ? routePts : null, deps.labels)
    set({ view: v.id })
  }

  const goOurs = (reason: LayerReason) => {
    engine.setActive('ours')
    set({ layer: 'ours', reason })
    show('ours', FIRST_VIEW.ours, false)
  }

  const failGoogle = (kind: GoogleErrorKind) => {
    if (disposed || state.value.google === 'failed') return
    clearTimeout(timer)
    google?.dispose()   // обновление тайлов останавливается; сам TilesRenderer снимается при закрытии окна
    if (kind === 'quota') setBlockedToday(deps.today())
    const reason: LayerReason = kind === 'quota' ? 'quota' : !deps.online() ? 'offline' : 'failed'
    set({ google: 'failed' })
    if (state.value.layer === 'google') goOurs(reason)
  }

  const loadRoute = () => {
    fetch(MODEL_BASE + 'walk_route.json', { signal: abort.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('walk_route.json: ' + r.status))))
      .then((w: { routes?: { gate79?: { len?: number; pts?: P2[] } } }) => {
        const r = w.routes?.gate79
        if (disposed || !r?.pts?.length) return
        routePts = r.pts
        set({ routeLen: Math.round(r.len ?? pathLength(r.pts)) })
        if (state.value.layer === 'google' && state.value.view === 'route') google?.showRoute(routePts, deps.labels)
      })
      .catch(() => { /* без линии пути вид остаётся обзором; длину не показываем — честнее, чем выдумывать */ })
  }

  /** Один TilesRenderer на открытие окна: создаётся при первом показе Фото-3D и больше не пересоздаётся */
  const startGoogle = () => {
    if (google || state.value.google !== 'off') return
    set({ google: 'loading' })
    import('./google')
      .then(m => {
        if (disposed || state.value.google === 'failed') return
        try {
          google = m.createGoogle(engine, deps.key, {
            onFirstTile: () => { if (!disposed && state.value.google === 'loading') { clearTimeout(timer); set({ google: 'ready' }) } },
            onError: failGoogle,
          })
        } catch {
          failGoogle('other')   // createGoogle сам освободил то, что успел создать
          return
        }
        // 12 секунд — на тайлы, а не на загрузку модуля google.ts по медленной сети (её ловит .catch ниже)
        timer = setTimeout(() => { if (state.value.google !== 'ready') failGoogle('other') }, GOOGLE_TIMEOUT_MS)
        if (state.value.layer === 'google') show('google', state.value.view, true)
      })
      .catch(() => failGoogle('network'))
  }

  const startOurs = () => {
    set({ ours: 'loading' })
    loadOurs(engine, { reducedMotion: deps.reducedMotion, signal: abort.signal })
      .then(h => {
        if (disposed) return
        ours = h
        set({ ours: 'ready' })
        if (state.value.layer === 'ours') ours.setCut(!!viewOf('ours', state.value.view).cutMasaa)
      })
      .catch(() => { if (!disposed) set({ ours: 'error' }) })
  }

  // копирайты Фото-3D меняются вместе с видимыми тайлами — обновляем раз в секунду, пока слой на экране
  const credits = setInterval(() => {
    if (!google || state.value.layer !== 'google') return
    const c = google.credits()
    if (c !== state.value.credits) set({ credits: c })
  }, CREDITS_EVERY_MS)

  engine.setActive(first.layer)
  show(first.layer, FIRST_VIEW[first.layer], true)
  if (first.layer === 'google') startGoogle()
  // наша модель грузится всегда: запасной слой при сбое Фото-3D и офлайн-копия на поездку
  startOurs()
  // путь «отель → ворота» (4 КБ) грузим сразу, а не только для Фото-3D: так он попадает в офлайн-кэш
  // вместе с моделью, и галочка «сохранено» на карточке (все MODEL_URLS в кэше) становится правдой
  loadRoute()

  return {
    state,
    selectLayer(l) {
      if (l === 'ours') { if (state.value.layer !== 'ours' || state.value.reason !== 'chosen') goOurs('chosen'); return }
      if (state.value.layer === 'google') return
      const c = chooseLayer({
        online: deps.online(), hasKey: !!deps.key, blockedToday: isBlockedToday(deps.today()), wanted: 'google',
        failed: state.value.google === 'failed',
      })
      if (c.layer === 'ours') { set({ reason: c.reason }); return }   // остаёмся на нашей модели, строка объясняет почему
      engine.setActive('google')
      set({ layer: 'google', reason: 'ok' })
      startGoogle()
      show('google', FIRST_VIEW.google, false)
    },
    selectView(id) { show(state.value.layer, id, false) },
    retryOurs() { if (state.value.ours === 'error') startOurs() },
    dispose() {
      if (disposed) return
      disposed = true
      abort.abort()
      clearTimeout(timer)
      clearInterval(credits)
      clearInterval(clock)
      engine.dispose()
    },
  }
}
