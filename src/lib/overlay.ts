/* Смена одного окна другим без спора за историю браузера.
   Каждое окно (useDialog в ui.tsx) при открытии кладёт запись в историю, а при закрытии кнопкой снимает её
   history.back(). Этот back() асинхронный: если сразу открыть второе окно, его новая запись появится раньше,
   чем придёт popstate от первого, — и второе окно тут же закроется. Поэтому второе окно открываем только после
   того, как история «успокоилась»: пришёл popstate от закрытия первого (или вышло время ожидания). */

/** Запись в истории, которую положило окно (useDialog) */
export const isOverlayEntry = (state: unknown): boolean =>
  !!state && typeof state === 'object' && 'jurtOverlay' in state

/** Сколько ждать popstate от закрывшегося окна, мс: обычно он приходит за 1–2 кадра */
export const SETTLE_MAX_MS = 600

/** Выполнить run, когда закрывающееся сейчас окно снимет свою запись истории.
    Вызывать в момент закрытия окна (до того, как оно вызовет history.back()).
    Если окно закрывается по «Назад» (запись уже снята) — run выполнится сразу после текущего события. */
export function afterOverlayClosed(run: () => void, maxWaitMs = SETTLE_MAX_MS): void {
  if (!isOverlayEntry(history.state)) { setTimeout(run, 0); return }
  let fired = false
  const go = () => {
    if (fired) return
    fired = true
    removeEventListener('popstate', go)
    clearTimeout(timer)
    run()
  }
  addEventListener('popstate', go)
  const timer = setTimeout(go, maxWaitMs)
}
