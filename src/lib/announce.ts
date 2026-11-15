/* Свежесть объявления группы. Сервер отдаёт время как «ДД.ММ ЧЧ:ММ» по Алматы (UTC+5), без года
   (supabase: private.v3_announcement → v3_fmt(..., 'Asia/Almaty', 'DD.MM HH24:MI')).
   Свежее объявление экран «Сейчас» показывает строкой над главной карточкой, остальное — под ней. */

/** Сколько часов объявление считается свежим */
export const FRESH_HOURS = 6

const ALMATY_UTC_HOURS = 5
const HOUR_MS = 3_600_000
/** Допуск на расхождение часов телефона и сервера */
const CLOCK_SKEW_MS = 15 * 60_000

/** Момент объявления; null — строку разобрать не удалось. Год — ближайший, при котором дата не в будущем. */
export function announcedAt(at: string, now: Date): Date | null {
  const m = at.match(/^\s*(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})\s*$/)
  if (!m) return null
  const [day, month, hour, minute] = [+m[1], +m[2], +m[3], +m[4]]
  if (day < 1 || day > 31 || month < 1 || month > 12 || hour > 23 || minute > 59) return null
  const year = new Date(now.getTime() + ALMATY_UTC_HOURS * HOUR_MS).getUTCFullYear()
  const inYear = (y: number) => new Date(Date.UTC(y, month - 1, day, hour - ALMATY_UTC_HOURS, minute))
  const thisYear = inYear(year)
  return thisYear.getTime() > now.getTime() + 24 * HOUR_MS ? inYear(year - 1) : thisYear
}

/** Объявление моложе FRESH_HOURS часов */
export function isFresh(at: string | undefined, now: Date): boolean {
  if (!at) return false
  const when = announcedAt(at, now)
  if (!when) return false
  const age = now.getTime() - when.getTime()
  return age >= -CLOCK_SKEW_MS && age < FRESH_HOURS * HOUR_MS
}
