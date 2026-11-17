// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { EDGE_PX, SWIPE_MIN_DX, attachSwipe, axisOf, ignoreStart, swipeDir } from './swipe'

describe('swipeDir', () => {
  test('уверенно влево — следующий шаг, вправо — предыдущий', () => {
    expect(swipeDir(-120, 10)).toBe('next')
    expect(swipeDir(120, -10)).toBe('prev')
  })
  test('короткий сдвиг не листает', () => {
    expect(swipeDir(-(SWIPE_MIN_DX - 1), 0)).toBeNull()
  })
  test('косой жест (почти прокрутка) не листает', () => {
    expect(swipeDir(-120, 80)).toBeNull()
    expect(swipeDir(100, 200)).toBeNull()
  })
})

describe('axisOf', () => {
  test('пока сдвиг мал — ось не ясна', () => { expect(axisOf(5, 6)).toBeNull() })
  test('вбок — x, вниз — y', () => {
    expect(axisOf(-20, 4)).toBe('x')
    expect(axisOf(3, 30)).toBe('y')
  })
})

describe('ignoreStart', () => {
  test('у края экрана свайп не начинаем (там системный жест «Назад»)', () => {
    expect(ignoreStart(EDGE_PX - 1, 375, null)).toBe(true)
    expect(ignoreStart(375 - EDGE_PX + 1, 375, null)).toBe(true)
    expect(ignoreStart(180, 375, null)).toBe(false)
  })
  test('в поле заметки свайп не начинаем', () => {
    const ta = document.createElement('textarea')
    const p = document.createElement('p')
    expect(ignoreStart(180, 375, ta)).toBe(true)
    expect(ignoreStart(180, 375, p)).toBe(false)
  })
})

describe('attachSwipe', () => {
  const touch = (type: string, x: number, y: number, el: HTMLElement) => {
    const pt = { clientX: x, clientY: y, target: el }
    const e = new Event(type) as Event & { touches: unknown[]; changedTouches: unknown[] }
    e.touches = type === 'touchend' ? [] : [pt]
    e.changedTouches = [pt]
    el.dispatchEvent(e)
  }
  const gesture = (el: HTMLElement, pts: [number, number][]) => {
    touch('touchstart', pts[0][0], pts[0][1], el)
    for (const [x, y] of pts.slice(1)) touch('touchmove', x, y, el)
    const [x, y] = pts[pts.length - 1]
    touch('touchend', x, y, el)
  }
  let off: () => void = () => undefined
  afterEach(() => off())

  test('горизонтальный жест листает и сообщает сдвиг для анимации', () => {
    const el = document.createElement('div')
    const onSwipe = vi.fn(), onDrag = vi.fn()
    off = attachSwipe(el, { onSwipe, onDrag, enabled: () => true })
    gesture(el, [[300, 400], [280, 402], [200, 405], [150, 408]])
    expect(onSwipe).toHaveBeenCalledWith('next')
    expect(onDrag).toHaveBeenCalledWith(-100)
    expect(onDrag).toHaveBeenLastCalledWith(null)
  })

  test('вертикальная прокрутка не листает, даже если потом палец ушёл вбок', () => {
    const el = document.createElement('div')
    const onSwipe = vi.fn()
    off = attachSwipe(el, { onSwipe, enabled: () => true })
    gesture(el, [[200, 400], [202, 380], [80, 300]])
    expect(onSwipe).not.toHaveBeenCalled()
  })

  test('когда листать нельзя (идёт счёт кругов) — жест игнорируется', () => {
    const el = document.createElement('div')
    const onSwipe = vi.fn()
    off = attachSwipe(el, { onSwipe, enabled: () => false })
    gesture(el, [[100, 400], [130, 400], [260, 400]])
    expect(onSwipe).not.toHaveBeenCalled()
  })

  test('после снятия слушателей жесты не ловятся', () => {
    const el = document.createElement('div')
    const onSwipe = vi.fn()
    attachSwipe(el, { onSwipe, enabled: () => true })()
    gesture(el, [[100, 400], [130, 400], [260, 400]])
    expect(onSwipe).not.toHaveBeenCalled()
  })
})
