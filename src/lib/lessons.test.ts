/* «Урок дня»: номер урока по дням с первого открытия, предел 30, проверка формата lessons.json */
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { memoryStorage } from '../../tests/helpers/memoryStorage'
import { LESSON_COUNT, isLessons, lessonNumber, lessonOfDay, lessonTitle, localIso, readLessonStart } from './lessons'
import { lang } from './store'

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()) })
afterEach(() => { vi.unstubAllGlobals(); lang.value = 'ru' })

describe('номер урока дня', () => {
  test('первый день — урок 1, дальше по дню', () => {
    expect(lessonNumber('2026-11-20', '2026-11-20')).toBe(1)
    expect(lessonNumber('2026-11-20', '2026-11-21')).toBe(2)
    expect(lessonNumber('2026-11-20', '2026-12-04')).toBe(15)
  })

  test('не больше 30 и не меньше 1 (часы переведены назад)', () => {
    expect(lessonNumber('2026-11-20', '2026-12-19')).toBe(30)
    expect(lessonNumber('2026-11-20', '2027-06-01')).toBe(LESSON_COUNT)
    expect(lessonNumber('2026-11-20', '2026-11-01')).toBe(1)
    expect(lessonNumber('мусор', '2026-11-20')).toBe(1)
  })

  test('дата старта ставится при первом показе и дальше не меняется', () => {
    expect(readLessonStart()).toBe('')
    expect(lessonOfDay('2026-11-20', true)).toBe(1)
    expect(localStorage.getItem('jurt.lesson.start')).toBe('2026-11-20')
    expect(lessonOfDay('2026-11-23', true)).toBe(4)
    expect(localStorage.getItem('jurt.lesson.start')).toBe('2026-11-20')
  })

  test('без права старта (просто посмотреть номер) дата не ставится', () => {
    expect(lessonOfDay('2026-11-20', false)).toBe(1)
    expect(localStorage.getItem('jurt.lesson.start')).toBeNull()
  })

  test('испорченная дата старта — начинаем заново с сегодня', () => {
    localStorage.setItem('jurt.lesson.start', 'вчера')
    expect(lessonOfDay('2026-11-20', true)).toBe(1)
    expect(localStorage.getItem('jurt.lesson.start')).toBe('2026-11-20')
  })

  test('сегодняшняя дата — по часам телефона', () => {
    expect(localIso(new Date(2026, 10, 5, 23, 59))).toBe('2026-11-05')
  })
})

describe('формат уроков', () => {
  test('готовящийся урок и готовый урок с проверкой — подходят', () => {
    expect(isLessons([{ n: 1, title: null, status: 'preparing' }])).toBe(true)
    expect(isLessons([{ n: 1, title: 'А', status: 'ready', paragraphs: ['п'], sources: ['и'], check: { q: 'в', options: ['а', 'б'], answer: 1, explain: 'п' } }])).toBe(true)
  })

  test('испорченное — не подходит', () => {
    expect(isLessons(null)).toBe(false)
    expect(isLessons([{ n: '1', title: null, status: 'preparing' }])).toBe(false)
    expect(isLessons([{ n: 1, title: null, status: 'done' }])).toBe(false)
    expect(isLessons([{ n: 1, title: 'А', status: 'ready', check: { q: 'в', options: ['а'], answer: 3, explain: '' } }])).toBe(false)
  })

  test('название: своё или «Урок N»', () => {
    expect(lessonTitle({ n: 16, title: null, status: 'preparing' })).toBe('Урок 16')
    expect(lessonTitle({ n: 2, title: 'Намерение', status: 'preparing' })).toBe('Намерение')
    lang.value = 'kk'
    expect(lessonTitle({ n: 16, title: null, status: 'preparing' })).toBe('16-сабақ')
  })
})

describe('файлы уроков в public/content', () => {
  const load = (rel: string) => JSON.parse(readFileSync(new URL('../../public/content/' + rel, import.meta.url), 'utf8')) as unknown
  test.each(['lessons.json', 'kk/lessons.json'])('%s: 30 уроков по порядку, верный формат', f => {
    const l = load(f)
    expect(isLessons(l)).toBe(true)
    const list = l as { n: number }[]
    expect(list.map(x => x.n)).toEqual(Array.from({ length: 30 }, (_, k) => k + 1))
  })

  test.each(['lessons.json', 'kk/lessons.json'])('%s: ни один урок не проверен знатоком — все «готовится», без текста', f => {
    const list = load(f) as Record<string, unknown>[]
    for (const x of list) {
      expect(x.status, String(x.n)).toBe('preparing')
      expect(x.paragraphs, String(x.n)).toBeUndefined()
      expect(x.sources, String(x.n)).toBeUndefined()
      expect(x.check, String(x.n)).toBeUndefined()
    }
  })

  test('названия есть у 1–15, у 16–30 — нет (ru и kk)', () => {
    for (const f of ['lessons.json', 'kk/lessons.json']) {
      const list = load(f) as { n: number; title: string | null }[]
      expect(list.filter(x => x.n <= 15).every(x => typeof x.title === 'string' && x.title.length > 3), f).toBe(true)
      expect(list.filter(x => x.n > 15).every(x => x.title === null), f).toBe(true)
    }
  })
})
