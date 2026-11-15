// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fetchProgram, loadProgramData, type Program } from './program'
import { t } from './i18n'
import { memoryStorage } from '../../tests/helpers/memoryStorage'
import { PROGRAM } from '../../tests/fixtures/program'

const KEY = 'jurt.program'
const okResponse = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response
const failResponse = (status: number) => ({ ok: false, status, json: async () => ({}) }) as Response
const online = (v: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(v)
const seed = (raw: unknown, at: number) => localStorage.setItem(KEY, JSON.stringify({ at, raw }))

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  online(true)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('loadProgramData', () => {
  test('сеть доступна: свежая программа, savedAt = null, копия сохранена', async () => {
    fetchMock.mockResolvedValue(okResponse(PROGRAM))
    const r = await loadProgramData()
    expect(r.savedAt).toBeNull()
    expect(r.program.days).toHaveLength(3)
    const saved = JSON.parse(localStorage.getItem(KEY) as string)
    expect(saved.raw.title).toBe(PROGRAM.title)
    expect(typeof saved.at).toBe('number')
  })

  test('запрос идёт с cache: no-cache и сигналом отмены', async () => {
    fetchMock.mockResolvedValue(okResponse(PROGRAM))
    await loadProgramData()
    const opts = fetchMock.mock.calls[0][1] as RequestInit
    expect(opts.cache).toBe('no-cache')
    expect(opts.signal).toBeInstanceOf(AbortSignal)
  })

  test('сбой сети при наличии копии: возвращается копия с её временем', async () => {
    seed(PROGRAM, 1234)
    fetchMock.mockRejectedValue(new Error('network down'))
    const r = await loadProgramData()
    expect(r.savedAt).toBe(1234)
    expect(r.program.group).toBe(PROGRAM.group)
  })

  test('ответ сервера с ошибкой при наличии копии — тоже копия', async () => {
    seed(PROGRAM, 99)
    fetchMock.mockResolvedValue(failResponse(500))
    expect((await loadProgramData()).savedAt).toBe(99)
  })

  test('сбой сети без копии: ошибка с причиной в скобках', async () => {
    fetchMock.mockResolvedValue(failResponse(503))
    await expect(loadProgramData()).rejects.toThrow(/\(HTTP 503\)/)
  })

  test('ответ без списка days считается испорченным и не сохраняется', async () => {
    fetchMock.mockResolvedValue(okResponse({ title: 'x' }))
    await expect(loadProgramData()).rejects.toThrow(/bad format/)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  test('офлайн с копией: сеть не спрашивается вовсе', async () => {
    online(false)
    seed(PROGRAM, 777)
    const r = await loadProgramData()
    expect(r.savedAt).toBe(777)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  /* Сервис-воркер программу больше не кэширует (vite.config.ts): если запрос удался, ответ пришёл из сети,
     даже когда navigator.onLine ошибочно говорит «офлайн». */
  test('navigator.onLine = false без копии, но запрос удался: это свежая программа, копия сохраняется', async () => {
    online(false)
    fetchMock.mockResolvedValue(okResponse(PROGRAM))
    const r = await loadProgramData()
    expect(r.savedAt).toBeNull()
    expect(JSON.parse(localStorage.getItem(KEY) as string).raw.title).toBe(PROGRAM.title)
  })

  test('испорченная копия в хранилище игнорируется', async () => {
    localStorage.setItem(KEY, '{не json')
    fetchMock.mockResolvedValue(okResponse(PROGRAM))
    expect((await loadProgramData()).savedAt).toBeNull()
  })

  test('копия неверной формы (нет at или days) игнорируется', async () => {
    localStorage.setItem(KEY, JSON.stringify({ raw: PROGRAM }))
    fetchMock.mockRejectedValue(new Error('down'))
    await expect(loadProgramData()).rejects.toThrow()
    localStorage.setItem(KEY, JSON.stringify({ at: 1, raw: { days: 'нет' } }))
    await expect(loadProgramData()).rejects.toThrow()
  })

  test('программа из сети и из копии проходит обезличивание', async () => {
    const withLeader: Program = { ...PROGRAM, group: 'Группа · духовный наставник Иван Петров' }
    fetchMock.mockResolvedValue(okResponse(withLeader))
    expect((await loadProgramData()).program.group).toBe('Группа · духовный наставник группы')
    online(false)
    expect((await loadProgramData()).program.group).toBe('Группа · духовный наставник группы')
  })
})

describe('loadProgramData: строгая проверка формы', () => {
  const day0 = PROGRAM.days[0]
  const bad: [string, unknown][] = [
    ['days — пустой массив', { ...PROGRAM, days: [] }],
    ['days — не массив', { ...PROGRAM, days: {} }],
    ['дата дня не в виде YYYY-MM-DD', { ...PROGRAM, days: [{ ...day0, date: '01.11.2026' }] }],
    ['у дня нет даты', { ...PROGRAM, days: [{ ...day0, date: undefined }] }],
    ['items дня — не массив', { ...PROGRAM, days: [{ ...day0, items: 'нет' }] }],
    ['у пункта нет t', { ...PROGRAM, days: [{ ...day0, items: [{ w: 'Завтрак' }] }] }],
    ['w пункта — число', { ...PROGRAM, days: [{ ...day0, items: [{ t: '08:00', w: 5 }] }] }],
    ['пункт — null', { ...PROGRAM, days: [{ ...day0, items: [null] }] }],
    ['день — строка', { ...PROGRAM, days: ['2026-11-01'] }],
    ['ответ — null', null],
  ]

  test.each(bad)('%s: без копии — ошибка prog.err, в хранилище ничего не пишется', async (_, body) => {
    fetchMock.mockResolvedValue(okResponse(body))
    await expect(loadProgramData()).rejects.toThrow(t('prog.err'))
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  test.each(bad)('%s: при наличии копии — копия с её датой, копия не перезаписана', async (_, body) => {
    seed(PROGRAM, 4321)
    fetchMock.mockResolvedValue(okResponse(body))
    const r = await loadProgramData()
    expect(r.savedAt).toBe(4321)
    expect(r.program.days).toHaveLength(3)
    expect(JSON.parse(localStorage.getItem(KEY) as string)).toEqual({ at: 4321, raw: PROGRAM })
  })

  test('пустые строки t и w допустимы', async () => {
    const body = { ...PROGRAM, days: [{ ...day0, items: [{ t: '', w: '' }] }] }
    fetchMock.mockResolvedValue(okResponse(body))
    expect((await loadProgramData()).savedAt).toBeNull()
  })

  test('невалидная сохранённая копия — как будто её нет', async () => {
    seed({ ...PROGRAM, days: [{ ...day0, date: 'завтра' }] }, 55)
    fetchMock.mockRejectedValue(new Error('down'))
    await expect(loadProgramData()).rejects.toThrow(t('prog.err'))
    seed({ ...PROGRAM, days: [] }, 55)
    online(false)
    fetchMock.mockResolvedValue(okResponse(PROGRAM))
    expect((await loadProgramData()).savedAt).toBeNull()   // пустая копия не помешала пойти в сеть
  })
})

describe('loadProgramData: зависшая сеть', () => {
  /** fetch, который не отвечает, пока его не отменят через signal */
  const hang = (_url: string, opts?: RequestInit) => new Promise<Response>((_, reject) => {
    opts?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
  })
  const track = <T,>(p: Promise<T>) => {
    const s = { done: false, value: undefined as T | undefined, error: undefined as unknown }
    p.then(v => { s.done = true; s.value = v }, e => { s.done = true; s.error = e })
    return s
  }

  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  test('при наличии копии ждём 6 с, потом отдаём копию с её датой', async () => {
    seed(PROGRAM, 2024)
    fetchMock.mockImplementation(hang)
    const s = track(loadProgramData())
    await vi.advanceTimersByTimeAsync(5_999)
    expect(s.done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(s.done).toBe(true)
    expect(s.value?.savedAt).toBe(2024)
    expect(JSON.parse(localStorage.getItem(KEY) as string).at).toBe(2024)   // дата копии не перезаписана
  })

  test('без копии ждём дольше — 20 с, потом ошибка prog.err', async () => {
    fetchMock.mockImplementation(hang)
    const s = track(loadProgramData())
    await vi.advanceTimersByTimeAsync(19_999)
    expect(s.done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(s.done).toBe(true)
    expect((s.error as Error).message).toContain(t('prog.err'))
  })

  test('после быстрого ответа таймер снят', async () => {
    fetchMock.mockResolvedValue(okResponse(PROGRAM))
    await loadProgramData()
    expect(vi.getTimerCount()).toBe(0)
  })

  test('после ошибки сети таймер тоже снят', async () => {
    seed(PROGRAM, 1)
    fetchMock.mockRejectedValue(new Error('down'))
    await loadProgramData()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('сервис-воркер', () => {
  test('program.json не кэшируется workbox: копия — только в localStorage', () => {
    const cfg = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8')
    expect(cfg).not.toMatch(/umra\\\.jurt\\\.kz\\\/program/)
    expect(cfg).not.toMatch(/cacheName:\s*'program'/)
  })
})

describe('fetchProgram', () => {
  test('возвращает только программу', async () => {
    fetchMock.mockResolvedValue(okResponse(PROGRAM))
    const p = await fetchProgram()
    expect(p.version).toBe(PROGRAM.version)
    expect(p).not.toHaveProperty('savedAt')
  })
})
