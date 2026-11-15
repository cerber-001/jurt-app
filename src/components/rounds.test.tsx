// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from 'preact'
import { ROUNDS, RoundsDial, hintsOf, isRounds } from './rounds'
import { lang } from '../lib/store'
import { memoryStorage } from '../../tests/helpers/memoryStorage'
import steps from '../../public/content/steps.json'

const box = () => document.createElement('div')

describe('isRounds', () => {
  test('счётчики кругов есть у тавафа и саи', () => {
    expect(isRounds('tawaf')).toBe(true)
    expect(isRounds('sai')).toBe(true)
  })
  test('у остальных шагов — нет', () => {
    for (const id of ['ghusl', 'ihram', 'halq', '', 'TAWAF']) expect(isRounds(id)).toBe(false)
  })
})

describe('ROUNDS', () => {
  test('семь кругов', () => { expect(ROUNDS).toBe(7) })
})

describe('hintsOf', () => {
  test('достаёт data-hint-1…7 по порядку', () => {
    const html = Array.from({ length: 7 }, (_, k) => `<div data-hint-${k + 1}="Круг ${k + 1}">`).join('')
    expect(hintsOf(html)).toEqual(['Круг 1', 'Круг 2', 'Круг 3', 'Круг 4', 'Круг 5', 'Круг 6', 'Круг 7'])
  })
  test('отсутствующие подсказки — пустые строки, длина всегда 7', () => {
    const h = hintsOf('<div data-hint-2="Второй">')
    expect(h).toHaveLength(7)
    expect(h).toEqual(['', 'Второй', '', '', '', '', ''])
  })
  test('пустой html — семь пустых строк', () => {
    expect(hintsOf('')).toEqual(Array(7).fill(''))
  })
  test('на реальном контенте шагов таваф и саи дают семь непустых подсказок', () => {
    for (const id of ['tawaf', 'sai']) {
      const step = (steps as { id: string; html: string }[]).find(s => s.id === id)!
      expect(hintsOf(step.html).every(Boolean), id).toBe(true)
    }
  })
})

describe('RoundsDial', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()) })
  afterEach(() => { lang.value = 'ru'; vi.unstubAllGlobals() })
  const hints = Array.from({ length: 7 }, (_, k) => `подсказка ${k + 1}`)

  test('показывает счёт и подсказку текущего круга', () => {
    const el = box()
    render(<RoundsDial id="tawaf" n={2} hints={hints} />, el)
    expect(el.querySelector('.dial-n b')?.textContent).toBe('2')
    expect(el.querySelector('.dial-hint')?.textContent).toBe('подсказка 3')
    expect(el.querySelectorAll('circle.on')).toHaveLength(2)
    expect(el.querySelectorAll('circle.cur')).toHaveLength(1)
    expect(el.querySelector('.dial.fin')).toBeNull()
  })

  test('на седьмом круге диск помечается завершённым и подсказка заменяется итоговой', () => {
    const el = box()
    render(<RoundsDial id="sai" n={7} hints={hints} />, el)
    expect(el.querySelector('.dial.fin')).not.toBeNull()
    expect(el.querySelector('.dial-hint')?.textContent).not.toBe('подсказка 7')
    expect(el.querySelector('.kicker')).toBeNull()
  })

  test('на других языках вместо русской подсказки — «единица + номер»', () => {
    lang.value = 'en'
    const el = box()
    render(<RoundsDial id="tawaf" n={3} hints={hints} />, el)
    expect(el.querySelector('.dial-hint')?.textContent).not.toContain('подсказка')
    expect(el.querySelector('.dial-hint')?.textContent).toMatch(/4$/)
  })
})
