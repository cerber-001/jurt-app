/* Время намаза — перенос prayer.js из v2 (umra.jurt.kz) один в один, чтобы цифры совпадали.
   По умолчанию метод Умм аль-Кура (официальный календарь Саудовской Аравии, по нему азан в Хараме).
   Другие методы подобраны по опубликованным расписаниям (сверено 24.10.2026 в v2):
   dumk — ДУМК (muftyat.kz), аср по Абу Ханифе; diyanet — Диянет (Стамбул); dubai — ОАЭ. */
const R = Math.PI / 180
const sin = (d: number) => Math.sin(d * R), cos = (d: number) => Math.cos(d * R), tan = (d: number) => Math.tan(d * R)
const asin = (x: number) => Math.asin(x) / R, acos = (x: number) => Math.acos(Math.max(-1, Math.min(1, x))) / R
const atan2 = (y: number, x: number) => Math.atan2(y, x) / R, acot = (x: number) => Math.atan(1 / x) / R
const fix = (a: number, b: number) => a - b * Math.floor(a / b)

function sun(jd: number) {
  const D = jd - 2451545.0, g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360)
  const L = fix(q + 1.915 * sin(g) + 0.020 * sin(2 * g), 360), e = 23.439 - 0.00000036 * D
  const RA = atan2(cos(e) * sin(L), cos(L)) / 15
  return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - fix(RA, 24) }
}
function julian(y: number, m: number, d: number) {
  if (m <= 2) { y -= 1; m += 12 }
  const A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4)
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5
}
function hijriMonth(date: Date, tz: number) {
  try {
    const d = new Date(date.getTime() + tz * 3600000)
    const s = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { month: 'numeric', timeZone: 'UTC' }).format(d)
    return parseInt(s, 10) || 0
  } catch { return 0 }
}

export interface Method { fajr: number; isha?: number; ishaMin?: number; asr: 1 | 2; adj?: Partial<Record<string, number>> }
export const METHODS: Record<string, Method> = {
  mkk:     { fajr: 18.5, ishaMin: 90, asr: 1 },
  dumk:    { fajr: 15, isha: 15, asr: 2, adj: { sunrise: -3, dhuhr: 3, asr: 3, maghrib: 3 } },
  diyanet: { fajr: 18, isha: 17, asr: 1, adj: { fajr: -0.06, sunrise: -7.1, dhuhr: 5.07, asr: 4.53, maghrib: 7.73, isha: 0.68 } },
  dubai:   { fajr: 18.2, isha: 18.2, asr: 1, adj: { dhuhr: 3, asr: 0.6, maghrib: 3 } },
}
export type PrayerKey = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha'
export interface Times { fajr: number; sunrise: number; dhuhr: number; asr1: number; asr2: number; asr: number; maghrib: number; isha: number }

/** Минуты от местной полуночи. date — любой момент дня, tz — часовой пояс (Мекка и Медина: +3). */
export function times(date: Date, lat: number, lon: number, tz = 3, method: string | Method = 'mkk'): Times {
  const M = (typeof method === 'object' && method) || METHODS[method as string] || METHODS.mkk, adj = M.adj || {}
  const loc = new Date(date.getTime() + tz * 3600000)
  const jd = julian(loc.getUTCFullYear(), loc.getUTCMonth() + 1, loc.getUTCDate()) - lon / (15 * 24)
  const noon = (t: number) => fix(12 - sun(jd + t / 24).eqt, 24)
  const angleTime = (angle: number, t: number, ccw?: boolean) => {
    const s = sun(jd + t / 24)
    const h = acos((-sin(angle) - sin(s.decl) * sin(lat)) / (cos(s.decl) * cos(lat))) / 15
    return noon(t) + (ccw ? -h : h)
  }
  const asrTime = (t: number, f: number) => { const s = sun(jd + t / 24); return angleTime(-acot(f + tan(Math.abs(lat - s.decl))), t) }
  let T: Record<string, number> = { fajr: 5, sunrise: 6, dhuhr: 12, asr1: 13, asr2: 14, maghrib: 18, isha: 19 }
  for (let i = 0; i < 2; i++) {
    T = { fajr: angleTime(M.fajr, T.fajr, true), sunrise: angleTime(0.833, T.sunrise, true), dhuhr: noon(T.dhuhr),
          asr1: asrTime(T.asr1, 1), asr2: asrTime(T.asr2, 2), maghrib: angleTime(0.833, T.maghrib),
          isha: M.isha ? angleTime(M.isha, T.isha) : 0 }
  }
  const m = (k: string, a?: string) => Math.round((T[k] + tz - lon / 15) * 60 + (adj[a || k] || 0))
  const out = { fajr: m('fajr'), sunrise: m('sunrise'), dhuhr: m('dhuhr'), maghrib: m('maghrib'),
    asr1: m('asr1', 'asr'), asr2: m('asr2', 'asr') } as Times
  out.asr = M.asr === 2 ? out.asr2 : out.asr1
  out.isha = M.isha ? m('isha') : out.maghrib + (hijriMonth(date, tz) === 9 ? (M.ishaMin || 90) + 30 : (M.ishaMin || 90))
  return out
}

export const ORDER: PrayerKey[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']
export interface Next { key: PrayerKey; min: number; left: number; at: Date; friday: boolean }
/** Ближайший намаз после now (восход пропускается) */
export function next(now: Date, lat: number, lon: number, tz = 3, method: string | Method = 'mkk'): Next | null {
  const nowMin = fix(now.getTime() / 60000 + tz * 60, 1440)
  for (let day = 0; day < 2; day++) {
    const d = new Date(now.getTime() + day * 86400000), t = times(d, lat, lon, tz, method)
    for (const k of ORDER) {
      if (k === 'sunrise') continue
      const left = t[k] + day * 1440 - nowMin
      if (left > 0) return { key: k, min: t[k], left: Math.round(left), at: new Date(now.getTime() + left * 60000),
        friday: new Date(d.getTime() + tz * 3600000).getUTCDay() === 5 }
    }
  }
  return null
}
export const hhmm = (m: number) => { const r = fix(Math.round(m), 1440)
  return String(Math.floor(r / 60)).padStart(2, '0') + ':' + String(r % 60).padStart(2, '0') }

export const MAKKAH: [number, number] = [21.42251716, 39.82619418]
export const MADINAH: [number, number] = [24.46726, 39.61113]
/** Кибла: градусы от истинного севера по часовой стрелке */
export function qibla(lat: number, lon: number) {
  const dl = MAKKAH[1] - lon
  return fix(atan2(sin(dl), cos(lat) * tan(MAKKAH[0]) - sin(lat) * cos(dl)), 360)
}
export function km(lat1: number, lon1: number, lat2 = MAKKAH[0], lon2 = MAKKAH[1]) {
  const a = Math.pow(sin((lat2 - lat1) / 2), 2) + cos(lat1) * cos(lat2) * Math.pow(sin((lon2 - lon1) / 2), 2)
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Города маршрута — как в v2 (координаты, пояс, метод расчёта, склонение компаса) */
export interface City { id: string; lat: number; lon: number; tz: number; method: string; dec: number; names: Record<string, string> }
export const CITIES: City[] = [
  { id: 'almaty',   lat: 43.238, lon: 76.946, tz: 5, method: 'dumk',    dec: 5.2, names: { ru: 'Алматы',  kk: 'Алматы',  en: 'Almaty' } },
  { id: 'istanbul', lat: 41.008, lon: 28.978, tz: 3, method: 'diyanet', dec: 6.1, names: { ru: 'Стамбул', kk: 'Стамбул', en: 'Istanbul' } },
  { id: 'medina',   lat: 24.4735, lon: 39.6116, tz: 3, method: 'mkk',   dec: 3.9, names: { ru: 'Медина',  kk: 'Мәдина',  en: 'Medina' } },
  { id: 'mecca',    lat: 21.4221, lon: 39.8184, tz: 3, method: 'mkk',   dec: 3.5, names: { ru: 'Мекка',   kk: 'Мекке',   en: 'Mecca' } },
  { id: 'dubai',    lat: 25.205, lon: 55.271, tz: 4, method: 'dubai',   dec: 2.2, names: { ru: 'Дубай',   kk: 'Дубай',   en: 'Dubai' } },
]
export const METHOD_NAMES: Record<string, Record<string, string>> = {
  mkk:     { ru: 'Умм аль-Кура (Саудовская Аравия)', kk: 'Умм әл-Құра (Сауд Арабиясы)', en: 'Umm al-Qura (Saudi Arabia)' },
  dumk:    { ru: 'ДУМК (muftyat.kz)', kk: 'ҚМДБ (muftyat.kz)', en: 'SAMK (muftyat.kz)' },
  diyanet: { ru: 'Диянет (Турция)', kk: 'Диянет (Түркия)', en: 'Diyanet (Turkey)' },
  dubai:   { ru: 'Дубай (ОАЭ)', kk: 'Дубай (БАӘ)', en: 'Dubai (UAE)' },
}
/** Город по названию из программы («Медина», «Мекка», «Стамбул», …) */
export function cityByName(name?: string): City | undefined {
  if (!name) return undefined
  const n = name.toLowerCase()
  return CITIES.find(c => Object.values(c.names).some(v => n.includes(v.toLowerCase())))
}
