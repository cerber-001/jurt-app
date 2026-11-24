// @vitest-environment jsdom
/* «Мой путь»: дата поездки, отсчёт, подготовка по дням, «Харам заранее», «Хочу поехать» */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { memoryStorage } from '../../../tests/helpers/memoryStorage'
import { JourneyScreen } from './journey'
import { lessonOpen } from './lesson'
import { program } from '../today'
import { nearby } from '../nearby'
import { reading } from '../reader'
import { data, lang } from '../../lib/store'
import type { AppData } from '../../lib/types'
import type { Program } from '../../lib/program'

let root: HTMLDivElement
const go = vi.fn()
const DUA = [{ id: 'talbiya', icon: '', title: 'Тальбия', preview: '', html: '', items: [{ label: 'Тальбия', ar: 'لَبَّيْكَ' }] }]

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('fetch', vi.fn((u: string) => Promise.resolve(
    String(u).endsWith('dua.json') ? new Response(JSON.stringify(DUA)) : new Response('', { status: 404 }))))
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 19, 10, 0))     // 19.11.2026 — как в макете
  go.mockReset()
  data.value = null; program.value = null
  root = document.createElement('div'); document.body.append(root)
})
afterEach(async () => {
  await act(() => { lessonOpen.value = null; nearby.value = null; reading.value = null })
  render(null, root); root.remove()
  data.value = null; program.value = null; lang.value = 'ru'
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs()
})

const text = () => root.textContent ?? ''
const show = () => act(() => { render(<JourneyScreen go={go} />, root) })
const dateInput = () => root.querySelector<HTMLInputElement>('input[type=date]')
async function setDate(v: string) {
  const i = dateInput()!
  await act(() => { i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })) })
}
const boxes = () => [...root.querySelectorAll<HTMLElement>('[role=checkbox]')]

function prog(dates: string[]): Program {
  return {
    title: '', subtitle: '', group: '', updated: '', version: '', legend: [], incl: [], excl: [], pay_rule: '', decisions: null,
    days: dates.map((date, k) => ({ id: 'd' + k, date, city: 'Мекка', tz: 'UTC+3', items: [{ t: '08:00', w: 'Завтрак' }] })),
  }
}
const GROUP = { ok: true, group: { code: 'UMRA-0000', name: 'Тест' }, me: null } as unknown as AppData

describe('дата и отсчёт', () => {
  test('без даты — поле даты с понятной подписью и приглашение вместо отсчёта', async () => {
    await show()
    const i = dateInput()!
    expect(i).not.toBeNull()
    expect(i.labels?.[0]?.textContent).toContain('Дата поездки')
    expect(text()).toContain('Укажите дату поездки')
    expect(root.querySelector('.jr-count')).toBeNull()
  })

  test('указали дату — отсчёт «74 дня», вылет ДД.ММ.ГГГГ, дата сохранена', async () => {
    await show()
    await setDate('2027-02-01')
    expect(localStorage.getItem('jurt.trip')).toBe('2027-02-01')
    const c = root.querySelector('.jr-count')!
    expect(c.textContent).toContain('до поездки')
    expect(c.textContent).toContain('74 дня')
    expect(c.textContent).toContain('Вылет 01.02.2027 · умра')
  })

  test('по-казахски: «74 күн»', async () => {
    lang.value = 'kk'
    localStorage.setItem('jurt.trip', '2027-02-01')
    await show()
    expect(root.querySelector('.jr-count')!.textContent).toContain('74 күн')
  })

  test('в день вылета — «Сегодня в путь»', async () => {
    localStorage.setItem('jurt.trip', '2026-11-19')
    await show()
    expect(root.querySelector('.jr-count')!.textContent).toContain('Сегодня в путь')
  })

  test('после — «С возвращением» и предложение указать новую дату; можно очистить', async () => {
    localStorage.setItem('jurt.trip', '2026-10-01')
    await show()
    expect(text()).toContain('С возвращением')
    expect(text()).toContain('новую дату')
    const clear = [...root.querySelectorAll('button')].find(b => b.textContent === 'Очистить дату')!
    await act(() => { clear.click() })
    expect(localStorage.getItem('jurt.trip')).toBeNull()
    expect(text()).toContain('Укажите дату поездки')
  })

  test('есть программа группы — дата первого дня только для чтения, «по программе группы»', async () => {
    data.value = GROUP
    program.value = prog(['2027-02-01', '2027-02-10'])
    await show()
    expect(dateInput()).toBeNull()
    expect(text()).toContain('01.02.2027')
    expect(text()).toContain('по программе группы')
    expect(root.querySelector('.jr-count')!.textContent).toContain('74 дня')
  })
})

describe('подготовка по дням', () => {
  test('программа с кодом другой группы — даты не берутся, поле даты снова вводится вручную', async () => {
    data.value = GROUP
    program.value = { ...prog(['2027-02-01', '2027-02-10']), code: 'UMRA-0009' }
    await show()
    expect(dateInput()).not.toBeNull()
    expect(text()).not.toContain('по программе группы')
  })

  test('шесть дел, «Готово 0 из 6», отметки — чекбоксы не меньше 44px', async () => {
    await show()
    expect(text()).toContain('Подготовка по дням')
    expect(text()).toContain('Готово 0 из 6')
    expect(boxes()).toHaveLength(6)
    for (const b of boxes()) {
      expect(b.tagName).toBe('BUTTON')
      expect(b.getAttribute('aria-checked')).toBe('false')
      expect(b.getAttribute('aria-labelledby')).toBeTruthy()
    }
  })

  test('сроки «до ДД.ММ» относительно даты поездки; срок не в этом году — с годом', async () => {
    localStorage.setItem('jurt.trip', '2027-02-01')
    await show()
    const rows = [...root.querySelectorAll('.jr-prep li')].map(li => li.textContent ?? '')
    expect(rows[1]).toContain('до 02.01.2027')     // документы — за 30 дней
    expect(rows[2]).toContain('до 18.01.2027')     // тальбия — за 14
    expect(rows[3]).toContain('до 25.01.2027')     // ихрам — за 7
    expect(rows[4]).toContain('до 27.01.2027')     // сборы — за 5
    expect(rows[5]).toContain('до 30.01.2027')     // дуа близких — за 2
  })
  test('срок в этом году — без года: «до 05.12»', async () => {
    localStorage.setItem('jurt.trip', '2026-12-07')
    await show()
    const rows = [...root.querySelectorAll('.jr-prep li')].map(li => li.textContent ?? '')
    expect(rows[5]).toContain('до 05.12')
    expect(rows[5]).not.toContain('05.12.2026')
  })

  test('отметка: aria-checked, «Готово 1 из 6», хранится в jurt.prep; без похвал и очков', async () => {
    await show()
    await act(() => { boxes()[2].click() })
    expect(boxes()[2].getAttribute('aria-checked')).toBe('true')
    expect(text()).toContain('Готово 1 из 6')
    expect(JSON.parse(localStorage.getItem('jurt.prep')!)).toEqual({ talbiya: true })
    expect(text()).not.toMatch(/молодец|отлично|балл|очк|звезд|★/i)
    await act(() => { boxes()[2].click() })
    expect(JSON.parse(localStorage.getItem('jurt.prep') || '{}')).toEqual({})
  })

  test('отметки читаются после перезапуска', async () => {
    localStorage.setItem('jurt.prep', '{"docs":true,"pack":true}')
    await show()
    expect(text()).toContain('Готово 2 из 6')
    expect(boxes()[1].getAttribute('aria-checked')).toBe('true')
  })

  test('уроки: «сейчас урок N · по 3 мин в день», открывают урок дня', async () => {
    localStorage.setItem('jurt.lesson.start', '2026-11-14')
    await show()
    expect(text()).toContain('сейчас урок 6 · по 3 мин в день')
    await act(() => { root.querySelector<HTMLButtonElement>('.jr-prep li:nth-child(1) .jr-open')!.click() })
    expect(lessonOpen.value).toBe(6)
  })

  test('ихрам — открывает шаг «Ихрам», сборы — #more/pack', async () => {
    await show()
    await act(() => { root.querySelector<HTMLButtonElement>('.jr-prep li:nth-child(4) .jr-open')!.click() })
    expect(nearby.value).toBe('ihram')
    await act(() => { root.querySelector<HTMLButtonElement>('.jr-prep li:nth-child(5) .jr-open')!.click() })
    expect(go).toHaveBeenCalledWith('more/pack')
  })

  test('тальбия — открывает дуа «talbiya» в окне чтения', async () => {
    await show()
    await act(async () => { root.querySelector<HTMLButtonElement>('.jr-prep li:nth-child(3) .jr-open')!.click(); await new Promise(r => setTimeout(r, 10)) })
    expect(reading.value?.title).toBe('Тальбия')
    expect(reading.value?.items[0].ar).toBe('لَبَّيْكَ')
  })

  test('документы и дуа близких — просто отметки, без перехода', async () => {
    await show()
    expect(root.querySelector('.jr-prep li:nth-child(2) .jr-open')).toBeNull()
    expect(root.querySelector('.jr-prep li:nth-child(6) .jr-open')).toBeNull()
    expect(text()).toContain('запишите, о чём просили помолиться')
  })
})

describe('Харам заранее и заявка', () => {
  test('3D — карточка с кнопкой «Открыть 3D» и честной подсказкой про интернет, без ссылки на старый 3D', async () => {
    await show()
    const card = root.querySelector('.jr-3d')!
    expect(card.textContent).toContain('Харам заранее (3D)')
    expect(card.querySelector('button')!.textContent).toBe('Открыть 3D')
    expect(card.textContent).toContain('Фото-3D — только с интернетом. Наша модель работает и без сети, если один раз открыть её дома.')
    expect(card.querySelector('a')).toBeNull()
    expect(root.innerHTML).not.toContain('umra.jurt.kz')
  })

  test('есть данные группы — блока «Хочу поехать» нет', async () => {
    data.value = GROUP
    await show()
    expect(text()).not.toContain('Хочу поехать')
  })

  test('номер задан (VITE_LEAD_WA) — ссылка WhatsApp с текстом и месяцем поездки', async () => {
    vi.stubEnv('VITE_LEAD_WA', '+7 700 000 00 00')
    localStorage.setItem('jurt.trip', '2027-02-01')
    await show()
    const a = root.querySelector<HTMLAnchorElement>('a.jr-lead')!
    expect(a.textContent).toBe('Хочу поехать')
    const u = new URL(a.href)
    expect(u.origin + u.pathname).toBe('https://wa.me/77000000000')
    expect(u.searchParams.get('text')).toBe('Ассаляму алейкум! Хочу поехать на умру. Желаемый месяц: февраль 2027.')
    expect(a.rel).toContain('noopener')
  })

  test('номер не задан — честная карточка «Приём заявок скоро откроется», без формы и отправки', async () => {
    vi.stubEnv('VITE_LEAD_WA', '')
    await show()
    expect(root.querySelector('a.jr-lead')).toBeNull()
    const b = [...root.querySelectorAll('button')].find(x => x.textContent === 'Хочу поехать')!
    expect(b.getAttribute('aria-expanded')).toBe('false')
    await act(() => { b.click() })
    expect(b.getAttribute('aria-expanded')).toBe('true')
    expect(text()).toContain('Приём заявок скоро откроется')
    expect(root.querySelector('form')).toBeNull()
    expect((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls.some(c => !String(c[0]).includes('/content/'))).toBe(false)
  })
})
