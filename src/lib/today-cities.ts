/* Города Казахстана для экрана «Сегодня» (бриф 2.0 §7 A).
   Координаты — ровно как в справочнике ДУМК (api.muftyat.kz/cities/, сверено 20.11.2026): API времени намаза
   отвечает только на точные координаты из этого справочника, на «круглые» — 404.
   Выбор города хранится на телефоне; геопозиция используется только здесь, на сервер не уходит. */
import { km } from './prayer'
import { ls } from './store'

export interface KzCity { id: string; lat: number; lon: number; names: { ru: string; kk: string; en: string } }

const c = (id: string, lat: number, lon: number, ru: string, kk: string, en: string): KzCity =>
  ({ id, lat, lon, names: { ru, kk, en } })

export const KZ_CITIES: readonly KzCity[] = [
  c('almaty', 43.238293, 76.945465, 'Алматы', 'Алматы', 'Almaty'),
  c('astana', 51.133333, 71.433333, 'Астана', 'Астана', 'Astana'),
  c('shymkent', 42.368009, 69.612769, 'Шымкент', 'Шымкент', 'Shymkent'),
  c('karaganda', 49.806406, 73.085485, 'Караганда', 'Қарағанды', 'Karaganda'),
  c('aktobe', 50.300377, 57.154555, 'Актобе', 'Ақтөбе', 'Aktobe'),
  c('taraz', 42.883333, 71.366667, 'Тараз', 'Тараз', 'Taraz'),
  c('pavlodar', 52.315556, 76.956389, 'Павлодар', 'Павлодар', 'Pavlodar'),
  c('oskemen', 49.948325, 82.627848, 'Усть-Каменогорск', 'Өскемен', 'Oskemen'),
  c('semey', 50.404976, 80.249235, 'Семей', 'Семей', 'Semey'),
  c('atyrau', 47.116667, 51.883333, 'Атырау', 'Атырау', 'Atyrau'),
  c('kostanay', 53.219333, 63.634194, 'Костанай', 'Қостанай', 'Kostanay'),
  c('kyzylorda', 44.842544, 65.502563, 'Кызылорда', 'Қызылорда', 'Kyzylorda'),
  c('oral', 51.204019, 51.370537, 'Уральск', 'Орал', 'Oral'),
  c('petropavl', 54.862222, 69.140833, 'Петропавловск', 'Петропавл', 'Petropavl'),
  c('aktau', 43.635379, 51.169135, 'Актау', 'Ақтау', 'Aktau'),
  c('turkistan', 43.302025, 68.268979, 'Туркестан', 'Түркістан', 'Turkistan'),
  c('taldykorgan', 45.017837, 78.382123, 'Талдыкорган', 'Талдықорған', 'Taldykorgan'),
  c('kokshetau', 53.291667, 69.391667, 'Кокшетау', 'Көкшетау', 'Kokshetau'),
  c('ekibastuz', 51.729778, 75.326583, 'Экибастуз', 'Екібастұз', 'Ekibastuz'),
  c('zhezkazgan', 47.799711, 67.71409, 'Жезказган', 'Жезқазған', 'Zhezkazgan'),
]

export const DEFAULT_CITY: KzCity = KZ_CITIES[0]
/** Свой ключ: город экрана «Намаз, кибла» (jurt.city — Мекка/Медина) — другой выбор, их не смешиваем */
export const CITY_KEY = 'jurt.today.city'

export function cityById(id: string): KzCity {
  return KZ_CITIES.find(x => x.id === id) ?? DEFAULT_CITY
}

/** Ближайший город списка к точке (по дуге большого круга) */
export function nearestCity(lat: number, lon: number): KzCity {
  let best = DEFAULT_CITY, bestKm = Infinity
  for (const x of KZ_CITIES) {
    const d = km(lat, lon, x.lat, x.lon)
    if (d < bestKm) { best = x; bestKm = d }
  }
  return best
}

export function readCityId(): string {
  const v = ls.get(CITY_KEY)
  return KZ_CITIES.some(x => x.id === v) ? v : DEFAULT_CITY.id
}

export function saveCityId(id: string): void {
  ls.set(CITY_KEY, cityById(id).id)
}
