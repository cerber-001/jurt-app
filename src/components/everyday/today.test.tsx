// @vitest-environment jsdom
/* Экран «Сегодня»: герой, намаз (ДУМК / запасной расчёт), азкары, мысль дня, тасбих — на ru и kk */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { memoryStorage } from '../../../tests/helpers/memoryStorage'
import { lang } from '../../lib/store'
import { reading } from '../reader'
import { TodayScreen } from './today'
import { thoughtIndex } from '../../lib/today-day'
import { forgetTasbih } from '../../lib/today-tasbih'
import { forgetDumk } from '../../lib/dumk'

/** Ответ API ДУМК на 2026 год: 20.11 — как на api.muftyat.kz для Алматы, остальные дни — одинаковые */
function yearJson(year: number) {
  const result = []
  for (let d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d = new Date(d.getTime() + 86400000)) {
    const iso = d.toISOString().slice(0, 10)
    result.push(iso.endsWith('-11-20')
      ? { imsak: '05:38', fajr: '05:28', sunrise: '06:48', dhuhr: '11:41', asr: '14:45', sunset: '16:24', maghrib: '16:27', isha: '17:47', midnight: '23:38', Date: iso }
      : { imsak: '05:39', fajr: '05:29', sunrise: '06:49', dhuhr: '11:41', asr: '14:44', sunset: '16:23', maghrib: '16:26', isha: '17:46', midnight: '23:38', Date: iso })
  }
  return { result, year, city: 'Алматы қаласы' }
}

/** jsdom подменяет URL — путь к public/ берём от корня проекта (vitest запускается из него) */
const PUBLIC = join(process.cwd(), 'public')
const pub = (p: string) => join(PUBLIC, p)
let online = true
let apiDown = false          // сеть есть, а API отвечает ошибкой
let dumkCalls = 0
function fakeFetch(url: string): Promise<Response> {
  if (url.startsWith('https://api.muftyat.kz/')) {
    dumkCalls++
    if (!online) return Promise.reject(new TypeError('Failed to fetch'))
    if (apiDown) return Promise.resolve(new Response('', { status: 503 }))
    const year = Number(url.split('/')[4])
    return Promise.resolve(new Response(JSON.stringify(yearJson(year)), { status: 200 }))
  }
  try {
    return Promise.resolve(new Response(readFileSync(pub(url.replace(/^\//, '')), 'utf8'), { status: 200 }))
  } catch { return Promise.resolve(new Response('', { status: 404 })) }
}

let root: HTMLDivElement
let standalone = false       // гид открыт как приложение с экрана «Домой»
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }
const show = async () => { await act(() => { render(<TodayScreen go={() => undefined} />, root) }); await flush() }
const text = () => root.textContent ?? ''

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('fetch', vi.fn(fakeFetch))
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-20T10:16:00Z')) // 15:16 в Алматы (UTC+5)
  online = true; apiDown = false; dumkCalls = 0
  forgetTasbih(); forgetDumk()
  // простой наступает сразу (в jsdom нет requestIdleCallback)
  vi.stubGlobal('requestIdleCallback', (cb: () => void) => setTimeout(cb, 0))
  vi.stubGlobal('cancelIdleCallback', (id: number) => clearTimeout(id))
  standalone = false
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: standalone && q.includes('standalone'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  root = document.createElement('div'); document.body.append(root)
  lang.value = 'ru'
})
afterEach(async () => {
  await act(() => { render(null, root); reading.value = null })
  root.remove(); lang.value = 'ru'
  vi.useRealTimers(); vi.unstubAllGlobals()
})

describe('карточка-герой', () => {
  test('день недели, дата ДД.ММ.ГГГГ, следующий намаз и «через …»', async () => {
    await show()
    const hero = root.querySelector('.hero')!
    expect(hero.textContent).toContain('Пятница · 20.11.2026')
    expect(hero.querySelector('h2')!.textContent).toContain('Магриб в 16:27')
    expect(hero.textContent).toContain('через 1 ч 11 мин')
  })
  test('хиджра — с «≈», если календарь доступен; «примерная» — доступным текстом, а не только в title', async () => {
    await show()
    const h = root.querySelector('.td-hijri')
    if (!h) return
    expect(h.querySelector('[aria-hidden],.td-hijri-d')!.textContent).toMatch(/^≈ \d+ .+ 14\d\d г\. х\.$/)
    expect(h.textContent).toContain('Дата по хиджре — примерная')
  })
  test('у экрана скрытый заголовок h1 «Сегодня»; меняющаяся строка героя — не h1', async () => {
    await show()
    const h1 = root.querySelectorAll('h1')
    expect(h1).toHaveLength(1)
    expect(h1[0].textContent).toBe('Сегодня')
    expect(h1[0].className).toContain('sr-only')
    expect(root.querySelector('.hero h1')).toBeNull()
  })
  test('после иша — фаджр завтра', async () => {
    vi.setSystemTime(new Date('2026-11-20T18:00:00Z')) // 23:00
    await show()
    expect(root.querySelector('.hero h2')!.textContent).toContain('Фаджр завтра в 05:29')
    expect(root.querySelector('.td-pt h2')!.textContent).toContain('Намаз завтра')
  })
})

describe('намаз сегодня', () => {
  test('пять строк, имсак не показан, подсвечен следующий — магриб; источник ДУМК', async () => {
    await show()
    const rows = [...root.querySelectorAll('.td-pt li')]
    expect(rows.map(r => r.querySelector('span')!.firstChild!.textContent)).toEqual(['Фаджр', 'Зухр', 'Аср', 'Магриб', 'Иша'])
    expect(rows[0].textContent).toContain('восход 06:48')
    expect(rows[2].textContent).toContain('по ханафитскому мазхабу')
    const next = root.querySelectorAll('.td-pt li.next')
    expect(next).toHaveLength(1)
    expect(next[0].textContent).toContain('Магриб')
    expect(next[0].getAttribute('aria-current')).toBe('true')
    expect(rows[3].textContent).toContain('16:27')
    expect(text()).not.toMatch(/имсак/i)
    expect(root.querySelector('.td-src')!.textContent).toBe('Источник: ДУМК (muftyat.kz), Алматы, 20.11.2026. Аср — ханафитский.')
  })

  test('нет сети и нет копии — запасной расчёт с честной подписью', async () => {
    online = false
    await show()
    expect(root.querySelector('.td-src')!.textContent).toContain('Без сети: расчёт по методу ДУМК, возможна разница 1–3 мин')
    expect(root.querySelectorAll('.td-pt li')).toHaveLength(5)
  })

  test('копия года уже на телефоне — без сети показывает ДУМК и в сеть не ходит', async () => {
    await show()
    await act(() => { render(null, root) })
    online = false; dumkCalls = 0
    await show()
    expect(dumkCalls).toBe(0)
    expect(root.querySelector('.td-src')!.textContent).toContain('Источник: ДУМК')
  })

  test('хранилище переполнено — год ДУМК держится в памяти, подпись «Источник: ДУМК»', async () => {
    const st = memoryStorage()
    st.setItem = () => { throw new DOMException('quota', 'QuotaExceededError') }
    vi.stubGlobal('localStorage', st)
    await show()
    expect(root.querySelector('.td-src')!.textContent).toContain('Источник: ДУМК')
  })

  test('первая загрузка года — не при монтировании, а в простое после первой отрисовки', async () => {
    let idle: (() => void) | null = null
    vi.stubGlobal('requestIdleCallback', (cb: () => void, o?: { timeout?: number }) => { idle = cb; expect(o?.timeout).toBe(4000); return 1 })
    await act(() => { render(<TodayScreen go={() => undefined} />, root) })
    expect(dumkCalls).toBe(0)
    expect(root.querySelectorAll('.td-pt li')).toHaveLength(5)      // первый показ — по расчёту
    expect(idle).not.toBeNull()
    await act(() => { idle!() }); await flush()
    expect(dumkCalls).toBe(1)
    expect(root.querySelector('.td-src')!.textContent).toContain('Источник: ДУМК')
  })

  test('нет requestIdleCallback — загрузка через 1,5 с, не сразу', async () => {
    vi.stubGlobal('requestIdleCallback', undefined)
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-11-20T10:16:00Z'))
    await act(() => { render(<TodayScreen go={() => undefined} />, root) })
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(dumkCalls).toBe(0)
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    expect(dumkCalls).toBe(1)
  })

  test('API ответил ошибкой — повтор при возврате в приложение не чаще раза в 10 минут', async () => {
    apiDown = true
    await show()
    expect(dumkCalls).toBe(1)
    expect(root.querySelector('.td-src')!.textContent).toContain('Без сети')
    apiDown = false
    const back = async () => { await act(() => { document.dispatchEvent(new Event('visibilitychange')) }); await flush() }
    vi.setSystemTime(new Date('2026-11-20T10:20:00Z'))        // через 4 минуты — рано
    await back()
    await act(() => { window.dispatchEvent(new Event('online')) }); await flush()
    expect(dumkCalls).toBe(1)
    vi.setSystemTime(new Date('2026-11-20T10:27:00Z'))        // через 11 минут — повтор
    await back()
    expect(dumkCalls).toBe(2)
    expect(root.querySelector('.td-src')!.textContent).toContain('Источник: ДУМК')
    vi.setSystemTime(new Date('2026-11-20T10:45:00Z'))        // год уже есть — больше не спрашиваем
    await back()
    expect(dumkCalls).toBe(2)
  })

  test('не было сети — появилась (online): повтор сразу', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
    online = false
    await show()
    expect(dumkCalls).toBe(1)
    online = true
    await act(() => { window.dispatchEvent(new Event('online')) }); await flush()
    expect(dumkCalls).toBe(2)
    expect(root.querySelector('.td-src')!.textContent).toContain('Источник: ДУМК')
    onLine.mockRestore()
  })

  test('смена города: список из 20 городов, выбор сохраняется', async () => {
    await show()
    const btn = root.querySelector<HTMLButtonElement>('.td-city-btn')!
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    await act(() => { btn.click() })
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    const cities = [...root.querySelectorAll<HTMLButtonElement>('.td-cities button[data-city]')]
    expect(cities).toHaveLength(20)
    await act(() => { cities.find(b => b.dataset.city === 'astana')!.click() })
    await flush()
    expect(root.querySelector('.td-pt h2')!.textContent).toContain('Астана')
    expect(localStorage.getItem('jurt.today.city')).toBe('astana')
  })

  test('после выбора города фокус возвращается на кнопку «Город»; после закрытия списка — тоже', async () => {
    await show()
    const btn = root.querySelector<HTMLButtonElement>('.td-city-btn')!
    await act(() => { btn.click() })
    await act(() => { root.querySelector<HTMLButtonElement>('.td-cities button[data-city="astana"]')!.click() })
    expect(root.querySelector('.td-cities')).toBeNull()
    expect(document.activeElement).toBe(root.querySelector('.td-city-btn'))
    await act(() => { btn.click() })
    const shymkent = root.querySelector<HTMLButtonElement>('.td-cities button[data-city="shymkent"]')!
    shymkent.focus()
    await act(() => { shymkent.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(root.querySelector('.td-cities')).toBeNull()
    expect(document.activeElement).toBe(root.querySelector('.td-city-btn'))
  })

  test('список закрыли до ответа геопозиции — поздний ответ город не меняет', async () => {
    let ok: ((p: GeolocationPosition) => void) | null = null
    vi.stubGlobal('navigator', Object.create(navigator, {
      // подсказка «на экран „Домой“» читает userAgent и maxTouchPoints — как у настоящего браузера
      userAgent: { value: navigator.userAgent },
      maxTouchPoints: { value: 0 },
      geolocation: { value: { getCurrentPosition: (s: (p: GeolocationPosition) => void) => { ok = s } } },
    }))
    await show()
    const btn = root.querySelector<HTMLButtonElement>('.td-city-btn')!
    await act(() => { btn.click() })
    await act(() => { root.querySelector<HTMLButtonElement>('.td-geo')!.click() })
    await act(() => { btn.click() })                       // закрыли список, ответа ещё нет
    await act(() => { ok!({ coords: { latitude: 51.13, longitude: 71.43 } } as GeolocationPosition) })   // Астана
    await flush()
    expect(root.querySelector('.td-pt h2')!.textContent).toContain('Алматы')
    expect(localStorage.getItem('jurt.today.city')).toBeNull()
  })

  test('kk: названия намазов казахские', async () => {
    lang.value = 'kk'
    await show()
    const names = [...root.querySelectorAll('.td-pt li')].map(r => r.querySelector('span')!.firstChild!.textContent)
    expect(names).toEqual(['Таң', 'Бесін', 'Екінті', 'Ақшам', 'Құптан'])
    expect(root.querySelector('.td-pt li.next')!.textContent).toContain('Ақшам')
    expect(root.querySelector('.hero')!.textContent).toContain('Жұма · 20.11.2026')
    expect(root.querySelector('.td-src')!.textContent).toContain('ҚМДБ')
  })
})

describe('азкары утра / вечера', () => {
  test('15:16 (после асра) — вечер: первый — «Две лёгкие фразы», арабский с lang/dir', async () => {
    await show()
    const card = root.querySelector('.td-az')!
    expect(card.querySelector('h2')!.textContent).toBe('Зикр вечера · для чтения')
    const ev = card.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')!
    expect(ev.textContent).toBe('Вечер')
    const ar = card.querySelector('[lang="ar"]')!
    expect(ar.getAttribute('dir')).toBe('rtl')
    expect(card.textContent).toContain('аль-Бухари,\u00a0№\u00a06406')
  })
  test('«Утро» — первый «Субхана-Ллахи ва би-хамдих»; «Читать дальше» открывает три зикра', async () => {
    await show()
    const morning = [...root.querySelectorAll<HTMLButtonElement>('.td-az [role="tab"]')].find(b => b.textContent === 'Утро')!
    await act(() => { morning.click() })
    expect(root.querySelector('.td-az h2')!.textContent).toBe('Зикр утра · для чтения')
    expect(root.querySelector('.td-az h3')!.textContent).toBe('Субхана-Ллахи ва би-хамдих')
    await act(() => { root.querySelector<HTMLButtonElement>('.td-az .td-more')!.click() })
    expect(reading.value!.items).toHaveLength(3)
    expect(reading.value!.items.map(i => i.label)).toEqual(['Субхана-Ллахи ва би-хамдих', 'Тахлиль', 'Истигфар'])
    expect(reading.value!.items[0].src).toBe('аль-Бухари,\u00a0№\u00a06405') // в контенте — неразрывные пробелы
  })
  test('вкладки Утро/Вечер: Home — первая, End — последняя', async () => {
    await show()
    const tabs = () => [...root.querySelectorAll<HTMLButtonElement>('.td-az [role="tab"]')]
    await act(() => { tabs()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })) })
    expect(tabs()[0].getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs()[0])
    await act(() => { tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })) })
    expect(tabs()[1].getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs()[1])
  })
  test('9:00 — по умолчанию утро', async () => {
    vi.setSystemTime(new Date('2026-11-20T04:00:00Z'))
    await show()
    expect(root.querySelector('.td-az h2')!.textContent).toBe('Зикр утра · для чтения')
  })
  test('kk: заголовок «Кешкі зікір · оқуға», смысл — казахский', async () => {
    lang.value = 'kk'
    await show()
    expect(root.querySelector('.td-az h2')!.textContent).toBe('Кешкі зікір · оқуға')
    expect(root.querySelector('.td-az')!.textContent).toContain('Ұлы Алла пәк')
  })
})

describe('мысль дня', () => {
  const thoughts = (f: string) => JSON.parse(readFileSync(pub(f), 'utf8')) as { id: string; road: boolean; text: string }[]
  test('без даты поездки — общая мысль из файлов ru и kk, по дате', async () => {
    const ru = thoughts('content/thoughts.json').filter(x => !x.road)
    const kk = thoughts('content/kk/thoughts.json').filter(x => !x.road)
    const k = thoughtIndex('2026-11-20', ru.length)
    await show()
    expect(root.querySelector('.td-thought p')!.textContent).toBe(ru[k].text)
    await act(() => { lang.value = 'kk' }); await flush()
    expect(root.querySelector('.td-thought p')!.textContent).toBe(kk[k].text)
  })
  test('дата поездки указана — мысль из всех (и дорожных тоже)', async () => {
    localStorage.setItem('jurt.trip', '2027-02-01')
    const all = thoughts('content/thoughts.json')
    await show()
    expect(root.querySelector('.td-thought p')!.textContent).toBe(all[thoughtIndex('2026-11-20', all.length)].text)
  })
  test('en — запасной русский с пометкой языка', async () => {
    lang.value = 'en'
    await show()
    expect(root.querySelector('.td-thought p')!.getAttribute('lang')).toBe('ru')
  })
})

describe('тасбих', () => {
  test('33 касания — «дальше», 34-е — вторая фраза; сброс — ноль; никаких итогов', async () => {
    await show()
    const card = root.querySelector('.td-tas')!
    const plus = card.querySelector<HTMLButtonElement>('.td-tas-btn')!
    expect(plus.textContent).toContain('нажмите: +1')
    for (let i = 0; i < 33; i++) await act(() => { plus.click() })
    expect(card.querySelector('.td-tas-btn b')!.textContent).toBe('33')
    expect(card.querySelector('.td-tas-next')!.textContent).toContain('Аль-хамду ли-Лля́х')
    await act(() => { plus.click() })
    expect(card.querySelector('.td-tas-btn b')!.textContent).toBe('1')
    expect(card.querySelector('.td-tas-txt [lang="ar"]')!.textContent).toBe('الْحَمْدُ لِلَّهِ')
    expect(card.textContent).not.toMatch(/всего|итог|рекорд|молодец|34/i)
    await act(() => { card.querySelector<HTMLButtonElement>('.td-tas-reset')!.click() })
    expect(card.querySelector('.td-tas-btn b')!.textContent).toBe('0')
  })
  test('счёт переживает перезагрузку в тот же день', async () => {
    await show()
    const plus = () => root.querySelector<HTMLButtonElement>('.td-tas-btn')!
    for (let i = 0; i < 5; i++) await act(() => { plus().click() })
    await act(() => { render(null, root) })
    forgetTasbih()   // как новый запуск: память пуста, счёт — из хранилища
    await show()
    expect(root.querySelector('.td-tas-btn b')!.textContent).toBe('5')
  })
  test('хранилище не принимает запись — «+1» всё равно считает', async () => {
    const st = memoryStorage()
    st.setItem = () => { throw new DOMException('quota', 'QuotaExceededError') }
    vi.stubGlobal('localStorage', st)
    await show()
    const plus = () => root.querySelector<HTMLButtonElement>('.td-tas-btn')!
    for (let i = 0; i < 3; i++) await act(() => { plus().click() })
    expect(root.querySelector('.td-tas-btn b')!.textContent).toBe('3')
  })
  test('счёт — в названии кнопки; живая область озвучивает только смену фразы', async () => {
    await show()
    const plus = () => root.querySelector<HTMLButtonElement>('.td-tas-btn')!
    const live = () => root.querySelector('.td-tas [aria-live]')!.textContent
    await act(() => { plus().click() })
    expect(plus().getAttribute('aria-label')).toBe('Плюс один, 1 из 33, Субха́на-Лла́х')
    const first = live()
    expect(first).toBe('Субха́на-Лла́х')
    for (let i = 0; i < 4; i++) await act(() => { plus().click() })
    expect(plus().getAttribute('aria-label')).toBe('Плюс один, 5 из 33, Субха́на-Лла́х')
    expect(live()).toBe(first)            // касания внутри фразы не озвучиваются
    expect(live()).not.toMatch(/\d/)
    for (let i = 0; i < 29; i++) await act(() => { plus().click() })
    expect(live()).toBe('Аль-хамду ли-Лля́х')   // 34-е касание — новая фраза
  })
})

describe('подсказка «на экран „Домой“» (офлайн держится надёжнее)', () => {
  test('гид открыт в браузере — внизу «Сегодня» строка-подсказка; нажатие ведёт в «Ещё → Добавить на экран „Домой“»', async () => {
    const go = vi.fn()
    await act(() => { render(<TodayScreen go={go} />, root) }); await flush()
    const hint = root.querySelector('.a2hs-hint')
    expect(hint?.textContent).toContain('Добавьте гид на экран «Домой»')
    await act(() => { root.querySelector<HTMLButtonElement>('.a2hs-go')!.click() })
    expect(go).toHaveBeenCalledWith('more/install')
  })
  test('гид уже на экране «Домой» (standalone) — подсказки нет', async () => {
    standalone = true
    await show()
    expect(root.querySelector('.a2hs-hint')).toBeNull()
  })
  test('подсказку закрыли — больше не показывается', async () => {
    await show()
    await act(() => { root.querySelector<HTMLButtonElement>('.a2hs-x')!.click() })
    expect(root.querySelector('.a2hs-hint')).toBeNull()
    await act(() => { render(null, root) }); await show()
    expect(root.querySelector('.a2hs-hint')).toBeNull()
  })
  test('kk: подсказка по-казахски', async () => {
    lang.value = 'kk'
    await show()
    expect(root.querySelector('.a2hs-hint')?.textContent).toContain('Басты экранға')
  })
})
