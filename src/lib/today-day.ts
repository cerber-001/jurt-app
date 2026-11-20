/* Расчёты дня для экрана «Сегодня»: следующий намаз (с переходом через полночь), утро или вечер для азкаров,
   мысль дня по дате, дата по хиджре. Всё — чистые функции от «стенного» времени Казахстана. */
import type { DayKey, DayTimes } from './dumk'
import { nowOrDemo, wall } from './clock'

/** Казахстан — единый часовой пояс UTC+5 с 01.03.2024 */
export const KZ_TZ = 5

/** «Сегодня» (YYYY-MM-DD) по Казахстану — одна дата для всех экранов: отсчёт до поездки, сроки подготовки,
    урок дня, тасбих. Не по часам телефона: телефон в другом поясе не должен расходиться с «Сегодня».
    Без аргумента — текущий момент (или демо ?at=) */
export function kzToday(now: Date = nowOrDemo()): string {
  return wall(now, KZ_TZ).iso
}
const DAY_MS = 86_400_000
const MIN_PER_DAY = 1440
const PRAYERS: readonly Exclude<DayKey, 'sunrise'>[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']

export interface NextPrayer { key: Exclude<DayKey, 'sunrise'>; min: number; left: number; tomorrow: boolean }

/** Ближайший намаз после минуты nowMin (восход — не намаз); после иша — фаджр завтрашнего дня */
export function nextPrayer(nowMin: number, today: DayTimes, tomorrow: DayTimes): NextPrayer {
  for (const key of PRAYERS) {
    if (today[key] > nowMin) return { key, min: today[key], left: today[key] - nowMin, tomorrow: false }
  }
  return { key: 'fajr', min: tomorrow.fajr, left: MIN_PER_DAY - nowMin + tomorrow.fajr, tomorrow: true }
}

/** Азкары: от фаджра до асра — утро, остальное время — вечер */
export function isMorning(nowMin: number, today: DayTimes): boolean {
  return nowMin >= today.fajr && nowMin < today.asr
}

const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS)
}

/** Номер мысли дня: меняется раз в сутки, одинаков для всех языков в один день */
export function thoughtIndex(iso: string, count: number): number {
  if (count <= 0) return 0
  const n = dayNumber(iso)
  return Number.isFinite(n) ? ((n % count) + count) % count : 0
}

/** Мысль дня. road=false (дата поездки не задана) — только общие мысли (road: false в файле), иначе — из всех.
    Общих в списке нет — берём из всех, чтобы карточка не пустовала */
export function pickThought<T extends { road?: boolean }>(list: readonly T[], iso: string, road: boolean): T | null {
  const general = road ? list : list.filter(x => !x.road)
  const pool = general.length ? general : list
  return pool.length ? pool[thoughtIndex(iso, pool.length)] : null
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10)
}

/** ДД.ММ.ГГГГ */
export function dmy(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
}

/** День недели: 1 — понедельник … 7 — воскресенье */
export function weekday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7
}

export interface Hijri { d: number; m: number; y: number }

/** Дата по хиджре (календарь Умм аль-Кура) на полдень местного дня. Браузер не умеет — null, строку не показываем */
export function hijriParts(iso: string): Hijri | null {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  try {
    const f = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn',
      { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' })
    if (!f.resolvedOptions().calendar.startsWith('islamic')) return null
    const parts = f.formatToParts(new Date(Date.UTC(y, m - 1, d, 12 - KZ_TZ)))
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value)
    const h = { d: get('day'), m: get('month'), y: get('year') }
    return h.d >= 1 && h.d <= 30 && h.m >= 1 && h.m <= 12 && h.y > 1400 ? h : null
  } catch { return null }
}
