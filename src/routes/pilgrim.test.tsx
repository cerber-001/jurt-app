// @vitest-environment jsdom
/* Экран паломника 2.0: два режима нижнего меню.
   «Каждый день» (нет программы группы, до поездки, после) — Сегодня · Мой путь · Группа · Ещё, открывается «Сегодня».
   «Поездка» (сегодня день поездки по программе группы) — Сейчас · Путь · Группа · Ещё, открывается «Сейчас» (как в 1.1).
   Все адреса работают в обоих режимах. */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { memoryStorage } from '../../tests/helpers/memoryStorage'

// сеть и подписки на заметки в этих тестах не нужны
vi.mock('../lib/store', async orig => ({ ...(await orig<typeof import('../lib/store')>()), refresh: () => Promise.resolve(), readUrlCodes: () => {} }))
vi.mock('../lib/notes', async orig => ({ ...(await orig<typeof import('../lib/notes')>()), watchNotes: () => () => {} }))

const { Pilgrim } = await import('./pilgrim')
const { data } = await import('../lib/store')
const { program, programError } = await import('../components/today')
const { lessonOpen } = await import('../components/everyday/lesson')
type AppData = import('../lib/types').AppData
type Program = import('../lib/program').Program

const GROUP = { ok: true, group: { code: 'UMRA-0000', name: 'Тест' }, me: null } as unknown as AppData

function prog(dates: string[]): Program {
  return {
    title: '', subtitle: '', group: '', updated: '', version: '', legend: [], incl: [], excl: [], pay_rule: '', decisions: null,
    days: dates.map((date, k) => ({ id: 'd' + k, date, city: 'Мекка', tz: 'UTC+3', items: [{ t: '08:00', w: 'Завтрак' }] })),
  }
}
/** Копия программы на телефоне — по ней режим решается сразу, без ожидания сети */
const saveCopy = (p: Program) => localStorage.setItem('jurt.program', JSON.stringify({ at: 1, raw: p }))
const TRIP = prog(['2026-11-19', '2026-11-20', '2026-11-21'])
const LATER = prog(['2027-02-01', '2027-02-10'])

let root: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('нет сети'))))
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-20T09:00:00Z'))   // 12:00 в Мекке, 14:00 в Алматы
  history.replaceState(null, '', '/')
  data.value = null; program.value = null; programError.value = ''
  root = document.createElement('div'); document.body.append(root)
})
afterEach(async () => {
  await act(() => { lessonOpen.value = null })
  render(null, root); root.remove()
  data.value = null; program.value = null; programError.value = ''
  vi.useRealTimers(); vi.unstubAllGlobals()
})

const show = () => act(() => { render(<Pilgrim />, root) })
const navLabels = () => [...root.querySelectorAll('.bnav button')].map(b => b.querySelector('span')!.textContent)
const current = () => root.querySelector('.bnav [aria-current=page] span')?.textContent
const hash = () => location.hash

describe('выбор режима', () => {
  test('нет данных группы и программы — «каждый день»: Сегодня · Мой путь · Группа · Ещё, открыто «Сегодня»', async () => {
    await show()
    expect(navLabels()).toEqual(['Сегодня', 'Мой путь', 'Группа', 'Ещё'])
    expect(current()).toBe('Сегодня')
    expect(hash()).toBe('#today')
  })

  test('день поездки по программе группы — «поездка»: прежнее меню, открыто «Сейчас»', async () => {
    data.value = GROUP; saveCopy(TRIP)
    await show()
    expect(navLabels()).toEqual(['Сейчас', 'Путь', 'Группа', 'Ещё'])
    expect(current()).toBe('Сейчас')
    expect(hash()).toBe('#now')
  })

  test('программа есть, но поездка ещё не началась — «каждый день»', async () => {
    data.value = GROUP; saveCopy(LATER)
    await show()
    expect(navLabels()[0]).toBe('Сегодня')
    expect(hash()).toBe('#today')
  })

  test('поездка уже закончилась — «каждый день»', async () => {
    data.value = GROUP; saveCopy(prog(['2026-10-01', '2026-10-10']))
    await show()
    expect(navLabels()[0]).toBe('Сегодня')
  })

  test('программа группы без данных группы (чужая программа) — «каждый день»', async () => {
    saveCopy(TRIP)
    await show()
    expect(navLabels()[0]).toBe('Сегодня')
  })

  test('пришла программа из сети — режим пересчитался; открытый сам собой экран сменился на «Сейчас»', async () => {
    data.value = GROUP
    await show()
    expect(navLabels()[0]).toBe('Сегодня')
    await act(() => { program.value = TRIP })
    expect(navLabels()[0]).toBe('Сейчас')
    expect(hash()).toBe('#now')
  })

  test('режим сменило само приложение (первое открытие по ссылке ?g=) — фокус в содержимое не переводится', async () => {
    data.value = GROUP
    history.replaceState(null, '', '/?g=UMRA-0000')
    await show()
    const before = document.activeElement
    await act(() => { program.value = TRIP })
    expect(hash()).toBe('#now')
    expect(document.activeElement).not.toBe(root.querySelector('main'))
    expect(document.activeElement).toBe(before)
    // а смена раздела человеком — по-прежнему переводит фокус в начало содержимого
    await act(() => { [...root.querySelectorAll<HTMLButtonElement>('.bnav button')][2].click() })
    expect(document.activeElement).toBe(root.querySelector('main'))
  })

  test('в программе код другой группы — чужая программа, режим «каждый день»', async () => {
    data.value = GROUP
    saveCopy({ ...TRIP, code: 'UMRA-0009' })
    await show()
    expect(navLabels()[0]).toBe('Сегодня')
    expect(hash()).toBe('#today')
  })

  test('в программе код своей группы — «поездка»', async () => {
    data.value = GROUP
    saveCopy({ ...TRIP, code: 'umra-0000' })
    await show()
    expect(navLabels()[0]).toBe('Сейчас')
  })

  test('выбранный человеком экран при смене режима не отнимается', async () => {
    data.value = GROUP
    history.replaceState(null, '', '/#journey')
    await show()
    await act(() => { program.value = TRIP })
    expect(navLabels()[0]).toBe('Сейчас')
    expect(hash()).toBe('#journey')
    expect(root.querySelector('.jr-prep')).not.toBeNull()
  })
})

describe('адреса в обоих режимах', () => {
  test('«каждый день»: #journey — «Мой путь», #now и #path по-прежнему открываются', async () => {
    history.replaceState(null, '', '/#journey')
    await show()
    expect(current()).toBe('Мой путь')
    expect(root.querySelector('.jr-prep')).not.toBeNull()
    for (const h of ['now', 'path', 'program', 'more/dua']) {
      await act(() => { history.replaceState(null, '', '/#' + h); dispatchEvent(new HashChangeEvent('hashchange')) })
      expect(hash()).toBe('#' + h)
    }
  })

  test('«поездка»: #today — новый экран «Сегодня» (а не старый «намаз»), #journey — «Мой путь»', async () => {
    data.value = GROUP; saveCopy(TRIP)
    history.replaceState(null, '', '/#today')
    await show()
    expect(hash()).toBe('#today')
    await act(() => { history.replaceState(null, '', '/#journey'); dispatchEvent(new HashChangeEvent('hashchange')) })
    expect(root.querySelector('.jr-prep')).not.toBeNull()
  })

  test('неизвестный адрес — домашний экран режима', async () => {
    history.replaceState(null, '', '/#chto-to')
    await show()
    expect(hash()).toBe('#today')
  })

  test('старые адреса 1.0 ведут в новые места', async () => {
    history.replaceState(null, '', '/#umra')
    await show()
    expect(hash()).toBe('#path')
  })

  test('нажатие пункта меню ведёт на его адрес', async () => {
    await show()
    const journey = [...root.querySelectorAll<HTMLButtonElement>('.bnav button')][1]
    await act(() => { journey.click() })
    expect(hash()).toBe('#journey')
    expect(current()).toBe('Мой путь')
  })
})

describe('«Ещё» и окно урока', () => {
  test('«каждый день»: в «Ещё» есть «Шаги умры» (прежний «Путь»)', async () => {
    history.replaceState(null, '', '/#more')
    await show()
    const row = [...root.querySelectorAll<HTMLButtonElement>('.more-row')].find(b => b.textContent?.includes('Шаги умры'))!
    expect(row).toBeTruthy()
    await act(() => { row.click() })
    expect(hash()).toBe('#path')
  })

  test('«поездка»: в «Ещё» есть «Сегодня — намаз, зикр, урок дня»', async () => {
    data.value = GROUP; saveCopy(TRIP)
    history.replaceState(null, '', '/#more')
    await show()
    const row = [...root.querySelectorAll<HTMLButtonElement>('.more-row')].find(b => b.textContent?.includes('Сегодня'))!
    expect(row.textContent).toContain('намаз, зикр, урок дня')
    await act(() => { row.click() })
    expect(hash()).toBe('#today')
  })

  test('открыто окно урока — фон (шапка, содержимое, меню) недоступен (inert)', async () => {
    await show()
    await act(() => { lessonOpen.value = 1 })
    expect(root.querySelector('main')!.hasAttribute('inert')).toBe(true)
    expect(root.querySelector('.bnav')!.hasAttribute('inert')).toBe(true)
    expect(root.querySelector('[role=dialog]')).not.toBeNull()
  })
})
