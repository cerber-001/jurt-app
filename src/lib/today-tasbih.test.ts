// @vitest-environment jsdom
/* Тасбих без очков: 33 · 33 · 33 по кругу, счёт — только на сегодня */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { memoryStorage } from '../../tests/helpers/memoryStorage'
import { TASBIH_KEY, forgetTasbih, readTasbih, setTasbihCount, tasbihCount, tasbihView, writeTasbih } from './today-tasbih'

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); forgetTasbih() })
afterEach(() => { vi.unstubAllGlobals() })

describe('tasbihView', () => {
  test('0 — первая фраза, счёт 0', () => {
    expect(tasbihView(0)).toEqual({ count: 0, phrase: 0, next: 1 })
  })
  test('33-е касание — первая фраза ещё на экране (33), дальше — вторая', () => {
    expect(tasbihView(33)).toEqual({ count: 33, phrase: 0, next: 1 })
  })
  test('34-е касание — вторая фраза, счёт с 1', () => {
    expect(tasbihView(34)).toEqual({ count: 1, phrase: 1, next: 2 })
  })
  test('66 → 67: третья фраза; после 99 — снова первая (по кругу)', () => {
    expect(tasbihView(67)).toEqual({ count: 1, phrase: 2, next: 0 })
    expect(tasbihView(99)).toEqual({ count: 33, phrase: 2, next: 0 })
    expect(tasbihView(100)).toEqual({ count: 1, phrase: 0, next: 1 })
  })
  test('нет никаких «итогов»: вид — только счёт внутри фразы и номера фраз', () => {
    expect(Object.keys(tasbihView(250)).sort()).toEqual(['count', 'next', 'phrase'])
    expect(tasbihView(250).count).toBeLessThanOrEqual(33)
  })
})

describe('хранение на сегодня', () => {
  test('записали сегодня — читается сегодня', () => {
    writeTasbih('2026-11-20', 40)
    expect(readTasbih('2026-11-20')).toBe(40)
  })
  test('на следующий день — с нуля', () => {
    writeTasbih('2026-11-20', 40)
    expect(readTasbih('2026-11-21')).toBe(0)
  })
  test('сброс — ноль, запись убирается', () => {
    writeTasbih('2026-11-20', 40)
    writeTasbih('2026-11-20', 0)
    expect(readTasbih('2026-11-20')).toBe(0)
    expect(localStorage.getItem(TASBIH_KEY)).toBeNull()
  })
  test('мусор в хранилище — ноль', () => {
    localStorage.setItem(TASBIH_KEY, '{oops')
    expect(readTasbih('2026-11-20')).toBe(0)
    localStorage.setItem(TASBIH_KEY, JSON.stringify({ d: '2026-11-20', n: -5 }))
    expect(readTasbih('2026-11-20')).toBe(0)
  })
  test('хранится только день и одно число — без истории', () => {
    writeTasbih('2026-11-20', 7)
    expect(JSON.parse(localStorage.getItem(TASBIH_KEY)!)).toEqual({ d: '2026-11-20', n: 7 })
  })
})

describe('счёт в памяти (хранилище — только для восстановления)', () => {
  test('хранилище не принимает запись (приватный режим, переполнено) — счёт всё равно растёт', () => {
    const st = memoryStorage()
    st.setItem = () => { throw new DOMException('quota', 'QuotaExceededError') }
    vi.stubGlobal('localStorage', st)
    for (let i = 0; i < 3; i++) setTasbihCount('2026-11-20', tasbihCount('2026-11-20') + 1)
    expect(tasbihCount('2026-11-20')).toBe(3)
  })
  test('при запуске счёт восстанавливается из хранилища', () => {
    writeTasbih('2026-11-20', 12)
    expect(tasbihCount('2026-11-20')).toBe(12)
  })
  test('смена дня — с нуля, даже если в памяти был вчерашний счёт', () => {
    setTasbihCount('2026-11-20', 9)
    expect(tasbihCount('2026-11-21')).toBe(0)
  })
  test('запись в память идёт и в хранилище — переживает перезапуск', () => {
    setTasbihCount('2026-11-20', 4)
    forgetTasbih()
    expect(tasbihCount('2026-11-20')).toBe(4)
  })
})
