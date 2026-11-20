/* 2.0 этап 1 «Каждый день»: режим приложения и расчёты экрана «Мой путь».
   Режим: «поездка» — сегодня день поездки по программе группы (фаза day из where(), в том числе промежутки
   между днями); иначе «каждый день». Программа считается своей, только если есть данные группы: program.json один
   на всё приложение, и человек без группы не должен попадать в чужую поездку. Если в программе указан код группы
   (поле code) и он не совпал с кодом группы паломника — программа тоже чужая (ownProgram).
   Всё хранится только на телефоне: дата поездки — jurt.trip, отметки дел подготовки — jurt.prep. */
import { where } from './clock'
import type { Program } from './program'
import { lang, ls, type Lang } from './store'
import { groupCodeOrEmpty } from './codes'
import { t, tf } from './i18n'

export type Mode = 'trip' | 'everyday'

const DAY_MS = 86_400_000
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const isIso = (s: unknown): s is string => typeof s === 'string' && ISO_DATE.test(s) && !Number.isNaN(Date.parse(s))

/** Программа своей группы или null. Код группы в программе (code) есть и не совпал с кодом паломника — чужая.
    Кода в программе нет (или не известен код паломника, как в демо) — сверить нечем, программа остаётся */
export function ownProgram(p: Program | null, myGroup: string | null | undefined): Program | null {
  if (!p) return null
  const theirs = groupCodeOrEmpty(p.code), mine = groupCodeOrEmpty(myGroup)
  return theirs && mine && theirs !== mine ? null : p
}

/** Режим нижнего меню. hasGroup — есть данные группы (или демо-время ?at=, где программу смотрят без кода) */
export function modeOf(p: Program | null, hasGroup: boolean, now: Date): Mode {
  if (!p || !hasGroup || !p.days?.length) return 'everyday'
  return where(p, now).kind === 'day' ? 'trip' : 'everyday'
}

/* ───── Сохранённая копия программы (program.ts пишет её в jurt.program) ─────
   Нужна, чтобы режим решился сразу при открытии, до ответа сети (иначе меню «мигнёт»). */
const PROGRAM_KEY = 'jurt.program'

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object'
const isDay = (x: unknown) => isObj(x) && isIso(x.date) && Array.isArray(x.items)

/** Копия программы с телефона или null (нет, испорчена, без дней) */
export function savedProgram(): Program | null {
  try {
    const s = JSON.parse(ls.get(PROGRAM_KEY) || 'null') as unknown
    if (!isObj(s) || !isObj(s.raw)) return null
    const days = s.raw.days
    return Array.isArray(days) && days.length > 0 && days.every(isDay) ? (s.raw as unknown as Program) : null
  } catch { return null /* испорченная копия — как будто её нет */ }
}

/* ───── Дата поездки ───── */
const TRIP_KEY = 'jurt.trip'

/** Дата вылета, указанная вручную (YYYY-MM-DD), или '' */
export function readTrip(): string {
  const v = ls.get(TRIP_KEY)
  return isIso(v) ? v : ''
}

/** Сохранить дату вылета; пустая строка очищает. Не-дата не сохраняется */
export function saveTrip(iso: string): void {
  ls.set(TRIP_KEY, isIso(iso) ? iso : '')
}

export interface Trip { start: string; end: string; fromProgram: boolean }

/** Откуда дата поездки: программа группы (пока поездка не закончилась), иначе — указанная вручную;
    закончившаяся программа без новой даты — тоже программа (экран скажет «С возвращением») */
export function tripOf(p: Program | null, hasGroup: boolean, manual: string, today: string): Trip | null {
  const days = p && hasGroup && p.days?.length ? p.days : null
  const prog = days ? { start: days[0].date, end: days[days.length - 1].date, fromProgram: true } : null
  if (prog && today <= prog.end) return prog
  if (isIso(manual)) return { start: manual, end: manual, fromProgram: false }
  return prog
}

/** Целых дней от a до b (b − a) */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS)
}

export type Countdown =
  | { kind: 'before'; days: number }
  | { kind: 'today' }
  | { kind: 'during' }
  | { kind: 'after' }

/** Отсчёт: до вылета, день вылета, в пути (между первым и последним днём программы), после возвращения */
export function countdown(start: string, end: string, today: string): Countdown {
  if (today < start) return { kind: 'before', days: daysBetween(today, start) }
  if (today === start) return { kind: 'today' }
  if (today <= end) return { kind: 'during' }
  return { kind: 'after' }
}

/* ───── Числа и даты ───── */
export type PluralForm = 'one' | 'few' | 'many'

/** Форма слова после числа. По-казахски слово не меняется (берётся одна форма), по-английски — 1 / не 1 */
export function plural(n: number, l: Lang): PluralForm {
  if (l === 'kk') return 'one'
  if (l === 'en') return n === 1 ? 'one' : 'many'
  const a = Math.abs(n) % 100, b = a % 10
  if (a >= 11 && a <= 14) return 'many'
  if (b === 1) return 'one'
  if (b >= 2 && b <= 4) return 'few'
  return 'many'
}

/** «74 дня», «74 күн», «74 days» */
export function daysWord(n: number): string {
  return `${n} ${t('jr.d.' + plural(n, lang.value))}`
}

const MONTHS: Record<Lang, readonly string[]> = {
  ru: ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'],
  kk: ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}

/** Полная дата: ДД.ММ.ГГГГ (ru, kk) или «1 Feb 2027» (en) */
export function fmtFull(iso: string): string {
  if (!isIso(iso)) return iso
  const [y, m, d] = iso.split('-').map(Number)
  if (lang.value === 'en') return `${d} ${MONTHS.en[m - 1].slice(0, 3)} ${y}`
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`
}

/** «февраль 2027» на языке интерфейса */
export function monthYear(iso: string): string {
  if (!isIso(iso)) return ''
  const [y, m] = iso.split('-').map(Number)
  return `${MONTHS[lang.value][m - 1]} ${y}`
}

/** Дата на n дней раньше (YYYY-MM-DD) */
export function dueDate(start: string, daysBefore: number): string {
  return new Date(Date.parse(start) - daysBefore * DAY_MS).toISOString().slice(0, 10)
}

/* ───── Подготовка по дням ─────
   Это отметки ДЕЛ подготовки (документы, сборы), а не поклонения: никаких похвал, очков и звёзд. */
export const PREP_IDS = ['lessons', 'docs', 'talbiya', 'ihram', 'pack', 'amanat'] as const
export type PrepId = typeof PREP_IDS[number]

/** За сколько дней до вылета сделать дело */
export const PREP_DAYS: Readonly<Record<PrepId, number>> = { lessons: 0, docs: 30, talbiya: 14, ihram: 7, pack: 5, amanat: 2 }

export type PrepState = Readonly<Partial<Record<PrepId, true>>>
const PREP_KEY = 'jurt.prep'
const isPrepId = (k: string): k is PrepId => (PREP_IDS as readonly string[]).includes(k)

/** Отметки с телефона; чужие ключи и не-true значения отбрасываются */
export function readPrep(): PrepState {
  try {
    const raw = JSON.parse(ls.get(PREP_KEY) || '{}') as unknown
    if (!isObj(raw)) return {}
    return Object.fromEntries(Object.entries(raw).filter(([k, v]) => isPrepId(k) && v === true)) as PrepState
  } catch { return {} }
}

/** Новая копия отметок с переключённым делом */
export function togglePrep(s: PrepState, id: PrepId): PrepState {
  if (s[id]) {
    const { [id]: _drop, ...rest } = s
    return rest
  }
  return { ...s, [id]: true }
}

export function savePrep(s: PrepState): void {
  ls.set(PREP_KEY, Object.keys(s).length ? JSON.stringify(s) : '')
}

/* ───── «Хочу поехать» ─────
   Номер — только из переменной сборки VITE_LEAD_WA (в коде номера нет). Нет номера — нет ссылки. */
const MIN_PHONE_DIGITS = 10

/** Ссылка WhatsApp с готовым текстом или null, если номер не задан */
export function leadUrl(raw: string | undefined, text: string): string | null {
  const num = (raw ?? '').replace(/\D/g, '')
  if (num.length < MIN_PHONE_DIGITS) return null
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`
}

/** Текст заявки: приветствие и, если дата указана, желаемый месяц */
export function leadText(start: string): string {
  const m = monthYear(start)
  return t('jr.lead.msg') + (m ? ' ' + tf('jr.lead.when', { m }) : '')
}
