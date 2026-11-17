// @vitest-environment jsdom
/* Шапка одной высоты и возврат фокуса после окна (useDialog) */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { render } from 'preact'
import { useRef } from 'preact/hooks'
import { act } from 'preact/test-utils'
import { Top, useDialog } from './ui'

let root: HTMLDivElement
beforeEach(() => { root = document.createElement('div'); document.body.append(root); history.replaceState(null, '') })
afterEach(() => { render(null, root); root.remove() })

describe('Top — шапка', () => {
  test('подзапись есть всегда: пока данных нет — неразрывный пробел, скрытый от чтеца', () => {
    render(<Top title="Гид паломника" role="паломник" />, root)
    const small = root.querySelector('.ttl small')!
    expect(small.textContent).toBe(' ')
    expect(small.getAttribute('aria-hidden')).toBe('true')
    render(<Top title="Гид паломника" sub="UMRA-0010" role="паломник" />, root)
    expect(root.querySelector('.ttl small')).toBe(small)          // тот же элемент — без перестройки шапки
    expect(small.textContent).toBe('UMRA-0010')
    expect(small.hasAttribute('aria-hidden')).toBe(false)
  })
})

/** Экран с кнопкой, окном и «чем-то», что уводит фокус в body во время отрисовки (как inert на <main>) */
function Screen({ open, onClose, steal }: { open: boolean; onClose: () => void; steal?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  useDialog(box, open, onClose)
  if (open && steal) (document.activeElement as HTMLElement | null)?.blur()
  return open ? <div ref={box} tabIndex={-1} role="dialog"><button>в окне</button></div> : null
}

describe('useDialog — возврат фокуса', () => {
  const page = (open: boolean, steal = false, withOpener = true) => (
    <>
      <main tabIndex={-1}>{withOpener && <button class="opener">открыть</button>}</main>
      <Screen open={open} onClose={() => undefined} steal={steal} />
    </>
  )

  test('фокус возвращается на кнопку, даже если при открытии браузер увёл его в body', async () => {
    await act(() => { render(page(false), root) })
    root.querySelector<HTMLButtonElement>('.opener')!.focus()
    await act(() => { render(page(true, true), root) })
    expect(document.activeElement?.getAttribute('role')).toBe('dialog')
    await act(() => { render(page(false), root) })
    expect(document.activeElement).toBe(root.querySelector('.opener'))
  })

  test('кнопки, откуда открыли, уже нет — фокус в начало содержимого <main>, а не в body', async () => {
    await act(() => { render(page(false), root) })
    root.querySelector<HTMLButtonElement>('.opener')!.focus()
    await act(() => { render(page(true), root) })
    await act(() => { render(page(true, false, false), root) })   // кнопка исчезла, пока окно открыто
    await act(() => { render(page(false, false, false), root) })
    expect(document.activeElement).toBe(root.querySelector('main'))
  })
})
