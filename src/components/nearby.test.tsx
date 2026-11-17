// @vitest-environment jsdom
/* Окно шага «Рядом»: свайп между шагами, итог после седьмого круга из данных шагов,
   «Читать крупно» из окна шага и кнопка «Назад» браузера, которая закрывает только верхнее окно. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'preact'
import { memoryStorage } from '../../tests/helpers/memoryStorage'
import { content, type Content, type Step } from '../lib/content'
import { done, lang, ls } from '../lib/store'
import { Nearby, nearby } from './nearby'
import { Reader, reading } from './reader'
import { Finale, finale } from './finale'

const step = (id: string, num: number, extra: Partial<Step> = {}): Step => ({
  id, num, icon: 'b-' + id, kicker: null, title: 'Шаг ' + id, tags: [], lead: 'Коротко о шаге ' + id, dua: [], html: '', ...extra,
})
const DUA = [{ label: 'Дуа', ar: 'لَبَّيْكَ اللَّهُمَّ لَبَّيْكَ', tr: 'Ляббайка', ru: 'Вот я перед Тобой' }]
// названия шагов придуманы для теста: подпись «дальше …» должна браться из данных, а не из кода
const STEPS: Step[] = [
  step('niyya', 1, { dua: DUA }),
  step('tawaf', 2),
  step('maqam', 3, { title: 'Тестовый шаг после тавафа' }),
  step('sai', 4),
]
const CONTENT: Content = { steps: STEPS, info: [], dua: [], zikr: [], modes: { kinds: [], details: [] } }

/** Preact рисует эффекты после кадра (requestAnimationFrame или до 100 мс) */
const tick = (ms = 140) => new Promise(r => setTimeout(r, ms))
const $ = (s: string) => document.querySelector<HTMLElement>(s)
const btn = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(text))

let root: HTMLDivElement
beforeAll(() => { history.replaceState(null, '') })
beforeEach(async () => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
  vi.stubGlobal('confirm', () => true)
  content.value = CONTENT
  done.value = {}
  root = document.createElement('div')
  document.body.append(root)
  render(<><Nearby /><Reader /><Finale /></>, root)
})
afterEach(async () => {
  nearby.value = null
  reading.value = null
  finale.value = false
  await tick()
  render(null, root)
  root.remove()
  vi.unstubAllGlobals()
})
afterAll(() => { lang.value = 'ru' })

describe('после седьмого круга', () => {
  test('подпись дальнейшего шага берётся из данных шагов', async () => {
    ls.set('jurt.cnt-tawaf', '7')
    nearby.value = 'tawaf'
    await tick()
    expect($('.fin-next b')?.textContent).toBe('3. Тестовый шаг после тавафа')
    expect(btn('3')).toBeTruthy()
  })

  test('сай заканчивается так же, как таваф', async () => {
    content.value = { ...CONTENT, steps: [...STEPS, step('halq', 5, { title: 'Тестовый последний шаг' })] }
    ls.set('jurt.cnt-sai', '7')
    nearby.value = 'sai'
    await tick()
    expect($('.fin-k')).not.toBeNull()
    expect($('.fin-next b')?.textContent).toBe('5. Тестовый последний шаг')
  })
})

describe('седьмой круг — для чтеца', () => {
  test('«Таваф завершён. Дальше: …» попадает в постоянную живую область окна', async () => {
    vi.stubGlobal('navigator', { ...navigator, vibrate: vi.fn() })
    ls.set('jurt.cnt-tawaf', '6')
    nearby.value = 'tawaf'
    await tick()
    const live = $('.near [role=status]')!
    expect(live.textContent).toBe('')
    btn('Круг пройден')!.click()
    await tick()
    expect($('.near [role=status]')).toBe(live)       // та же область, не новая
    expect(live.textContent).toBe('Таваф завершён. Дальше: 3. Тестовый шаг после тавафа')
  })
})

describe('окно загрузки', () => {
  test('пока тексты грузятся, у окна есть имя', async () => {
    content.value = null
    nearby.value = 'niyya'
    await tick()
    expect($('.near[role=dialog]')?.getAttribute('aria-label')).toBe('Загрузка…')
  })
})

describe('последний шаг → финал', () => {
  test('«Умра завершена» открывает финал после того, как окно шага сняло запись истории; запоздалый «Назад» финал не закрывает', async () => {
    ls.set('jurt.cnt-sai', '7')
    nearby.value = 'sai'
    await tick()
    btn('Умра завершена')!.click()
    await tick(400)
    expect(nearby.value).toBeNull()
    expect(done.value.sai).toBe(true)
    expect(finale.value).toBe(true)
    expect($('.finale')).not.toBeNull()
    await tick(700)
    expect(finale.value).toBe(true)   // popstate от закрытия «Рядом» не снял запись финала
    history.back()                     // а системная «Назад» — закрывает финал
    await tick(400)
    expect(finale.value).toBe(false)
  })
})

describe('кнопка звука', () => {
  test('подписана словами и говорит, включён ли звук', async () => {
    vi.stubGlobal('AudioContext', undefined)
    nearby.value = 'tawaf'
    await tick()
    const b = $('.near-links .snd')!
    expect(b.textContent).toBe('Тихий звук: выключен')
    b.click()
    await tick(20)
    expect($('.near-links .snd')!.textContent).toBe('Тихий звук: включён')
    $('.near-links .snd')!.click()
  })
})

describe('свайп между шагами', () => {
  const swipe = (dx: number, dy = 0) => {
    const el = $('.near')!
    const fire = (type: string, x: number, y: number) => {
      const pt = { clientX: x, clientY: y }
      const e = new Event(type) as Event & { touches: unknown[]; changedTouches: unknown[] }
      e.touches = type === 'touchend' ? [] : [pt]
      e.changedTouches = [pt]
      el.dispatchEvent(e)
    }
    fire('touchstart', 400, 300)
    fire('touchmove', 400 + dx / 4, 300 + dy / 4)
    fire('touchmove', 400 + dx, 300 + dy)
    fire('touchend', 400 + dx, 300 + dy)
  }

  test('влево — следующий шаг и отметка «выполнено», как у «Дальше»; вправо — предыдущий, без отметки', async () => {
    ls.set('jurt.cnt-tawaf', '7')   // круги пройдены — на тавафе можно листать
    nearby.value = 'niyya'
    await tick()
    swipe(-150)
    await tick()
    expect(nearby.value).toBe('tawaf')
    expect(done.value.niyya).toBe(true)
    expect($('.near')!.classList.contains('in-next')).toBe(true)
    await tick(1300)                 // защита от двойного касания (+1 → свайп) — не мешает
    swipe(150)
    await tick()
    expect(nearby.value).toBe('niyya')
    expect(done.value.tawaf).toBeUndefined()
  })

  test('на последнем шаге свайп влево никуда не ведёт — финал только по кнопке', async () => {
    ls.set('jurt.cnt-sai', '7')
    nearby.value = 'sai'
    await tick()
    swipe(-150)
    await tick(500)
    expect(nearby.value).toBe('sai')
    expect(finale.value).toBe(false)
    expect(done.value.sai).toBeUndefined()
  })

  test('на первом шаге вправо — никуда; вертикальная прокрутка не листает', async () => {
    nearby.value = 'niyya'
    await tick()
    swipe(150)
    swipe(-30, 200)
    await tick()
    expect(nearby.value).toBe('niyya')
  })

  test('во время счёта кругов свайп выключен (палец занят «+1»)', async () => {
    nearby.value = 'tawaf'
    await tick()
    swipe(-150)
    await tick()
    expect(nearby.value).toBe('tawaf')
  })

  test('во время счёта кругов есть «← Назад» к предыдущему шагу (на первом шаге — нет)', async () => {
    nearby.value = 'tawaf'
    await tick()
    const back = [...document.querySelectorAll<HTMLButtonElement>('.near-links button')].find(b => b.textContent?.includes('Назад'))
    expect(back).toBeTruthy()
    back!.click()
    await tick()
    expect(nearby.value).toBe('niyya')
    expect(done.value.tawaf).toBeUndefined()
  })

  test('кнопки «Назад» и «Дальше» на месте', async () => {
    nearby.value = 'niyya'
    await tick()
    expect(btn('Назад')).toBeTruthy()
    expect(btn('Дальше')).toBeTruthy()
  })
})

describe('«Читать крупно» из окна шага', () => {
  test('шаг закрывается, открывается чтение; «Назад» закрывает только чтение и возвращает шаг', async () => {
    nearby.value = 'niyya'
    await tick()
    const depth = history.length
    btn('Читать крупно')!.click()
    await tick(400)
    expect(nearby.value).toBeNull()
    expect(reading.value?.title).toBe('Шаг niyya')
    expect($('.reader')).not.toBeNull()
    expect(history.length).toBeLessThanOrEqual(depth + 1)

    history.back()              // системная «Назад»
    await tick(400)
    expect(reading.value).toBeNull()
    expect(nearby.value).toBe('niyya')
    expect($('.near')).not.toBeNull()

    history.back()              // ещё раз «Назад» — теперь закрывается окно шага
    await tick(400)
    expect(nearby.value).toBeNull()
  })

  test('чтение закрыли кнопкой — шаг возвращается и остаётся открытым', async () => {
    nearby.value = 'niyya'
    await tick()
    btn('Читать крупно')!.click()
    await tick(400)
    btn('Закрыть')!.click()
    await tick(500)
    expect(reading.value).toBeNull()
    expect(nearby.value).toBe('niyya')
    await tick(300)
    expect(nearby.value).toBe('niyya')   // запоздалый popstate не закрыл вернувшийся шаг
  })

  test('у шага без дуа кнопки нет', async () => {
    nearby.value = 'maqam'
    await tick()
    expect(btn('Читать крупно')).toBeUndefined()
  })
})
