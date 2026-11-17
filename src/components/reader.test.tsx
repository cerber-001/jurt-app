// @vitest-environment jsdom
/* Дуа «для чтения»: после «показать» фокус не падает в body, а встаёт на открытый текст */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { memoryStorage } from '../../tests/helpers/memoryStorage'
import { Reader, reading } from './reader'

let root: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  root = document.createElement('div'); document.body.append(root)
  history.replaceState(null, '')
})
afterEach(async () => { await act(() => { reading.value = null }); render(null, root); root.remove(); vi.unstubAllGlobals() })

describe('Reveal', () => {
  test('после «показать» фокус — на открытом тексте, чтец слышит, что это за текст', async () => {
    await act(() => {
      render(<Reader />, root)
      reading.value = { title: 'Тальбия', items: [{ label: 'Дуа', ar: 'لَبَّيْكَ', tr: 'Ляббайка', ru: 'Вот я перед Тобой', src: '' }] }
    })
    const show = root.querySelector<HTMLButtonElement>('.rd-reveal')!
    show.focus()
    await act(() => { show.click() })
    const tr = root.querySelector<HTMLElement>('.rd-tr')!
    expect(document.activeElement).toBe(tr)
    expect(tr.tabIndex).toBe(-1)
    expect(tr.textContent).toBe('Транскрипция: Ляббайка')
  })
})
