// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { afterOverlayClosed, isOverlayEntry } from './overlay'

afterEach(() => { vi.useRealTimers(); history.replaceState(null, '') })

describe('isOverlayEntry', () => {
  test('узнаёт запись окна', () => {
    expect(isOverlayEntry({ jurtOverlay: 1 })).toBe(true)
    expect(isOverlayEntry(null)).toBe(false)
    expect(isOverlayEntry({ other: 1 })).toBe(false)
  })
})

describe('afterOverlayClosed', () => {
  test('окно закрыли кнопкой: ждёт popstate от его history.back() и только потом выполняет', () => {
    vi.useFakeTimers()
    history.replaceState({ jurtOverlay: 1 }, '')
    const run = vi.fn()
    afterOverlayClosed(run)
    vi.advanceTimersByTime(100)
    expect(run).not.toHaveBeenCalled()
    dispatchEvent(new PopStateEvent('popstate'))
    expect(run).toHaveBeenCalledTimes(1)
    dispatchEvent(new PopStateEvent('popstate'))
    vi.advanceTimersByTime(1000)
    expect(run).toHaveBeenCalledTimes(1)
  })

  test('popstate так и не пришёл — выполняет по таймауту, один раз', () => {
    vi.useFakeTimers()
    history.replaceState({ jurtOverlay: 1 }, '')
    const run = vi.fn()
    afterOverlayClosed(run, 300)
    vi.advanceTimersByTime(299)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  test('окно закрыли «Назад» (записи уже нет) — выполняет сразу после текущего события', () => {
    vi.useFakeTimers()
    history.replaceState(null, '')
    const run = vi.fn()
    afterOverlayClosed(run)
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(0)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
