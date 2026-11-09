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
  const raw = day.items.map(i => {
    const hm = [...i.t.matchAll(/(\d{1,2}):(\d{2})/g)].map(m => +m[1] * 60 + +m[2])
    if (/^\s*до\s/i.test(i.t)) return { i, s: null as number | null, e: hm[0] ?? null, exact: false }
    if (hm.length) return { i, s: hm[0] as number | null, e: hm[1] ?? null, exact: !/≈/.test(i.t) }
    const w = WORDS.find(([re]) => re.test(i.t.trim()))
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
  const days = p.days
  const first = days[0], last = days[days.length - 1]
  const w0 = wall(now, tzOf(first))
  if (w0.iso < first.date) {
    const d = Math.ceil((Date.parse(first.date) - Date.parse(w0.iso)) / 86_400_000)
    return { kind: 'before', first, days: d }
  }
  for (let k = 0; k < days.length; k++) {
    const day = days[k], w = wall(now, tzOf(day))
    // хвост вчерашнего дня (пункты после полуночи: «00:20 в отеле»)
    const nextDay = days[k + 1]
    if (nextDay && wall(now, tzOf(nextDay)).iso === nextDay.date) {
      const list = slots(day), m = w.min + 1440
      if (w.iso === nextDay.date && list.some(x => x.e > m && x.s <= m)) return at(day, list, m, nextDay)
    }
    if (w.iso === day.date) return at(day, slots(day), w.min, nextDay)
  }
  return { kind: 'after', last }
}

function at(day: ProgramDay, list: Slot[], min: number, tomorrow?: ProgramDay): Phase {
  let cur = -1
  list.forEach((x, k) => { if (x.s <= min && min < x.e) cur = k })
  if (cur < 0) list.forEach((x, k) => { if (x.s <= min) cur = k })
  const after = list.findIndex(x => x.s > min)
  const nxt = after >= 0 ? after : -1
  // день закончился (последний пункт давно прошёл) — показываем «завтра»
  if (cur === list.length - 1 && min >= list[cur].e) cur = -2
  return { kind: 'day', day, list, cur, nxt, min, tomorrow }
}

/** «через 1 ч 20 мин» */
export function leftText(mins: number, h: string, m: string) {
  const a = Math.max(0, Math.round(mins)), hh = Math.floor(a / 60), mm = a % 60
  return (hh ? `${hh} ${h} ` : '') + `${mm} ${m}`
}

/** К какому шагу умры относится пункт программы (для кнопки «Шаги рядом») */
export function stepFor(i: ProgramItem): string | null {
  const s = (i.w + ' ' + (i.m || '')).toLowerCase()
  if (/намерение|тальби|2 ракаата, намер/.test(s)) return 'rakat'
  if (/умр[аы](?![а-яё])|умра всей|умра —/.test(s) && !/урок/.test(s)) return 'enter'
  if (/таваф/.test(s)) return 'tawaf'
  if (/ихрам/.test(s) && /гусль/.test(s)) return 'ghusl'
  if (/ихрам/.test(s) && !/урок|примерка|пока не/.test(s)) return 'ihram'
  if (/(?<![а-яё])сай(?![а-яё])|сафа|марв/.test(s)) return 'sai'
  return null
}
