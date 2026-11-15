/* Программа тура: тот же program.json, что публикует v2 (адрес — VITE_PROGRAM_URL).
   Пока источник один — правка там видна здесь сразу. В фазе 2 переедет в Supabase.
   Сервис-воркер program.json НЕ кэширует (vite.config.ts): запрос всегда идёт в сеть, с таймаутом.
   Без сети, при зависшей сети (таймаут) или испорченном ответе — копия в localStorage (jurt.program)
   с датой сохранения, чтобы паломник видел, что программа не свежая. Испорченная копия не используется. */
import { t } from './i18n'
import { ls } from './store'

export interface ProgramItem {
  t: string; w: string; p?: string; m?: string; tr?: string; who?: string; pay?: string; st?: string
}
export interface ProgramDay { id: string; date: string; city: string; items: ProgramItem[]; title?: string; tz?: string }
export interface Program {
  title: string; subtitle: string; group: string; updated: string; version: string
  legend: Record<string, string> | string[]
  incl: string[]; excl: string[]; pay_rule: string
  days: ProgramDay[]
  decisions: unknown
}

/** Программа и откуда она: savedAt = null — свежая из сети; число — сохранённая копия (мс; 0 — дата неизвестна) */
export interface ProgramLoad { program: Program; savedAt: number | null }

const URL = import.meta.env.VITE_PROGRAM_URL as string
const SAVE_KEY = 'jurt.program'

interface Saved { at: number; raw: Program }

/* Публичная версия v3 — без имён «авторитетов» (решение 25.10.2026: устаз обезличен) */
export function anonymize(p: Program): Program {
  const fix = (s: string) =>
    s.replace(/духовный наставник\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+/g, 'духовный наставник группы')
     // \b в JS не видит границ русских слов — границы заданы явно
     .replace(/(?<![А-Яа-яЁё])Даурен(?:а|у|ом|е)?(?![А-Яа-яЁё])/g, 'наставник')
  const days = p.days.map(d => ({
    ...d,
    items: d.items.map(i => ({ ...i, who: i.who && /Даурен/.test(i.who) ? 'наставник' : i.who, m: i.m ? fix(i.m) : i.m })),
  }))
  return { ...p, group: fix(p.group), days }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object'
const isItem = (x: unknown) => isObj(x) && typeof x.t === 'string' && typeof x.w === 'string'
const isDay = (x: unknown) =>
  isObj(x) && typeof x.date === 'string' && ISO_DATE.test(x.date) && Array.isArray(x.items) && x.items.every(isItem)

/** Форма, на которую опираются часы и экраны: непустой days, у дня дата YYYY-MM-DD и items, у пункта строки t и w */
const isProgram = (x: unknown): x is Program =>
  isObj(x) && Array.isArray(x.days) && x.days.length > 0 && x.days.every(isDay)

function readSaved(): Saved | null {
  try {
    const s = JSON.parse(ls.get(SAVE_KEY) || 'null') as Saved | null
    return s && typeof s.at === 'number' && isProgram(s.raw) ? s : null
  } catch { return null /* испорченная копия — как будто её нет */ }
}

/** ls.set сам ловит переполнение хранилища: тогда копии нет, и без сети покажется ошибка */
function save(raw: Program) { ls.set(SAVE_KEY, JSON.stringify({ at: Date.now(), raw } satisfies Saved)) }

/** Сколько ждать сеть: с копией — недолго (есть что показать), без копии — дольше (показать нечего) */
const TIMEOUT_WITH_COPY_MS = 6_000
const TIMEOUT_NO_COPY_MS = 20_000

async function fromNetwork(timeoutMs: number): Promise<Program> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(URL, { cache: 'no-cache', signal: ctrl.signal })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const raw: unknown = await r.json()
    if (!isProgram(raw)) throw new Error('program.json: bad format')
    return raw
  } catch (e) {
    throw ctrl.signal.aborted ? new Error('timeout ' + timeoutMs / 1000 + ' s') : e
  } finally {
    clearTimeout(timer)
  }
}

const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false

/** Программа: из сети (и сохранить копию) или, если сети нет / она висит / ответ испорчен, — сохранённая копия с её датой */
export async function loadProgramData(): Promise<ProgramLoad> {
  const saved = readSaved()
  if (offline() && saved) return { program: anonymize(saved.raw), savedAt: saved.at }
  try {
    // сервис-воркер program.json не кэширует: удачный ответ — всегда из сети, даже если onLine ошибочно false
    const raw = await fromNetwork(saved ? TIMEOUT_WITH_COPY_MS : TIMEOUT_NO_COPY_MS)
    save(raw)
    return { program: anonymize(raw), savedAt: null }
  } catch (e) {
    if (saved) return { program: anonymize(saved.raw), savedAt: saved.at }
    throw new Error(t('prog.err') + ' (' + (e as Error).message + ')')
  }
}

/** Прежний API: только программа (используется в group.tsx) */
export async function fetchProgram(): Promise<Program> {
  return (await loadProgramData()).program
}
