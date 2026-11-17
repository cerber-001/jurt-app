// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { keepAwake } from './wake'

/** Подставной Wake Lock: считает просьбы и снятия */
function fakeWake(fail = false) {
  const released: number[] = []
  let asked = 0
  const request = vi.fn(() => {
    const n = ++asked
    return fail ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve({ release: () => { released.push(n); return Promise.resolve() } })
  })
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
  return { request, released }
}
const flush = () => new Promise(r => setTimeout(r, 0))
const setVisible = (v: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock')
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

describe('keepAwake', () => {
  test('просит не гасить экран и снимает просьбу при выходе', async () => {
    const w = fakeWake()
    const stop = keepAwake()
    await flush()
    expect(w.request).toHaveBeenCalledWith('screen')
    stop()
    await flush()
    expect(w.released).toEqual([1])
  })

  test('после возврата во вкладку просит снова; после выхода — больше не просит', async () => {
    const w = fakeWake()
    const stop = keepAwake()
    setVisible('hidden')
    setVisible('visible')
    await flush()
    expect(w.request).toHaveBeenCalledTimes(2)
    stop()
    setVisible('visible')
    expect(w.request).toHaveBeenCalledTimes(2)
  })

  test('браузер без Wake Lock — без ошибок, функция снятия работает', () => {
    expect('wakeLock' in navigator).toBe(false)
    const stop = keepAwake()
    expect(() => stop()).not.toThrow()
  })

  test('телефон отказал (энергосбережение) — тихо работаем дальше', async () => {
    const w = fakeWake(true)
    const stop = keepAwake()
    await flush()
    expect(w.request).toHaveBeenCalledTimes(1)
    expect(() => stop()).not.toThrow()
  })

  test('блокировка, пришедшая уже после выхода, сразу отпускается', async () => {
    const w = fakeWake()
    const stop = keepAwake()
    stop()
    await flush()
    expect(w.released).toEqual([1])
  })
})
