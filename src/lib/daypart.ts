/* Время суток в городе паломника — для фона карточки «Сейчас».
   Границы берём не по часам, а по солнцу этого города (prayer.ts): рассвет — от фаджра до 45 минут после восхода,
   закат — от 50 минут до магриба до иша, ночь — от иша до фаджра, остальное — день. */
import { times } from './prayer'

export type DayPart = 'dawn' | 'day' | 'dusk' | 'night'
export const DAY_PARTS: readonly DayPart[] = ['dawn', 'day', 'dusk', 'night']

/** Сколько минут после восхода ещё держится «рассвет» */
const DAWN_TAIL = 45
/** За сколько минут до магриба начинается «закат» */
const DUSK_LEAD = 50

interface Place { lat: number; lon: number; tz: number; method: string }

/** Часть суток по минутам от полуночи и временам намаза этого дня */
export function partAt(min: number, t: { fajr: number; sunrise: number; maghrib: number; isha: number }): DayPart {
  if (min < t.fajr || min >= t.isha) return 'night'
  if (min < t.sunrise + DAWN_TAIL) return 'dawn'
  if (min >= t.maghrib - DUSK_LEAD) return 'dusk'
  return 'day'
}

/** Часть суток сейчас в городе place; wallMin — «стенные» минуты этого города */
export function dayPart(now: Date, wallMin: number, place: Place): DayPart {
  return partAt(wallMin, times(now, place.lat, place.lon, place.tz, place.method))
}
