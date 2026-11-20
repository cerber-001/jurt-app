// @vitest-environment jsdom
/* Одна «сегодняшняя дата» на всех экранах — по Казахстану (UTC+5), а не по часам телефона.
   Телефон в поясе UTC, 23:30 UTC — в Алматы уже 04:30 следующего дня: все экраны согласны, что сегодня 21.11 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { memoryStorage } from '../../../tests/helpers/memoryStorage'
import { data, lang } from '../../lib/store'
import { program } from '../today'
import { forgetTasbih, writeTasbih } from '../../lib/today-tasbih'
import { kzToday } from '../../lib/today-day'
import { TodayScreen } from './today'
import { JourneyScreen } from './journey'

const PUBLIC = join(process.cwd(), 'public')
function fakeFetch(url: string): Promise<Response> {
  if (url.startsWith('https://')) return Promise.reject(new TypeError('Failed to fetch'))
  try { return Promise.resolve(new Response(readFileSync(join(PUBLIC, url.replace(/^\//, '')), 'utf8'), { status: 200 })) }
  catch { return Promise.resolve(new Response('', { status: 404 })) }
}

let root: HTMLDivElement
let tz: string | undefined
const flush = async () => { for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)) }) }
const text = () => root.textContent ?? ''

beforeEach(() => {
  tz = process.env.TZ
  process.env.TZ = 'UTC'                                   // часы телефона — UTC
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('fetch', vi.fn(fakeFetch))
  vi.stubGlobal('requestIdleCallback', (cb: () => void) => setTimeout(cb, 0))
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-20T23:30:00Z'))       // 04:30 21.11 в Алматы
  forgetTasbih()
  data.value = null; program.value = null; lang.value = 'ru'
  root = document.createElement('div'); document.body.append(root)
})
afterEach(async () => {
  await act(() => { render(null, root) })
  root.remove()
  if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz
  vi.useRealTimers(); vi.unstubAllGlobals()
})

describe('сегодня по Казахстану', () => {
  test('kzToday: 23:30 UTC — уже следующий день', () => {
    expect(kzToday(new Date('2026-11-20T23:30:00Z'))).toBe('2026-11-21')
    expect(kzToday(new Date('2026-11-20T18:59:00Z'))).toBe('2026-11-20')
    expect(kzToday()).toBe('2026-11-21')
  })

  test('«Сегодня»: дата героя, урок дня и тасбих — 21.11', async () => {
    localStorage.setItem('jurt.lesson.start', '2026-11-20')
    writeTasbih('2026-11-21', 7)
    await act(() => { render(<TodayScreen go={() => undefined} />, root) })
    await flush()
    expect(root.querySelector('.hero')!.textContent).toContain('21.11.2026')
    expect(text()).toContain('Урок 2 из 30')
    expect(root.querySelector('.td-tas-btn b')!.textContent).toBe('7')
  })

  test('«Мой путь»: отсчёт до поездки и номер урока — от 21.11', async () => {
    localStorage.setItem('jurt.trip', '2026-11-22')
    localStorage.setItem('jurt.lesson.start', '2026-11-20')
    await act(() => { render(<JourneyScreen go={() => undefined} />, root) })
    expect(root.querySelector('.jr-count h2')!.textContent).toBe('1 день')
    expect(text()).toContain('сейчас урок 2')
  })
})
