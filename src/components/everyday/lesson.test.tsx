// @vitest-environment jsdom
/* «Урок дня»: карточка на «Сегодня» и окно чтения. Готовый урок проверяется на вымышленном нейтральном
   уроке прямо в тесте (в public/content готовых уроков нет — ни один ещё не проверен знатоком) */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { memoryStorage } from '../../../tests/helpers/memoryStorage'
import { LessonCard, LessonReader, lessonOpen } from './lesson'
import { lessons, type Lesson } from '../../lib/lessons'

/** Вымышленный урок для проверки логики окна: без религиозных утверждений */
const FIXTURE: Lesson = {
  n: 1, title: 'Как читать карту метро', status: 'ready', minutes: 3,
  paragraphs: ['Линии обозначены цветами.', 'Пересадка отмечена кружком.'],
  sources: ['Тестовый источник, с. 1'],
  check: { q: 'Чем отмечена пересадка?', options: ['Квадратом', 'Кружком', 'Звёздочкой'], answer: 1, explain: 'Так нарисовано на схеме.' },
}
const PREP = (n: number, title: string | null = null): Lesson => ({ n, title, status: 'preparing' })
const LIST: Lesson[] = [FIXTURE, PREP(2, 'Намерение'), ...Array.from({ length: 28 }, (_, k) => PREP(k + 3))]

let root: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  // сеть не нужна: уроки уже в сигнале; запрос, если случится, не ответит и ничего не перезапишет
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 20, 10, 0))
  lessons.value = { lang: 'ru', list: LIST }
  root = document.createElement('div'); document.body.append(root)
  history.replaceState(null, '')
})
afterEach(async () => {
  await act(() => { lessonOpen.value = null })
  render(null, root); root.remove()
  vi.useRealTimers(); vi.unstubAllGlobals()
})

const text = () => root.textContent ?? ''
const btn = (label: string) => [...root.querySelectorAll('button')].find(b => b.textContent?.trim() === label)

describe('карточка «Урок дня»', () => {
  test('первый показ — урок 1 из 30, дата старта сохраняется', async () => {
    await act(() => { render(<LessonCard go={() => {}} />, root) })
    expect(text()).toContain('Урок дня · 3 мин')
    expect(text()).toContain('Урок 1. Как читать карту метро')
    expect(text()).toContain('Урок 1 из 30')
    expect(localStorage.getItem('jurt.lesson.start')).toBe('2026-11-20')
  })

  test('на второй день — урок 2; готовящийся урок спокойно помечен', async () => {
    localStorage.setItem('jurt.lesson.start', '2026-11-19')
    await act(() => { render(<LessonCard go={() => {}} />, root) })
    expect(text()).toContain('Урок 2. Намерение')
    expect(text()).toContain('Урок готовится: текст проверяет знаток')
  })

  test('приложение открыто через полночь — урок дня сменился без перезапуска', async () => {
    await act(() => { render(<LessonCard go={() => {}} />, root) })
    expect(text()).toContain('Урок 1 из 30')
    vi.setSystemTime(new Date(2026, 10, 21, 0, 5))
    await act(() => { render(<LessonCard go={() => {}} />, root) })   // очередная перерисовка (минутный тик «Сегодня»)
    expect(text()).toContain('Урок 2 из 30')
    expect(localStorage.getItem('jurt.lesson.start')).toBe('2026-11-20')   // старт не переписан
  })

  test('кнопка только «Читать» (аудио позже) — открывает окно урока дня', async () => {
    await act(() => { render(<LessonCard go={() => {}} />, root) })
    expect([...root.querySelectorAll('button')].map(b => b.textContent?.trim())).toEqual(['Читать'])
    await act(() => { btn('Читать')!.click() })
    expect(lessonOpen.value).toBe(1)
  })
})

describe('окно урока', () => {
  test('готовящийся урок: заголовок и честная строка о проверке, без текста и вопроса', async () => {
    await act(() => { render(<LessonReader />, root); lessonOpen.value = 2 })
    const dlg = root.querySelector('[role=dialog]')!
    expect(dlg).not.toBeNull()
    expect(dlg.querySelector('h1')!.textContent).toBe('Урок 2. Намерение')
    expect(text()).toContain('Урок готовится. Текст проходит проверку знатоком')
    expect(root.querySelector('.ls-check')).toBeNull()
    expect(root.querySelector('.ls-p')).toBeNull()
  })

  test('урок без названия — «Урок 16»; список всех 30 с пометкой «готовится»', async () => {
    await act(() => { render(<LessonReader />, root); lessonOpen.value = 16 })
    expect(root.querySelector('h1')!.textContent).toBe('Урок 16')
    const items = root.querySelectorAll('.ls-list button')
    expect(items).toHaveLength(30)
    expect(items[15].getAttribute('aria-current')).toBe('true')
    expect(items[2].textContent).toContain('готовится')
    expect(items[0].textContent).not.toContain('готовится')
  })

  test('из списка открывается любой урок', async () => {
    await act(() => { render(<LessonReader />, root); lessonOpen.value = 16 })
    await act(() => { (root.querySelectorAll<HTMLButtonElement>('.ls-list button')[0]).click() })
    expect(lessonOpen.value).toBe(1)
    expect(root.querySelector('h1')!.textContent).toBe('Урок 1. Как читать карту метро')
  })

  test('готовый урок: абзацы, источники и «Проверь себя»', async () => {
    await act(() => { render(<LessonReader />, root); lessonOpen.value = 1 })
    expect(text()).toContain('Линии обозначены цветами.')
    expect(text()).toContain('Тестовый источник, с. 1')
    expect(text()).toContain('Проверь себя')
    expect(text()).toContain('Чем отмечена пересадка?')
    expect(text()).not.toContain('Так нарисовано на схеме.')     // пояснение — только после ответа
  })

  test('ответ: спокойно показан верный вариант и пояснение; ни баллов, ни похвалы, ни «ошибки»', async () => {
    await act(() => { render(<LessonReader />, root); lessonOpen.value = 1 })
    await act(() => { btn('Квадратом')!.click() })
    const res = root.querySelector('.ls-res')!
    // одна озвучка: фокус на заголовке ответа, без живой области (не role=status и фокус одновременно)
    expect(res.getAttribute('role')).toBeNull()
    expect(res.closest('[aria-live],[role=status]')).toBeNull()
    const head = res.querySelector('.ls-res-h')!
    expect(document.activeElement).toBe(head)
    expect(head.textContent).toBe('Верный ответ: Кружком')
    expect(res.textContent).toContain('Верный ответ: Кружком')
    expect(res.textContent).toContain('Так нарисовано на схеме.')
    expect(btn('Кружком')!.className).toContain('ok')
    expect(btn('Квадратом')!.getAttribute('aria-pressed')).toBe('true')
    expect(res.textContent).not.toMatch(/молодец|ошибк|неверн|балл|очков|правильно!|\d+ из \d+/i)
    expect(localStorage.getItem('jurt.lesson.check')).toBeNull()
    expect(Object.keys({ ...localStorage }).filter(k => k.includes('score'))).toEqual([])
  })

  test('«Ещё раз» — вопрос снова без ответа', async () => {
    await act(() => { render(<LessonReader />, root); lessonOpen.value = 1 })
    await act(() => { btn('Кружком')!.click() })
    await act(() => { btn('Ещё раз')!.click() })
    expect(root.querySelector('.ls-res')).toBeNull()
    expect(btn('Кружком')!.getAttribute('aria-pressed')).toBe('false')
  })

  test('«Закрыть» и Escape закрывают окно', async () => {
    await act(() => { render(<LessonReader />, root); lessonOpen.value = 2 })
    await act(() => { btn('Закрыть ✕')!.click() })
    expect(lessonOpen.value).toBeNull()
    expect(root.querySelector('[role=dialog]')).toBeNull()
    await act(() => { lessonOpen.value = 2 })
    await act(() => { dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(lessonOpen.value).toBeNull()
  })

  test('уроки ещё не загрузились — окно открывается, номер виден', async () => {
    lessons.value = null
    await act(() => { render(<LessonReader />, root); lessonOpen.value = 5 })
    expect(root.querySelector('h1')!.textContent).toBe('Урок 5')
  })
})
