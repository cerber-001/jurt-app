// @vitest-environment jsdom
/* Окно «Харам заранее (3D)»: честная строка статуса, выбор слоя, Фото-3D не создаётся без ключа, сбой → наша модель.
   three.js и 3d-tiles-renderer замоканы: в jsdom нет WebGL, проверяем логику окна, а не рисование */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { memoryStorage } from '../../../tests/helpers/memoryStorage'
import { lang } from '../../lib/store'
import { kzToday } from '../../lib/today-day'
import { BLOCK_KEY } from '../../lib/haram3d'

const engine = vi.hoisted(() => ({
  scene: {}, camera: {}, renderer: {},
  addLayer: vi.fn(), setActive: vi.fn(), flyTo: vi.fn(), setLabels: vi.fn(), dispose: vi.fn(),
  setTime: vi.fn((_d: Date, _i: boolean) => ({ clock: '14:20', phase: 'day' })), onLight: vi.fn(() => () => {}), invalidateShadows: vi.fn(),
}))
type EngineEv = { onContextLost?: () => void; reducedMotion?: boolean }
const engineEv = vi.hoisted(() => ({ last: null as EngineEv | null }))
const createEngine = vi.hoisted(() => vi.fn((_host: unknown, ev?: EngineEv): unknown => { engineEv.last = ev ?? null; return engine }))
const ours = vi.hoisted(() => ({ setCut: vi.fn() }))
type OursOpt = { reducedMotion: boolean; signal: AbortSignal }
const loadOurs = vi.hoisted(() => vi.fn((_e: unknown, _o: OursOpt) => Promise.resolve(ours)))
type Ev = { onFirstTile(): void; onError(kind: string): void }
const google = vi.hoisted(() => ({ ev: null as Ev | null, credits: vi.fn(() => '© Google 2026'), showRoute: vi.fn(), dispose: vi.fn() }))
const createGoogle = vi.hoisted(() => vi.fn((_e: unknown, _k: string, ev: Ev) => { google.ev = ev; return google }))

vi.mock('./engine', () => ({ createEngine }))
vi.mock('./ours', () => ({ loadOurs }))
vi.mock('./google', () => ({ createGoogle }))

import { Haram3dViewer } from './viewer'
import { CLOCK_EVERY_MS, GOOGLE_TIMEOUT_MS } from './controller'

let root: HTMLDivElement
const onClose = vi.fn()
const ROUTE = { routes: { gate79: { len: 673, pts: [[-789.8, -45.8], [-222.6, -142.1]] } } }

function setOnline(v: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v })
}
/** Дать промисам (ленивый import, загрузка модели) завершиться */
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); await new Promise(r => setTimeout(r, 0)) })

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(ROUTE)))))
  vi.stubEnv('VITE_GOOGLE_MAPS_KEY', '')
  setOnline(true)
  for (const f of [createEngine, loadOurs, createGoogle, onClose, ours.setCut, google.showRoute, google.dispose,
    engine.addLayer, engine.setActive, engine.flyTo, engine.setLabels, engine.dispose, engine.setTime]) f.mockClear()
  engine.setTime.mockImplementation(() => ({ clock: '14:20', phase: 'day' }))
  createEngine.mockImplementation((_h, ev) => { engineEv.last = ev ?? null; return engine })
  createGoogle.mockImplementation((_e, _k, ev) => { google.ev = ev; return google })
  google.ev = null
  root = document.createElement('div'); document.body.append(root)
})
afterEach(async () => {
  await act(() => { render(null, root) })
  root.remove()
  lang.value = 'ru'
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs()
})

const show = async () => { await act(() => { render(<Haram3dViewer onClose={onClose} />, root) }); await flush() }
const status = () => root.querySelector('.h3-st')?.textContent ?? ''
const credits = () => root.querySelector('.h3-credits')?.textContent ?? ''
const btn = (label: string) => [...root.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!
const pressed = (label: string) => btn(label).getAttribute('aria-pressed')

describe('без ключа Google', () => {
  test('статус «ключ не настроен», показана наша модель, Фото-3D не создаётся вовсе', async () => {
    await show()
    expect(status()).toBe('Ключ Google ещё не настроен — показана наша модель')
    expect(createGoogle).not.toHaveBeenCalled()
    expect(loadOurs).toHaveBeenCalledTimes(1)
    expect(pressed('Наша модель')).toBe('true')
    expect(pressed('Фото-3D')).toBe('false')
    expect(credits()).toContain('участники OpenStreetMap (ODbL)')
    expect(credits()).toContain('alfinann (Sketchfab, CC BY 4.0)')
  })

  test('нажали «Фото-3D» — остаёмся на нашей модели, строка объясняет почему, Google не грузится', async () => {
    await show()
    await act(() => { btn('Фото-3D').click() })
    await flush()
    expect(status()).toBe('Ключ Google ещё не настроен — показана наша модель')
    expect(pressed('Наша модель')).toBe('true')
    expect(createGoogle).not.toHaveBeenCalled()
  })

  test('виды нашей модели: Кааба вблизи, Таваф, Сай, Харам; «Сай» прячет верх Масъа', async () => {
    await show()
    const chips = [...root.querySelectorAll('.h3-chip')].map(b => b.textContent)
    expect(chips).toEqual(['Кааба вблизи', 'Таваф', 'Сай', 'Харам целиком'])
    expect(pressed('Таваф')).toBe('true')
    expect(root.textContent).toContain('против часовой стрелки')
    await act(() => { btn('Сай').click() })
    expect(pressed('Сай')).toBe('true')
    expect(ours.setCut).toHaveBeenLastCalledWith(true)
    expect(engine.flyTo).toHaveBeenCalled()
    await act(() => { btn('Кааба вблизи').click() })
    expect(ours.setCut).toHaveBeenLastCalledWith(false)
  })

  test('по-казахски — строки из словаря окна', async () => {
    lang.value = 'kk'
    await show()
    expect(status()).toBe('Google кілті әлі бапталмаған — біздің модель көрсетілді')
  })
})

describe('WebGL недоступен', () => {
  test('честная строка вместо падения, без переключателей', async () => {
    createEngine.mockImplementation(() => { throw new Error('Error creating WebGL context.') })
    await show()
    expect(root.querySelector('[role=alert]')?.textContent).toContain('Ваш браузер не показывает 3D')
    expect(root.querySelector('.h3-seg')).toBeNull()
    expect(loadOurs).not.toHaveBeenCalled()
  })
})

describe('с ключом Google', () => {
  beforeEach(() => { vi.stubEnv('VITE_GOOGLE_MAPS_KEY', 'test-key') })

  test('онлайн — Фото-3D: «Загружается…», после первого тайла — «Фото-3D Google» и надпись Google с копирайтами', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    await show()
    expect(createGoogle).toHaveBeenCalledTimes(1)
    expect(createGoogle.mock.calls[0][1]).toBe('test-key')
    expect(status()).toBe('Загружается фото-3D…')
    await act(() => { google.ev!.onFirstTile() })
    expect(status()).toBe('Фото-3D Google — снимки настоящего города')
    await act(() => { vi.advanceTimersByTime(1100) })
    expect(credits()).toContain('Google')
    expect(credits()).toContain('© Google 2026')
    expect([...root.querySelectorAll('.h3-chip')].map(b => b.textContent)).toEqual(['Город', 'Харам целиком', 'Путь от отеля до ворот', 'Масъа сверху'])
  })

  test('вид «Путь от отеля до ворот»: линия, длина 673 м и 8–9 минут, подпись JURT/OSM', async () => {
    await show()
    await act(() => { google.ev!.onFirstTile() })
    await act(() => { btn('Путь от отеля до ворот').click() })
    expect(google.showRoute).toHaveBeenLastCalledWith(ROUTE.routes.gate79.pts, expect.objectContaining({ start: expect.any(HTMLElement) }))
    expect(root.textContent).toContain('673 м · ≈ 8–9 мин пешком')
    expect(root.textContent).toContain('на деле зависит от толпы')
    expect(credits()).toContain('Линия пути и метки — JURT по данным OpenStreetMap')
  })

  test('переключение слоёв туда-обратно не пересоздаёт Фото-3D (одно «открытие» на окно)', async () => {
    await show()
    await act(() => { google.ev!.onFirstTile() })
    await act(() => { btn('Наша модель').click() })
    expect(status()).toBe('Наша модель JURT — работает и без интернета')
    await act(() => { btn('Фото-3D').click() })
    await flush()
    expect(status()).toBe('Фото-3D Google — снимки настоящего города')
    expect(createGoogle).toHaveBeenCalledTimes(1)
  })

  test('нет интернета — наша модель с честной строкой, Google не создаётся', async () => {
    setOnline(false)
    await show()
    expect(status()).toBe('Нет интернета — показана наша модель')
    expect(createGoogle).not.toHaveBeenCalled()
  })

  test('лимит (quota) — сразу на нашу модель, флаг «до завтра»; следующее открытие сегодня — без Google', async () => {
    await show()
    await act(() => { google.ev!.onError('quota') })
    expect(status()).toBe('Лимит фото-3D на сегодня исчерпан — показана наша модель')
    expect(localStorage.getItem(BLOCK_KEY)).toBe(kzToday())
    expect(google.dispose).toHaveBeenCalled()
    await act(() => { render(null, root) })
    createGoogle.mockClear()
    await show()
    expect(status()).toBe('Лимит фото-3D на сегодня исчерпан — показана наша модель')
    expect(createGoogle).not.toHaveBeenCalled()
  })

  test('ошибка (403 без квоты) — «Фото-3D не загрузилось», флага нет', async () => {
    await show()
    await act(() => { google.ev!.onError('denied') })
    expect(status()).toBe('Фото-3D не загрузилось — показана наша модель')
    expect(localStorage.getItem(BLOCK_KEY)).toBeNull()
    await act(() => { btn('Фото-3D').click() })
    expect(status()).toBe('Фото-3D не загрузилось — показана наша модель')
    expect(createGoogle).toHaveBeenCalledTimes(1)
  })

  test('за 12 секунд ни одного тайла — переход на нашу модель', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await act(() => { render(<Haram3dViewer onClose={onClose} />, root) })
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(status()).toBe('Загружается фото-3D…')
    await act(async () => { await vi.advanceTimersByTimeAsync(GOOGLE_TIMEOUT_MS) })
    expect(status()).toBe('Фото-3D не загрузилось — показана наша модель')
  })
})

describe('сбои во время показа', () => {
  test('браузер отобрал WebGL (нехватка памяти) — честная строка вместо пустой сцены, переключателей нет', async () => {
    await show()
    await act(() => { engineEv.last!.onContextLost!() })
    expect(root.querySelector('[role=alert]')?.textContent).toContain('3D не удалось показать')
    expect(root.querySelector('.h3-seg')).toBeNull()
    expect(root.querySelector('.h3-credits')).toBeNull()
  })

  test('createGoogle упал на середине — наша модель со строкой «не загрузилось»', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_KEY', 'test-key')
    createGoogle.mockImplementationOnce(() => { throw new Error('плагин не поднялся') })
    await show()
    expect(status()).toBe('Фото-3D не загрузилось — показана наша модель')
    expect(pressed('Наша модель')).toBe('true')
  })

  test('закрыли окно, пока грузилась модель, — загрузка отменена (signal), движок освобождён', async () => {
    let resolve!: (v: typeof ours) => void
    loadOurs.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    await show()
    const signal = loadOurs.mock.calls[0][1].signal
    expect(signal.aborted).toBe(false)
    await act(() => { render(null, root) })
    expect(signal.aborted).toBe(true)
    expect(engine.dispose).toHaveBeenCalledTimes(1)
    await act(async () => { resolve(ours); await Promise.resolve() })
    expect(ours.setCut).not.toHaveBeenCalled()   // поздний результат в закрытое окно не применяется
  })

  test('путь от отеля грузится из каталога модели с версией и отменяется при закрытии', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_KEY', 'test-key')
    await show()
    const call = vi.mocked(fetch).mock.calls.find(c => String(c[0]).endsWith('walk_route.json'))!
    expect(String(call[0])).toBe('/haram3d/v1/walk_route.json')
    const signal = (call[1] as RequestInit).signal!
    await act(() => { render(null, root) })
    expect(signal.aborted).toBe(true)
  })
})

describe('наша модель не загрузилась', () => {
  test('строка «нужен интернет» и «Попробовать снова» — повторная загрузка', async () => {
    loadOurs.mockImplementationOnce(() => Promise.reject(new TypeError('Failed to fetch')))
    await show()
    expect(root.textContent).toContain('Наша модель не загрузилась. В первый раз нужен интернет.')
    await act(() => { btn('Попробовать снова').click() })
    await flush()
    expect(loadOurs).toHaveBeenCalledTimes(2)
    expect(root.textContent).not.toContain('Наша модель не загрузилась')
  })
})

describe('закрытие', () => {
  test('«Закрыть» вызывает onClose; при снятии окна движок освобождается (WebGL, цикл, слушатели)', async () => {
    await show()
    await act(() => { btn('Закрыть ✕').click() })
    expect(onClose).toHaveBeenCalledTimes(1)
    await act(() => { render(null, root) })
    expect(engine.dispose).toHaveBeenCalledTimes(1)
  })

  test('Escape закрывает окно', async () => {
    await show()
    await act(() => { dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(onClose).toHaveBeenCalled()
  })

  test('нет звука и фигур: в окне нет audio/video', async () => {
    await show()
    expect(root.querySelector('audio,video')).toBeNull()
  })
})

describe('свет по времени Мекки', () => {
  const clock = () => root.querySelector('.h3-clock')?.textContent ?? ''

  test('подпись «Сейчас в Мекке 14:20 — день»; свет выставлен сразу, без перехода', async () => {
    await show()
    expect(clock()).toBe('Сейчас в Мекке 14:20 — день')
    expect(engine.setTime).toHaveBeenCalledTimes(1)
    expect(engine.setTime.mock.calls[0][1]).toBe(true)
    expect(root.querySelector('.h3-clock button, .h3-clock a')).toBeNull()   // без кнопок
  })

  test('по-казахски и по-английски; ночь', async () => {
    engine.setTime.mockImplementation(() => ({ clock: '23:05', phase: 'night' }))
    lang.value = 'kk'
    await show()
    expect(clock()).toBe('Қазір Меккеде 23:05 — түн')
    await act(() => { lang.value = 'en' })
    expect(clock()).toBe('Now in Makkah: 23:05, night')
  })

  test('раз в 10 с свет сверяется со временем — уже плавно; после закрытия часы не тикают', async () => {
    vi.useFakeTimers()
    await act(() => { render(<Haram3dViewer onClose={onClose} />, root) })
    engine.setTime.mockImplementation(() => ({ clock: '17:45', phase: 'evening' }))
    await act(() => { vi.advanceTimersByTime(CLOCK_EVERY_MS) })
    expect(engine.setTime).toHaveBeenCalledTimes(2)
    expect(engine.setTime.mock.calls[1][1]).toBe(false)
    expect(clock()).toBe('Сейчас в Мекке 17:45 — вечер')
    await act(() => { render(null, root) })
    vi.advanceTimersByTime(120_000)
    expect(engine.setTime).toHaveBeenCalledTimes(2)
  })

  test('«уменьшить движение» доходит до движка (свет меняется без перехода)', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} }))
    await show()
    expect(engineEv.last?.reducedMotion).toBe(true)
  })

  test('?h3time=22:30 — свет на 22:30 по Мекке (для снимков ночи), системные часы не трогаются', async () => {
    const was = location.href
    history.replaceState(null, '', '/?h3time=22:30')
    try {
      await show()
      const d = engine.setTime.mock.calls[0][0]
      const hm = new Date(d.getTime() + 3 * 3_600_000).toISOString().slice(11, 16)
      expect(hm).toBe('22:30')
    } finally { history.replaceState(null, '', was) }
  })

  test('на Фото-3D подписи времени нет — его свет не наш', async () => {
    vi.stubEnv('VITE_GOOGLE_MAPS_KEY', 'test-key')
    await show()
    expect(clock()).toBe('')
  })
})
