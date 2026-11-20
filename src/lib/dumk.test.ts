// @vitest-environment jsdom
/* Расписание ДУМК (api.muftyat.kz): разбор ответа, компактное хранение, выбор дня, офлайн-копия, запасной расчёт */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { memoryStorage } from '../../tests/helpers/memoryStorage'
import {
  apiUrl, calcDay, dumkKey, ensureYear, fetchYear, forgetDumk, packDay, parseYear, savedDay, timesForDay, unpackDay, wantedYears,
  type DayTimes,
} from './dumk'
import { DEFAULT_CITY, cityById } from './today-cities'

const ALMATY = DEFAULT_CITY
/** Запись 2026-11-20 для Алматы — снята с api.muftyat.kz 20.11.2026 */
const NOV20 = { imsak: '05:38', fajr: '05:28', sunrise: '06:48', dhuhr: '11:41', asr: '14:45', sunset: '16:24', maghrib: '16:27', isha: '17:47', midnight: '23:38', Date: '2026-11-20' }
const NOV20_MIN: DayTimes = { fajr: 328, sunrise: 408, dhuhr: 701, asr: 885, maghrib: 987, isha: 1067 }

/** Ответ API на целый год: 365 дней, все одинаковые, кроме 20 ноября */
function yearJson(year = 2026) {
  const result = []
  for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d = new Date(d.getTime() + 86400000)) {
    const iso = d.toISOString().slice(0, 10)
    result.push(iso === `${year}-11-20` ? { ...NOV20, Date: iso }
      : { imsak: '06:09', fajr: '05:59', sunrise: '07:21', dhuhr: '11:59', asr: '14:48', sunset: '16:27', maghrib: '16:30', isha: '17:53', midnight: '23:56', Date: iso })
  }
  return { result, latitude: '43.238293', longitude: '76.945465', year, city: 'Алматы қаласы' }
}
const okFetch = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); forgetDumk() })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('адрес запроса', () => {
  test('координаты — ровно как в справочнике ДУМК (6 знаков), иначе API отвечает 404', () => {
    expect(apiUrl(ALMATY, 2026)).toBe('https://api.muftyat.kz/prayer-times/2026/43.238293/76.945465')
    expect(apiUrl(cityById('zhezkazgan'), 2027)).toBe('https://api.muftyat.kz/prayer-times/2027/47.799711/67.714090')
  })
})

describe('компактная запись дня', () => {
  test('6 времён → 24 цифры и обратно', () => {
    expect(packDay(NOV20_MIN)).toBe('052806481141144516271747')
    expect(unpackDay('052806481141144516271747')).toEqual(NOV20_MIN)
  })
  test('испорченная запись — null', () => {
    expect(unpackDay('')).toBeNull()
    expect(unpackDay('05280648114114451627174x')).toBeNull()
    expect(unpackDay('992806481141144516271747')).toBeNull()
  })
})

describe('parseYear', () => {
  test('берёт только 6 нужных времён на день; имсак, закат и полночь не хранит', () => {
    const t = parseYear(yearJson(), 2026)
    expect(Object.keys(t.days)).toHaveLength(365)
    expect(t.days['1120']).toBe('052806481141144516271747')
    expect(JSON.stringify(t)).not.toContain('imsak')
    expect(t.y).toBe(2026)
  })
  test('ответ не того года, без result или почти пустой — ошибка', () => {
    expect(() => parseYear(yearJson(2025), 2026)).toThrow()
    expect(() => parseYear({ detail: 'Not found.' }, 2026)).toThrow()
    expect(() => parseYear({ result: yearJson().result.slice(0, 10), year: 2026 }, 2026)).toThrow()
  })
  test('день с испорченным временем пропускается, остальные — на месте', () => {
    const j = yearJson()
    j.result[0] = { ...j.result[0], fajr: 'ошибка' }
    const t = parseYear(j, 2026)
    expect(t.days['0101']).toBeUndefined()
    expect(t.days['1120']).toBeDefined()
  })
  test('компактная копия года для localStorage — не больше 15 КБ (ответ API ≈ 62 КБ)', () => {
    expect(JSON.stringify(parseYear(yearJson(), 2026)).length).toBeLessThan(15_000)
  })
})

describe('fetchYear и офлайн-копия', () => {
  test('скачивает год, хранит под ключом с городом и годом, дальше день читается без сети', async () => {
    const f = okFetch(yearJson())
    await fetchYear(ALMATY, 2026, { fetchFn: f })
    expect(f).toHaveBeenCalledWith('https://api.muftyat.kz/prayer-times/2026/43.238293/76.945465', expect.anything())
    expect(localStorage.getItem(dumkKey('almaty', 2026))).toBeTruthy()
    expect(savedDay('almaty', '2026-11-20')).toEqual(NOV20_MIN)
    expect(savedDay('astana', '2026-11-20')).toBeNull()
  })

  test('ответ 404 — ошибка, в хранилище ничего не пишется', async () => {
    const f = vi.fn(async () => new Response('{"detail":"Not found."}', { status: 404 }))
    await expect(fetchYear(ALMATY, 2026, { fetchFn: f })).rejects.toThrow()
    expect(localStorage.getItem(dumkKey('almaty', 2026))).toBeNull()
  })

  test('сеть молчит дольше таймаута — ошибка по таймауту', async () => {
    vi.useFakeTimers()
    const f = vi.fn((_u: string, init?: RequestInit) => new Promise<Response>((_, rej) => {
      init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))
    }))
    const p = fetchYear(ALMATY, 2026, { fetchFn: f, timeoutMs: 8000 })
    const check = expect(p).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(8001)
    await check
  })
})

describe('timesForDay: ДУМК или запасной расчёт', () => {
  test('есть копия — время ДУМК', async () => {
    await fetchYear(ALMATY, 2026, { fetchFn: okFetch(yearJson()) })
    expect(timesForDay(ALMATY, '2026-11-20')).toEqual({ times: NOV20_MIN, src: 'dumk' })
  })
  test('нет копии — расчёт методом ДУМК', () => {
    const r = timesForDay(ALMATY, '2026-11-20')
    expect(r.src).toBe('calc')
    expect(r.times).toEqual(calcDay(ALMATY, '2026-11-20'))
  })
  test('испорченная копия в хранилище — расчёт, без падения', () => {
    localStorage.setItem(dumkKey('almaty', 2026), '{не json')
    expect(timesForDay(ALMATY, '2026-11-20').src).toBe('calc')
  })
  test('запасной расчёт для Алматы 20.11.2026 расходится с ДУМК не больше чем на 3 минуты', () => {
    const c = calcDay(ALMATY, '2026-11-20')
    for (const k of Object.keys(NOV20_MIN) as (keyof DayTimes)[]) expect(Math.abs(c[k] - NOV20_MIN[k])).toBeLessThanOrEqual(3)
  })
})

describe('ensureYear', () => {
  test('копия уже есть — в сеть не ходит', async () => {
    await fetchYear(ALMATY, 2026, { fetchFn: okFetch(yearJson()) })
    const f = okFetch(yearJson())
    expect(await ensureYear(ALMATY, 2026, { fetchFn: f })).toBe(true)
    expect(f).not.toHaveBeenCalled()
  })
  test('нет сети — false, без исключения', async () => {
    const f = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    expect(await ensureYear(ALMATY, 2026, { fetchFn: f })).toBe(false)
  })
})

describe('хранилище не принимает запись (QuotaExceededError)', () => {
  const full = () => {
    const st = memoryStorage()
    st.setItem = () => { throw new DOMException('quota', 'QuotaExceededError') }
    vi.stubGlobal('localStorage', st)
  }
  test('год держится в памяти: ensureYear — успех, время — ДУМК, повторно в сеть не ходит', async () => {
    full()
    const f = okFetch(yearJson())
    expect(await ensureYear(ALMATY, 2026, { fetchFn: f })).toBe(true)
    expect(timesForDay(ALMATY, '2026-11-20')).toEqual({ times: NOV20_MIN, src: 'dumk' })
    expect(await ensureYear(ALMATY, 2026, { fetchFn: f })).toBe(true)
    expect(f).toHaveBeenCalledTimes(1)
  })
  test('сбой сети при полном хранилище — false (данных нет ни в памяти, ни на телефоне)', async () => {
    full()
    expect(await ensureYear(ALMATY, 2026, { fetchFn: vi.fn(async () => { throw new TypeError('Failed to fetch') }) })).toBe(false)
    expect(timesForDay(ALMATY, '2026-11-20').src).toBe('calc')
  })
})

describe('порядок времён в ответе', () => {
  test('день, где фаджр < восход < зухр < аср < магриб < иша нарушен, — весь ответ отклоняется', () => {
    const bad = yearJson()
    bad.result[100] = { ...bad.result[100], asr: '11:30' }           // аср раньше зухра
    expect(() => parseYear(bad, 2026)).toThrow(/порядок/)
    const swapped = yearJson()
    swapped.result[5] = { ...swapped.result[5], maghrib: '17:59' }   // магриб позже иша
    expect(() => parseYear(swapped, 2026)).toThrow(/порядок/)
  })
  test('битый ответ не сохраняется на телефоне', async () => {
    const bad = yearJson()
    bad.result[0] = { ...bad.result[0], fajr: '08:00' }               // фаджр позже восхода
    await expect(fetchYear(ALMATY, 2026, { fetchFn: okFetch(bad) })).rejects.toThrow()
    expect(localStorage.getItem(dumkKey(ALMATY.id, 2026))).toBeNull()
  })
})

describe('wantedYears', () => {
  test('обычный месяц — только текущий год; декабрь — ещё и следующий', () => {
    expect(wantedYears('2026-11-20')).toEqual([2026])
    expect(wantedYears('2026-12-01')).toEqual([2026, 2027])
  })
})
