/* Плавная смена экрана через View Transitions API (document.startViewTransition).
   Браузер не умеет или включено «Уменьшить движение» — экран меняется сразу, без анимации: ни полифиллов, ни библиотек.
   На время перехода у <html> стоит data-vt=<вид>: по нему wow-flow.css даёт имена слоям (шапка, меню, карточка). */

/** Вид перехода: вкладка вперёд / назад по нижнему меню; смена пункта в карточке «Сейчас» */
export type TransitionKind = 'tab' | 'tab-back' | 'hero'

interface ViewTransitionLike {
  ready?: Promise<unknown>; updateCallbackDone?: Promise<unknown>; finished?: Promise<unknown>
}
interface DocLike {
  documentElement: { dataset: Record<string, string | undefined> }
  startViewTransition?: (update: () => Promise<void>) => ViewTransitionLike
}
export interface TransitionEnv { doc: DocLike | undefined; reduced: boolean }

const REDUCED = '(prefers-reduced-motion: reduce)'

/** Окружение браузера: документ и настройка «Уменьшить движение» (читается в момент перехода — её могут сменить) */
function browserEnv(): TransitionEnv {
  const doc = typeof document === 'undefined' ? undefined : (document as unknown as DocLike)
  const reduced = typeof matchMedia === 'function' && matchMedia(REDUCED).matches
  return { doc, reduced }
}

/** Будет ли плавный переход */
export function canTransition(env: TransitionEnv = browserEnv()): boolean {
  return !!env.doc && typeof env.doc.startViewTransition === 'function' && !env.reduced
}

/** Дождаться, пока Preact отрисует изменения (он откладывает отрисовку на микрозадачу) */
const afterRender = () => new Promise<void>(r => setTimeout(r, 0))

/** Отклонённое обещание перехода (переход прерван другим, вкладка скрыта) — не ошибка для паломника */
const quiet = (p?: Promise<unknown>) => { p?.catch(() => undefined) }

let seq = 0

/** Сменить экран: update меняет состояние; при возможности — внутри плавного перехода браузера */
export function runTransition(update: () => void, kind: TransitionKind, env: TransitionEnv = browserEnv()): void {
  if (!canTransition(env)) { update(); return }
  const doc = env.doc as DocLike
  const root = doc.documentElement
  const id = ++seq
  const clear = () => { if (id === seq) delete root.dataset.vt }
  root.dataset.vt = kind
  try {
    const vt = doc.startViewTransition!(async () => { update(); await afterRender() })
    quiet(vt.ready)
    quiet(vt.updateCallbackDone)
    if (vt.finished) vt.finished.then(clear, clear)
    else clear()
  } catch {
    // браузер отказал (например, вкладка скрыта) — просто меняем экран
    clear()
    update()
  }
}

/** Вид перехода между разделами по их порядку: правее/глубже — вперёд, левее/выше — назад */
export function tabKind(fromRank: number, toRank: number): TransitionKind {
  return toRank < fromRank ? 'tab-back' : 'tab'
}
