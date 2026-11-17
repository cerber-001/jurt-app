// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { memoryStorage } from '../../tests/helpers/memoryStorage'

/* Плашка «Есть новая версия» и значок «Гид сохранён на телефоне ✓».
   registerSW подменяем: в тестах нет service worker, проверяем только реакцию на его события. */
interface Opts {
  onNeedRefresh?: () => void
  onOfflineReady?: () => void
  onRegisteredSW?: (url: string, r: ServiceWorkerRegistration | undefined) => void
}

let opts: Opts = {}
const apply = vi.fn(async () => {})
const register = vi.fn((o: Opts) => { opts = o; return apply })

async function load() {
  vi.resetModules()
  return import('./update')
}

const box = () => document.createElement('div')
/** Человек вернулся в гид (вкладка снова видна) */
const showPage = () => {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  document.dispatchEvent(new Event('visibilitychange'))
}
/** Живая область заполняется чуть позже появления плашки */
const liveTick = () => new Promise(r => setTimeout(r, 150))

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  opts = {}
  apply.mockClear(); register.mockClear()
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('initPwa', () => {
  test('регистрирует service worker сразу', async () => {
    const m = await load()
    m.initPwa(register)
    expect(register).toHaveBeenCalledTimes(1)
    expect((register.mock.calls[0][0] as { immediate?: boolean }).immediate).toBe(true)
  })

  test('новая версия готова — плашка включается, сама страница не перезагружается', async () => {
    const m = await load()
    m.initPwa(register)
    expect(m.needRefresh.value).toBe(false)
    opts.onNeedRefresh?.()
    expect(m.needRefresh.value).toBe(true)
    expect(apply).not.toHaveBeenCalled()
  })

  test('офлайн-копия готова — значок показываем один раз и запоминаем', async () => {
    const m = await load()
    m.initPwa(register)
    opts.onOfflineReady?.()
    expect(m.offlineNote.value).toBe(true)
    expect(m.savedOffline()).toBe(true)

    const again = await load()            // следующее открытие гида
    again.initPwa(register)
    opts.onOfflineReady?.()
    expect(again.offlineNote.value).toBe(false)
    expect(again.savedOffline()).toBe(true)
  })

  test('раз в час спрашивает сервер о новой версии, только когда есть сеть', async () => {
    vi.useFakeTimers()
    const m = await load()
    m.initPwa(register)
    const update = vi.fn(async () => {})
    opts.onRegisteredSW?.('/sw.js', { update } as unknown as ServiceWorkerRegistration)
    vi.advanceTimersByTime(m.CHECK_MS)
    expect(update).toHaveBeenCalledTimes(1)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    vi.advanceTimersByTime(m.CHECK_MS)
    expect(update).toHaveBeenCalledTimes(1)
  })

  test('вернулись в гид — спрашивает сервер, но не чаще раза в 10 минут и только при сети', async () => {
    vi.useFakeTimers()
    const m = await load()
    m.initPwa(register)
    const update = vi.fn(async () => {})
    opts.onRegisteredSW?.('/sw.js', { update } as unknown as ServiceWorkerRegistration)
    showPage()
    expect(update).not.toHaveBeenCalled()          // только что зарегистрировались
    vi.advanceTimersByTime(m.RECHECK_MS)
    showPage()
    expect(update).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(m.RECHECK_MS / 2)
    showPage()
    expect(update).toHaveBeenCalledTimes(1)        // рано
    vi.advanceTimersByTime(m.RECHECK_MS)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    showPage()
    expect(update).toHaveBeenCalledTimes(1)        // нет сети
  })
})

describe('UpdateBar', () => {
  test('без новой версии и без значка ничего не видно, но живая область для чтеца уже на месте', async () => {
    const m = await load()
    const el = box()
    render(<m.UpdateBar />, el)
    expect(el.textContent).toBe('')
    expect(el.querySelector('.upd, .upd-saved')).toBeNull()
    expect(el.querySelector('[role="status"]')).not.toBeNull()
  })

  test('кнопка «Обновить» включает новую версию с перезагрузкой', async () => {
    const m = await load()
    m.initPwa(register)
    const el = box()
    render(<m.UpdateBar />, el)
    await act(() => { opts.onNeedRefresh?.() })
    const btn = el.querySelector<HTMLButtonElement>('.upd-go')
    expect(btn?.textContent).toBe('Обновить')
    const live = el.querySelector('[role="status"]')!
    expect(live.textContent).toBe('')               // область была пустой и заполняется чуть позже —
    await act(liveTick)                              // так чтец её объявит
    expect(live.textContent).toContain('Есть новая версия')
    expect(live.querySelector('button')).toBeNull()  // кнопки — вне живой области
    await act(() => { btn?.click() })
    expect(apply).toHaveBeenCalledWith(true)
    expect(el.querySelector<HTMLButtonElement>('.upd-go')?.disabled).toBe(true)
  })

  test('«Позже» прячет плашку и ставит фокус в начало содержимого', async () => {
    const m = await load()
    m.initPwa(register)
    const page = document.createElement('div')
    const main = document.createElement('main')
    main.tabIndex = -1
    const el = box()
    page.append(el, main)
    document.body.append(page)
    render(<m.UpdateBar />, el)
    await act(() => { opts.onNeedRefresh?.() })
    const later = el.querySelector<HTMLButtonElement>('.upd-x')!
    later.focus()
    await act(() => { later.click() })
    expect(el.querySelector('.upd')).toBeNull()
    expect(document.activeElement).toBe(main)
    expect(apply).not.toHaveBeenCalled()
    render(null, el); page.remove()
  })

  test('после «Позже» плашка снова появляется, когда человек вернулся в гид (раз за возвращение)', async () => {
    const m = await load()
    m.initPwa(register)
    const el = box()
    render(<m.UpdateBar />, el)
    await act(() => { opts.onNeedRefresh?.() })
    await act(() => { el.querySelector<HTMLButtonElement>('.upd-x')?.click() })
    expect(el.querySelector('.upd')).toBeNull()
    await act(() => { showPage() })
    expect(el.querySelector('.upd')).not.toBeNull()
    await act(() => { el.querySelector<HTMLButtonElement>('.upd-x')?.click() })
    expect(el.querySelector('.upd')).toBeNull()      // в этот раз — до следующего возвращения
  })

  test('без скачанной новой версии возвращение в гид плашку не показывает', async () => {
    const m = await load()
    m.initPwa(register)
    const el = box()
    render(<m.UpdateBar />, el)
    await act(() => { showPage() })
    expect(el.querySelector('.upd')).toBeNull()
  })

  test('значок офлайн-копии виден и сам уходит через несколько секунд', async () => {
    vi.useFakeTimers()
    const m = await load()
    m.initPwa(register)
    const el = box()
    render(<m.UpdateBar />, el)
    await act(() => { opts.onOfflineReady?.() })
    expect(el.textContent).toContain('✓')
    await act(() => { vi.advanceTimersByTime(m.NOTE_MS) })
    expect(el.textContent).not.toContain('✓')
  })
})
