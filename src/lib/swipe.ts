/* Свайп между шагами в окне «Рядом»: влево — следующий шаг, вправо — предыдущий.
   Только уверенный горизонтальный жест: вертикальная прокрутка текста не ломается, случайных срабатываний нет.
   Кнопки «Назад» и «Дальше» остаются — свайп лишь добавка для тех, кому так привычнее. */

export type SwipeDir = 'next' | 'prev'

/** Насколько надо провести пальцем, px: заметно больше случайного сдвига при касании */
export const SWIPE_MIN_DX = 72
/** Во сколько раз движение вбок должно быть больше движения вверх-вниз */
export const SWIPE_RATIO = 2
/** Пока палец не ушёл дальше этого, px, — ещё не ясно, листают или прокручивают */
export const AXIS_LOCK_PX = 12
/** Край экрана, px: там у iPhone и Android свой жест «Назад» — его не перехватываем */
export const EDGE_PX = 24

/** Решение по итогу жеста: куда листать или никуда */
export function swipeDir(dx: number, dy: number): SwipeDir | null {
  if (Math.abs(dx) < SWIPE_MIN_DX || Math.abs(dx) < SWIPE_RATIO * Math.abs(dy)) return null
  return dx < 0 ? 'next' : 'prev'
}

/** Ось жеста по первым пикселям движения: пока не ясно — null */
export function axisOf(dx: number, dy: number): 'x' | 'y' | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_PX) return null
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
}

/** Касание, с которого свайп не начинаем: край экрана, поле ввода, элемент с собственной прокруткой вбок */
export function ignoreStart(x: number, width: number, target: EventTarget | null): boolean {
  if (x < EDGE_PX || x > width - EDGE_PX) return true
  return target instanceof Element && !!target.closest('input,textarea,select,[contenteditable="true"],.no-swipe')
}

export interface SwipeHandlers {
  /** решение «листать» — 'next' или 'prev' */
  onSwipe: (dir: SwipeDir) => void
  /** можно ли сейчас листать (например, не во время счёта кругов) */
  enabled: () => boolean
  /** сдвиг пальца по горизонтали во время жеста (для лёгкого «следования»); null — жест закончился */
  onDrag?: (dx: number | null) => void
}

/** Слушает касания на элементе. Возвращает функцию, которая снимает слушатели */
export function attachSwipe(el: HTMLElement, h: SwipeHandlers): () => void {
  let x0 = 0, y0 = 0, axis: 'x' | 'y' | null = null, active = false
  const start = (e: TouchEvent) => {
    active = e.touches.length === 1 && h.enabled() && !ignoreStart(e.touches[0].clientX, innerWidth, e.target)
    if (!active) return
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; axis = null
  }
  const move = (e: TouchEvent) => {
    if (!active) return
    const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0
    axis ??= axisOf(dx, dy)
    if (axis === 'y') { active = false; return }   // прокрутка — не мешаем
    if (axis === 'x') h.onDrag?.(dx)
  }
  const end = (e: TouchEvent) => {
    if (!active) return
    active = false
    h.onDrag?.(null)
    const t = e.changedTouches[0]
    const dir = axis === 'x' && t ? swipeDir(t.clientX - x0, t.clientY - y0) : null
    if (dir) h.onSwipe(dir)
  }
  const cancel = () => { if (active) { active = false; h.onDrag?.(null) } }
  el.addEventListener('touchstart', start, { passive: true })
  el.addEventListener('touchmove', move, { passive: true })
  el.addEventListener('touchend', end, { passive: true })
  el.addEventListener('touchcancel', cancel, { passive: true })
  return () => {
    el.removeEventListener('touchstart', start)
    el.removeEventListener('touchmove', move)
    el.removeEventListener('touchend', end)
    el.removeEventListener('touchcancel', cancel)
  }
}
