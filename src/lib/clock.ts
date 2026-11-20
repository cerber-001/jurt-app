/* Часы паломника и разбор времени программы.
   Время в program.json — свободный текст («03:15», «06:15 → 10:35», «≈12:40», «После зухра», «Вечер», «до 11:00»),
   поэтому разбор терпимый: первое ЧЧ:ММ — начало, второе — конец; слова — примерное время; «до ЧЧ:ММ» — только конец.
   Демо-время: ?at=2026-11-01T22:30 — «стенные» часы города программы в этот момент; дальше идут как обычные. */
import { useEffect, useState } from 'preact/hooks'
import type { Program, ProgramDay, ProgramItem } from './program'

/** «UTC+3» → 3 */
export function tzOf(day?: ProgramDay, fallback = 3): number {
  const m = day?.tz?.match(/UTC\s*([+-]\d+(?:\.\d+)?)/i)
  return m ? Number(m[1]) : fallback
}

const AT = (() => { try { return new URLSearchParams(location.search).get('at') || '' } catch { return '' } })()
const STARTED = Date.now()
export const demo = !!AT

function demoNow(p: Program | null): Date | null {
  const m = AT.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{1,2}):(\d{2}))?$/)
  if (!m) return null
  const day = p?.days.find(d => d.date === m[1])
  const tz = tzOf(day)
  const utc = Date.parse(m[1] + 'T00:00:00Z') + ((+(m[2] ?? 12)) * 60 + +(m[3] ?? 0) - tz * 60) * 60_000
  return new Date(utc + (Date.now() - STARTED))
}

/** «Сейчас» без подписки на обновление: демо-время ?at= (пояс — по умолчанию), иначе часы телефона */
export function nowOrDemo(): Date {
  return demoNow(null) ?? new Date()
}

/** Текущее время (или демо), обновляется раз в 30 секунд */
export function useNow(p: Program | null): Date {
  const [, tick] = useState(0)
  useEffect(() => { const id = setInterval(() => tick(x => x + 1), 30_000); return () => clearInterval(id) }, [])
  return demoNow(p) ?? new Date()
}

/** Дата YYYY-MM-DD и минуты от полуночи в поясе tz */
export function wall(now: Date, tz: number) {
  const s = new Date(now.getTime() + tz * 3600_000).toISOString()
  return { iso: s.slice(0, 10), min: +s.slice(11, 13) * 60 + +s.slice(14, 16) }
}

const WORDS: [RegExp, number][] = [
  [/^фаджр/i, 300], [/^утр/i, 450], [/^после зухра/i, 790], [/^зухр/i, 735], [/^дн[её]м/i, 780],
  [/^после иша/i, 1230], [/^вечер/i, 1110],
]

export interface Slot { i: ProgramItem; s: number; e: number; exact: boolean }

/** Пункты дня с минутами начала/конца (после полуночи — больше 1440) */
export function slots(day: ProgramDay): Slot[] {
  const items = Array.isArray(day?.items) ? day.items : []                // неожиданные данные — пустой день
  const raw = items.map(i => {
    const t = typeof i?.t === 'string' ? i.t : ''
    const hm = [...t.matchAll(/(\d{1,2}):(\d{2})/g)].map(m => +m[1] * 60 + +m[2])
    if (/^\s*до\s/i.test(t)) return { i, s: null as number | null, e: hm[0] ?? null, exact: false }
    if (hm.length) return { i, s: hm[0] as number | null, e: hm[1] ?? null, exact: !/≈/.test(t) }
    const w = WORDS.find(([re]) => re.test(t.trim()))
    return { i, s: w ? w[1] : null, e: null as number | null, exact: false }
  })
  let prev = -1
  for (const r of raw) {
    if (r.s != null && prev >= 0 && r.s < prev - 360) r.s += 1440          // перешли через полночь
    if (r.s == null) r.s = r.e != null ? Math.max(prev, r.e - 60) : Math.max(prev, 0)
    if (r.e != null && r.e < r.s) r.e += 1440
    if (r.s < prev) r.s = prev                                             // «Вечер» после 20:00 и т. п.
    prev = r.s
  }
  return raw.map((r, k) => {
    const nextS = raw.slice(k + 1).find(x => (x.s as number) > (r.s as number))?.s
    return { i: r.i, s: r.s as number, e: r.e ?? nextS ?? (r.s as number) + 120, exact: r.exact }
  })
}

export type Phase =
  | { kind: 'before'; first: ProgramDay; days: number }
  | { kind: 'after'; last: ProgramDay }
  | { kind: 'day'; day: ProgramDay; list: Slot[]; cur: number; nxt: number; min: number; tomorrow?: ProgramDay }

/** Где мы в программе сейчас: до поездки, после или конкретный пункт дня */
export function where(p: Program, now: Date): Phase {
  const days = Array.isArray(p?.days) ? p.days : []
  // программа без дней (испорченные данные): безопасная фаза, экран покажет «поездка завершена»
  if (!days.length) return { kind: 'after', last: emptyDay() }
  const first = days[0], last = days[days.length - 1]
  const w0 = wall(now, tzOf(first))
  if (w0.iso < first.date) {
    const d = Math.ceil((Date.parse(first.date) - Date.parse(w0.iso)) / DAY_MS)
    return { kind: 'before', first, days: d }
  }
  for (let k = 0; k < days.length; k++) {
    const day = days[k], w = wall(now, tzOf(day)), nextDay = days[k + 1]
    const tail = tailOf(day, nextDay, now, w)
    if (tail) return tail
    if (w.iso === day.date) return at(day, slots(day), w.min, nextDay)
  }
  return between(days, now) ?? { kind: 'after', last }
}

/** Пояс города, где паломник сейчас по программе: день поездки, до неё — первый день, после — последний */
export function tzNow(p: Program, now: Date): number {
  const ph = where(p, now)
  return tzOf(ph.kind === 'day' ? ph.day : ph.kind === 'before' ? ph.first : ph.last)
}

const DAY_MIN = 1440
const DAY_MS = 86_400_000

const emptyDay = (): ProgramDay => ({ id: '', date: '', city: '', items: [] })

/** YYYY-MM-DD следующих суток ('' для нечитаемой даты) */
function nextIso(iso: string): string {
  const t = Date.parse(iso + 'T00:00:00Z')
  return Number.isNaN(t) ? '' : new Date(t + DAY_MS).toISOString().slice(0, 10)
}

/** Хвост дня после полуночи («00:20 в отеле», ночной вылет последнего дня), если он ещё идёт.
    У последнего дня следующего нет — хвост ищется в сутках после его даты по его же поясу. */
function tailOf(day: ProgramDay, nextDay: ProgramDay | undefined, now: Date, w: { iso: string; min: number }): Phase | null {
  const tailDate = nextDay ? nextDay.date : nextIso(day.date)
  if (!tailDate || w.iso !== tailDate) return null
  if (nextDay && wall(now, tzOf(nextDay)).iso !== nextDay.date) return null
  const list = slots(day), m = w.min + DAY_MIN
  return list.some(x => x.e > m && x.s <= m) ? at(day, list, m, nextDay) : null
}

/** Поездка идёт, но «сегодня» не совпало ни с одним днём программы: окно смены часового пояса
    (по часам прошлого города уже завтра, по часам следующего ещё вчера) или день, которого нет в программе.
    Тогда это хвост последнего начавшегося дня — покажем «на сегодня всё» и что будет дальше. */
function between(days: ProgramDay[], now: Date): Phase | null {
  for (let k = days.length - 2; k >= 0; k--) {
    const day = days[k], next = days[k + 1], w = wall(now, tzOf(day))
    if (w.iso > day.date && wall(now, tzOf(next)).iso < next.date) {
      const passed = Math.round((Date.parse(w.iso) - Date.parse(day.date)) / DAY_MS)
      return at(day, slots(day), w.min + passed * DAY_MIN, next)
    }
  }
  return null
}

function at(day: ProgramDay, list: Slot[], min: number, tomorrow?: ProgramDay): Phase {
  // текущий — только тот, что идёт прямо сейчас; закончившийся по явному концу («06:15 → 10:35») текущим не бывает.
  // Пункты без явного конца длятся до начала следующего, поэтому разрыва между ними нет.
  let cur = -1
  list.forEach((x, k) => { if (x.s <= min && min < x.e) cur = k })
  const nxt = list.findIndex(x => x.s > min)
  // день закончился: все пункты начались и прошли, следующего нет — показываем «завтра»
  if (cur < 0 && nxt < 0 && list.length > 0) cur = -2
  return { kind: 'day', day, list, cur, nxt, min, tomorrow }
}

/** «через 1 ч 20 мин» */
export function leftText(mins: number, h: string, m: string) {
  const a = Math.max(0, Math.round(mins)), hh = Math.floor(a / 60), mm = a % 60
  return (hh ? `${hh} ${h} ` : '') + `${mm} ${m}`
}

// Связь пункта программы с шагом умры живёт в program.ts (находит все 11 шагов на ru/kk/en); здесь — прежний адрес для импортов
export { stepFor } from './program'
