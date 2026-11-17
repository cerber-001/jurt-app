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

/* Публичная версия v3 — без имён «авторитетов» (решение 25.10.2026: устаз обезличен).
   Сами имена в публичном коде не хранятся: только их отпечаток (FNV-1a, 32 бита) от слова в нижнем регистре.
   Добавить имя: node -e "…" с той же функцией fnv — см. program.test.ts. */
const HIDDEN_NAMES: ReadonlySet<number> = new Set([0xcd3b1fe0])
/** Падежные окончания имени: «…а», «…у», «…ом», «…е» */
const CASE_ENDING = /(?:ом|а|у|е)$/
/** Слово с заглавной буквы; \b в JS не видит границ русских слов — границы заданы явно */
const CAP_WORD = /(?<![А-Яа-яЁё])[А-ЯЁ][а-яё]+(?![А-Яа-яЁё])/g

function fnv(s: string): number {
  let h = 0x811c9dc5
  for (const ch of s) { h ^= ch.codePointAt(0) ?? 0; h = Math.imul(h, 0x01000193) >>> 0 }
  return h
}

const isHidden = (word: string, hidden: ReadonlySet<number>): boolean => {
  const w = word.toLowerCase()
  return hidden.has(fnv(w)) || hidden.has(fnv(w.replace(CASE_ENDING, '')))
}

export function anonymize(p: Program, hidden: ReadonlySet<number> = HIDDEN_NAMES): Program {
  const fix = (s: string) =>
    s.replace(/духовный наставник\s+[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+/g, 'духовный наставник группы')
     .replace(CAP_WORD, w => (isHidden(w, hidden) ? 'наставник' : w))
  const hasHidden = (s: string) => (s.match(CAP_WORD) ?? []).some(w => isHidden(w, hidden))
  const days = p.days.map(d => ({
    ...d,
    items: d.items.map(i => ({ ...i, who: i.who && hasHidden(i.who) ? 'наставник' : i.who, m: i.m ? fix(i.m) : i.m })),
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

/* ───── Связь пункта программы с шагом умры (кнопка «Шаги рядом» на «Сейчас») ─────
   Программа пишется по-русски, но правила знают и казахские, и английские слова: id шага один на все языки,
   а шаг на экране берётся из контента на языке интерфейса. Если пункт называет несколько шагов
   («Умра всей группой: таваф, 2 ракаата, Замзам, сай, стрижка»), берём самый ранний по порядку умры —
   экран «Сейчас» дальше сам пропустит уже отмеченные шаги. */

/** id шагов умры в порядке контента (steps.json) */
export const STEP_IDS = ['ghusl', 'ihram', 'rakat', 'niyya', 'talbiya', 'enter', 'tawaf', 'maqam', 'zamzam', 'sai', 'halq'] as const
export type StepId = typeof STEP_IDS[number]

/** Буквы — для границ слов: \b в JS не видит кириллицу и казахские буквы */
const L = 'a-zа-яёәғқңөұүһі'
const word = (s: string) => new RegExp(`(?<![${L}])(?:${s})`)

interface StepRule {
  id: StepId
  /** слова шага */
  re: RegExp
  /** без этих слов рядом совпадение не считается («2 ракаата» — у ихрама или у Макама?) */
  ctx?: RegExp
  /** найденный шаг перекрывает эти («2 ракаата ихрама» — не шаг «ихрам») */
  hides?: StepId[]
  /** можно искать и в примечании m (там случайные упоминания: «Замзам 5 л — в аэропорту») */
  inNote?: boolean
}

const RULES: StepRule[] = [
  { id: 'ghusl', re: /гусль|ғұсыл|ghusl/, ctx: /ихрам|ihram|умр|umrah/ },
  { id: 'ihram', re: /ихрам|ihram/, inNote: true },
  { id: 'rakat', re: /ракаат|рәкағат|rak['‘’]?a/, ctx: /ихрам|ihram|намерени|ният|ниет|intention|niyy|тальби|тәлбия|talbiy|микат|миқат|miqat/, hides: ['ihram'], inNote: true },
  { id: 'niyya', re: /намерени|ният|ниет|niyy|intention/, inNote: true },
  { id: 'talbiya', re: /тальби|тәлбия|talbiy/, inNote: true },
  { id: 'enter', re: word('умр[аыуе]|umrah?(?![a-z])|вход в мечеть|вход в харам|мешітке кір|enter(?:ing)? the mosque') },
  { id: 'tawaf', re: /таваф|тауап|tawaf/, inNote: true },
  { id: 'maqam', re: /макам|мақам|maqam/, hides: ['tawaf'] },
  { id: 'zamzam', re: /замзам|зәмзәм|zamzam/ },
  { id: 'sai', re: word(`са[йи](?![${L}])|сағи|сафа|марв|sa['‘’]?i(?![a-z])|safa|marwa`), inNote: true },
  { id: 'halq', re: word('стрижк|постри|бритьё|бритье|побри|халк|шаш ал|шаш қырқ|шашты|haircut|shav|trim|halq|выход из ихрама'), hides: ['ihram'] },
]

/** Пункт не про сам обряд: урок, примерка, «пока не надеваем» */
const NOT_RITE = /урок|примерк|пока не|сабақ|әзірге|lesson|fitting|not yet/

function stepIn(text: string, note: boolean): StepId | null {
  const s = text.toLowerCase()
  if (!s.trim() || NOT_RITE.test(s)) return null
  const found = RULES.filter(r => (!note || r.inNote) && r.re.test(s) && (!r.ctx || r.ctx.test(s)))
  const hidden = new Set(found.flatMap(r => r.hides ?? []))
  return found.find(r => !hidden.has(r.id))?.id ?? null
}

/** К какому шагу умры относится пункт программы: сначала по названию w, если там пусто — по примечанию m */
export function stepFor(i: ProgramItem): StepId | null {
  if (NOT_RITE.test(i.w.toLowerCase())) return null
  return stepIn(i.w, false) ?? stepIn(i.m ?? '', true)
}
