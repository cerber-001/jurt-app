/* 2.0 этап 1: «Урок дня» — 30 коротких уроков (public/content/lessons.json, kk/lessons.json).
   Правило заказчика: в публичный репозиторий попадает только текст, проверенный знатоком. Пока не проверен
   ни один урок — у всех status: 'preparing', без текста; приложение честно пишет «урок готовится».
   Урок дня — дни с первого показа карточки + 1 (не больше 30). Никаких «прочитано подряд», серий и процентов. */
import { signal } from '@preact/signals'
import { fetchLocalized } from './content'
import { lang, ls, type Lang } from './store'
import { tf } from './i18n'

export const LESSON_COUNT = 30
/** Сколько минут чтения у урока, если в файле не указано */
export const LESSON_MINUTES = 3

export interface LessonCheck { q: string; options: string[]; answer: number; explain: string }
export interface Lesson {
  n: number
  title: string | null
  status: 'ready' | 'preparing'
  minutes?: number
  paragraphs?: string[]
  sources?: string[]
  check?: LessonCheck
}

const DAY_MS = 86_400_000
const START_KEY = 'jurt.lesson.start'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const isIso = (s: string) => ISO_DATE.test(s) && !Number.isNaN(Date.parse(s))

/** Дата по часам телефона (YYYY-MM-DD). Экраны берут «сегодня» по Казахстану — kzToday() из today-day.ts */
export function localIso(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Номер урока: дни от старта + 1, от 1 до 30 */
export function lessonNumber(start: string, today: string): number {
  if (!isIso(start) || !isIso(today)) return 1
  const d = Math.round((Date.parse(today) - Date.parse(start)) / DAY_MS)
  return Math.min(LESSON_COUNT, Math.max(1, d + 1))
}

/** Дата первого показа «Урока дня» или '' */
export function readLessonStart(): string {
  const v = ls.get(START_KEY)
  return isIso(v) ? v : ''
}

/** Урок дня. start=true — карточка показана: если старта ещё нет (или он испорчен), он ставится на сегодня */
export function lessonOfDay(today: string, start: boolean): number {
  let s = readLessonStart()
  if (!s && start) { s = today; ls.set(START_KEY, s) }
  return s ? lessonNumber(s, today) : 1
}

/** Название урока: своё или «Урок N» */
export function lessonTitle(l: Lesson): string {
  return l.title ?? tf('ls.n', { n: l.n })
}

const isStrList = (x: unknown) => Array.isArray(x) && x.every(s => typeof s === 'string')

function isCheck(x: unknown): x is LessonCheck {
  if (!x || typeof x !== 'object') return false
  const c = x as Record<string, unknown>
  return typeof c.q === 'string' && isStrList(c.options) && (c.options as string[]).length >= 2
    && Number.isInteger(c.answer) && (c.answer as number) >= 0 && (c.answer as number) < (c.options as string[]).length
    && typeof c.explain === 'string'
}

function isLesson(x: unknown): x is Lesson {
  if (!x || typeof x !== 'object') return false
  const l = x as Record<string, unknown>
  return Number.isInteger(l.n) && (l.title === null || typeof l.title === 'string')
    && (l.status === 'ready' || l.status === 'preparing')
    && (l.minutes === undefined || typeof l.minutes === 'number')
    && (l.paragraphs === undefined || isStrList(l.paragraphs))
    && (l.sources === undefined || isStrList(l.sources))
    && (l.check === undefined || isCheck(l.check))
}

/** Файл уроков в ожидаемом виде (внешние данные не принимаем на веру) */
export function isLessons(x: unknown): x is Lesson[] {
  return Array.isArray(x) && x.length > 0 && x.every(isLesson)
}

/** Уроки на языке интерфейса (или null, пока не загружены); загружаются fetch-ем, не входят в первый файл JS */
export const lessons = signal<{ lang: Lang; list: Lesson[] } | null>(null)
/** Уроки не загрузились (нет сети и нет копии в офлайн-кэше) */
export const lessonsError = signal(false)

/** Загрузить уроки на языке l (нет перевода — русский). Уже загруженные на этом языке не перезапрашиваются */
export async function loadLessons(l: Lang): Promise<void> {
  if (lessons.value?.lang === l) return
  try {
    const r = await fetchLocalized<unknown>('lessons.json', l)
    if (!isLessons(r.data)) throw new Error('lessons.json: bad format')
    if (lang.value !== l) return                     // пока грузили, язык сменили — устаревший ответ не нужен
    lessons.value = { lang: l, list: r.data }
    lessonsError.value = false
  } catch {
    if (!lessons.value) lessonsError.value = true   // уроки на прежнем языке остаются на экране
  }
}

/** Урок по номеру из загруженного списка */
export function lessonAt(n: number): Lesson | null {
  return lessons.value?.list.find(x => x.n === n) ?? null
}
