/* Время намаза по ДУМК (muftyat.kz) для городов Казахстана — экран «Сегодня» (бриф 2.0 §7 A).
   API: GET https://api.muftyat.kz/prayer-times/<год>/<lat>/<lon> → { result: [{ imsak, fajr, sunrise, dhuhr, asr, sunset,
   maghrib, isha, midnight, Date: 'YYYY-MM-DD' } × 365], city, year }. CORS открыт, ответ ≈ 62 КБ.
   Год скачивается один раз на город и хранится на телефоне компактно: на день — 24 цифры (6 времён по ЧЧММ),
   ≈ 12 КБ на год. Дальше всё работает без сети. Нет сети и нет копии — запасной расчёт методом ДУМК
   из prayer.ts (с честной подписью на экране).
   Имсак не берём: в ответе он позже фаджра — странность не сверена, показывать нечего. */
import { times as calcTimes } from './prayer'
import { ls } from './store'
import type { KzCity } from './today-cities'
import { KZ_TZ } from './today-day'

export type DayKey = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'
/** Минуты от местной полуночи (UTC+5) */
export type DayTimes = Record<DayKey, number>
export const DAY_KEYS: readonly DayKey[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']

/** Год на телефоне: ключ дня — ММДД, значение — 24 цифры */
export interface YearTable { v: 1; y: number; days: Record<string, string> }
export interface DayResult { times: DayTimes; src: 'dumk' | 'calc' }
export interface FetchOpts { fetchFn?: typeof fetch; timeoutMs?: number }

const API = 'https://api.muftyat.kz/prayer-times/'
const TIMEOUT_MS = 8000
/** Меньше дней в ответе — считаем ответ испорченным (в году 365–366) */
const MIN_DAYS = 360
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

export const dumkKey = (cityId: string, year: number): string => `jurt.dumk.${cityId}.${year}`

/** Координаты — с шестью знаками, как в справочнике ДУМК: другие API не узнаёт */
export function apiUrl(city: KzCity, year: number): string {
  return `${API}${year}/${city.lat.toFixed(6)}/${city.lon.toFixed(6)}`
}

const pad2 = (n: number) => String(n).padStart(2, '0')

export function packDay(t: DayTimes): string {
  return DAY_KEYS.map(k => pad2(Math.floor(t[k] / 60)) + pad2(t[k] % 60)).join('')
}

export function unpackDay(s: string): DayTimes | null {
  if (!/^\d{24}$/.test(s)) return null
  const out = {} as DayTimes
  for (let i = 0; i < DAY_KEYS.length; i++) {
    const h = +s.slice(i * 4, i * 4 + 2), m = +s.slice(i * 4 + 2, i * 4 + 4)
    if (h > 23 || m > 59) return null
    out[DAY_KEYS[i]] = h * 60 + m
  }
  return out
}

const toMin = (v: unknown): number | null => {
  const m = typeof v === 'string' ? v.match(HHMM) : null
  return m ? +m[1] * 60 + +m[2] : null
}

/** Времена дня идут строго по порядку: фаджр < восход < зухр < аср < магриб < иша (DAY_KEYS — в этом порядке) */
const inOrder = (t: DayTimes): boolean => DAY_KEYS.every((k, i) => i === 0 || t[DAY_KEYS[i - 1]] < t[k])

/** Ответ API → компактная таблица года. Неполный, чужой или с нарушенным порядком времён ответ — ошибка
    (такой ответ не сохраняется, на экране — запасной расчёт); отдельный день с нечитаемым временем — пропуск */
export function parseYear(json: unknown, year: number): YearTable {
  const o = json as { result?: unknown; year?: unknown } | null
  if (!o || !Array.isArray(o.result)) throw new Error('ДУМК: в ответе нет расписания')
  if (o.year !== undefined && Number(o.year) !== year) throw new Error(`ДУМК: ответ за ${String(o.year)}, ждали ${year}`)
  const days: Record<string, string> = {}
  for (const row of o.result as Record<string, unknown>[]) {
    const date = typeof row?.Date === 'string' ? row.Date : ''
    if (!date.startsWith(year + '-') || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const t = {} as DayTimes
    let ok = true
    for (const k of DAY_KEYS) { const v = toMin(row[k]); if (v === null) { ok = false; break } t[k] = v }
    if (!ok) continue
    if (!inOrder(t)) throw new Error(`ДУМК: ${date} — нарушен порядок времён`)
    days[date.slice(5, 7) + date.slice(8, 10)] = packDay(t)
  }
  if (Object.keys(days).length < MIN_DAYS) throw new Error('ДУМК: в ответе слишком мало дней')
  return { v: 1, y: year, days }
}

/* Разобранные таблицы держим в памяти: localStorage читаем и разбираем один раз на город и год */
const memo = new Map<string, { raw: string; table: YearTable | null }>()
/* Скачанный год, который не удалось записать на телефон (хранилище закрыто или переполнено):
   держим в памяти до перезапуска, чтобы на экране было время ДУМК, а не расчёт */
const unsaved = new Map<string, YearTable>()

/** Забыть разобранные и не записанные годы — как при новом запуске (для тестов) */
export function forgetDumk(): void { memo.clear(); unsaved.clear() }

function savedYear(cityId: string, year: number): YearTable | null {
  const key = dumkKey(cityId, year)
  const raw = ls.get(key)
  const hit = memo.get(key)
  if (hit && hit.raw === raw) return hit.table ?? unsaved.get(key) ?? null
  let table: YearTable | null = null
  try {
    const p = raw ? JSON.parse(raw) as YearTable : null
    table = p && p.v === 1 && p.y === year && p.days && typeof p.days === 'object' ? p : null
  } catch { table = null /* испорченная копия — как будто её нет, ниже расчёт */ }
  memo.set(key, { raw, table })
  return table ?? unsaved.get(key) ?? null
}

/** День из копии на телефоне (или null) */
export function savedDay(cityId: string, iso: string): DayTimes | null {
  const t = savedYear(cityId, +iso.slice(0, 4))
  const s = t?.days[iso.slice(5, 7) + iso.slice(8, 10)]
  return s ? unpackDay(s) : null
}

/** Запасной расчёт методом ДУМК (prayer.ts), полдень местного дня */
export function calcDay(city: KzCity, iso: string): DayTimes {
  const [y, m, d] = iso.split('-').map(Number)
  const t = calcTimes(new Date(Date.UTC(y, m - 1, d, 12 - KZ_TZ)), city.lat, city.lon, KZ_TZ, 'dumk')
  return { fajr: t.fajr, sunrise: t.sunrise, dhuhr: t.dhuhr, asr: t.asr, maghrib: t.maghrib, isha: t.isha }
}

/** Время на день: ДУМК из копии, иначе расчёт */
export function timesForDay(city: KzCity, iso: string): DayResult {
  const saved = savedDay(city.id, iso)
  return saved ? { times: saved, src: 'dumk' } : { times: calcDay(city, iso), src: 'calc' }
}

/** Скачать год с таймаутом, разобрать и сохранить на телефоне */
export async function fetchYear(city: KzCity, year: number, opts: FetchOpts = {}): Promise<YearTable> {
  const f = opts.fetchFn ?? fetch
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? TIMEOUT_MS)
  try {
    const r = await f(apiUrl(city, year), { signal: ctl.signal })
    if (!r.ok) throw new Error('ДУМК: ответ ' + r.status)
    const table = parseYear(await r.json(), year)
    const key = dumkKey(city.id, year), json = JSON.stringify(table)
    ls.set(key, json)                               // ls.set молча глотает ошибку записи — проверяем чтением
    if (ls.get(key) === json) unsaved.delete(key); else unsaved.set(key, table)
    return table
  } finally { clearTimeout(timer) }
}

/** Год уже есть (на телефоне или в памяти) — true сразу; нет — скачать. Итог — по факту наличия данных:
    сбой сети или ответа — false (на экране тогда подпись «Без сети») */
export async function ensureYear(city: KzCity, year: number, opts: FetchOpts = {}): Promise<boolean> {
  if (savedYear(city.id, year)) return true
  try { await fetchYear(city, year, opts) } catch { /* ниже — по факту: данных нет */ }
  return savedYear(city.id, year) !== null
}

/** Какие годы нужны: текущий; в декабре — ещё и следующий (переход через Новый год без сети) */
export function wantedYears(iso: string): number[] {
  const y = +iso.slice(0, 4)
  return iso.slice(5, 7) === '12' ? [y, y + 1] : [y]
}
