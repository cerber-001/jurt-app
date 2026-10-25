/* Погода Open-Meteo — тот же запрос, что в v2; кэш в localStorage не чаще раза в час на город,
   офлайн отдаём последнее сохранённое. */
export interface Wx {
  at: number
  daily: { time: string[]; weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[];
    precipitation_probability_max: number[]; uv_index_max: number[]; wind_speed_10m_max: number[]; sunrise: string[]; sunset: string[] }
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: number[]; wind_speed_10m: number[] }
}
const KEY = 'jurt.wx'
const HOUR = 3600_000
function cache(): Record<string, Wx> { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }

export async function weather(cityId: string, lat: number, lon: number): Promise<Wx | null> {
  const all = cache(), c = all[cityId]
  if (c && Date.now() - c.at < HOUR) return c
  if (!navigator.onLine) return c || null
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,wind_speed_10m_max,sunrise,sunset' +
      '&hourly=temperature_2m,weather_code,precipitation_probability,wind_speed_10m&forecast_days=16&forecast_hours=168&timezone=auto'
    const r = await fetch(u)
    if (!r.ok) throw new Error(String(r.status))
    const d = await r.json()
    const w: Wx = { at: Date.now(), daily: d.daily, hourly: d.hourly }
    all[cityId] = w
    try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* переполнено — живём без кэша */ }
    return w
  } catch { return c || null }
}

/** Код погоды WMO → иконка (id из icons.svg) и подпись */
export function wmo(code: number, lang = 'ru'): { icon: string; label: string } {
  const L: Record<string, Record<string, string>> = {
    clear: { ru: 'ясно', kk: 'ашық', en: 'clear' }, cloud: { ru: 'облачно', kk: 'бұлтты', en: 'cloudy' },
    fog: { ru: 'туман', kk: 'тұман', en: 'fog' }, rain: { ru: 'дождь', kk: 'жаңбыр', en: 'rain' },
    snow: { ru: 'снег', kk: 'қар', en: 'snow' }, storm: { ru: 'гроза', kk: 'дауыл', en: 'storm' },
  }
  const k = code === 0 ? 'clear' : code <= 3 ? 'cloud' : code <= 48 ? 'fog' : code <= 67 ? 'rain' : code <= 77 ? 'snow' : code <= 82 ? 'rain' : code <= 86 ? 'snow' : 'storm'
  const icon = { clear: 'sun', cloud: 'cloud', fog: 'fog', rain: 'rain', snow: 'snow', storm: 'storm' }[k] as string
  return { icon, label: L[k][lang] || L[k].ru }
}
