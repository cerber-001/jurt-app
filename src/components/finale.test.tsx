// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from 'preact'
import { act } from 'preact/test-utils'
import { Finale, finale } from './finale'

describe('Финал умры — окно с дуа', () => {
  let box: HTMLDivElement
  beforeEach(() => { box = document.createElement('div'); document.body.appendChild(box); finale.value = false })
  afterEach(() => { act(() => { finale.value = false }); render(null, box); box.remove() })

  const open = async () => { await act(async () => { render(<Finale />, box); finale.value = true }) }

  it('открылось — это диалог с заголовком, фокус на кнопке «Вернуться», наград и очков нет', async () => {
    await open()
    const dlg = box.querySelector('[role=dialog]')!
    expect(dlg.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(dlg.getAttribute('aria-labelledby')!)?.textContent).toBeTruthy()
    expect(document.activeElement).toBe(box.querySelector('.finale-go'))
    expect(box.textContent).not.toMatch(/очк|балл|наград|point|score/i)
  })

  it('Escape закрывает', async () => {
    await open()
    await act(() => { dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(finale.value).toBe(false)
    expect(box.querySelector('[role=dialog]')).toBeNull()
  })

  it('системная «Назад» закрывает', async () => {
    await open()
    await act(() => { dispatchEvent(new PopStateEvent('popstate')) })
    expect(finale.value).toBe(false)
  })

  it('кнопка «Вернуться» закрывает', async () => {
    await open()
    await act(() => { (box.querySelector('.finale-go') as HTMLButtonElement).click() })
    expect(finale.value).toBe(false)
  })
})
