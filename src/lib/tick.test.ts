// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { floorMinute, msToNextMinute, useMinuteTick } from './tick'

describe('msToNextMinute — сколько ждать до смены минуты', () => {
  it('в начале минуты — целая минута', () => expect(msToNextMinute(new Date('2026-11-02T06:20:00.000Z'))).toBe(60_000))
  it('в середине минуты — остаток', () => expect(msToNextMinute(new Date('2026-11-02T06:20:45.500Z'))).toBe(14_500))
  it('за миг до смены — почти ноль, но не ноль', () => expect(msToNextMinute(new Date('2026-11-02T06:20:59.999Z'))).toBe(1))
})

describe('floorMinute — время без секунд', () => {
  it('отрезает секунды и миллисекунды', () =>
    expect(floorMinute(new Date('2026-11-02T06:20:45.500Z')).toISOString()).toBe('2026-11-02T06:20:00.000Z'))
  it('не меняет исходную дату', () => {
    const d = new Date('2026-11-02T06:20:45.500Z')
    floorMinute(d)
    expect(d.getUTCSeconds()).toBe(45)
  })
})

describe('useMinuteTick — экран перерисовывается сам, как только сменилась минута', () => {
  let box: HTMLDivElement
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-02T06:20:40.000Z')); box = document.createElement('div') })
  afterEach(() => { render(null, box); vi.useRealTimers() })

  function Clock() {
    const now = new Date()
    useMinuteTick(now)
    return h('b', null, String(floorMinute(now).getUTCMinutes()))
  }

  it('минута сменилась — без перезагрузки и без внешних событий', async () => {
    await act(() => { render(h(Clock, null), box) })
    expect(box.textContent).toBe('20')
    await act(async () => { await vi.advanceTimersByTimeAsync(19_000) })
    expect(box.textContent).toBe('20')
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(box.textContent).toBe('21')
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(box.textContent).toBe('22')
  })

  it('вернулись на вкладку после сна телефона — время сразу свежее', async () => {
    await act(() => { render(h(Clock, null), box) })
    vi.setSystemTime(new Date('2026-11-02T06:35:10.000Z'))   // таймеры спали, часы ушли вперёд
    await act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(box.textContent).toBe('35')
  })
})
