// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { where } from '../lib/clock'
import type { Program, ProgramItem } from '../lib/program'
import { heroView, itemLine, itemTitle } from './hero-view'

/** Мекка, UTC+3: 02.11.2026 в hh:mm по местным часам */
const at = (hm: string) => new Date(`2026-11-02T${hm}:00+03:00`)
const prog = (items: Partial<ProgramItem>[]): Program =>
  ({ days: [{ id: 'd2', date: '2026-11-02', city: 'Мекка', tz: 'UTC+3', items: items as ProgramItem[] }] }) as unknown as Program
const env = { go: vi.fn(), openStep: vi.fn() }
const view = (items: Partial<ProgramItem>[], hm: string) => {
  const now = at(hm)
  const [h, m] = hm.split(':').map(Number)
  return heroView(where(prog(items), now), h * 60 + m, env)
}

describe('itemTitle / itemLine — пункт программы без названия не ломает текст', () => {
  it('обычный пункт', () => {
    expect(itemTitle({ t: '10:00', w: 'Таваф' })).toBe('Таваф')
    expect(itemLine({ t: '10:00', w: 'Таваф' })).toBe('10:00 — Таваф')
  })
  it('пустое, пробельное или отсутствующее название — пустая строка', () => {
    expect(itemTitle({ t: '10:00', w: '' })).toBe('')
    expect(itemTitle({ t: '10:00', w: '   ' })).toBe('')
    expect(itemTitle({ t: '10:00' } as ProgramItem)).toBe('')
    expect(itemTitle(null)).toBe('')
  })
  it('строка без названия: время и место, без висящего тире', () => {
    expect(itemLine({ t: '10:00', w: '', p: 'Отель' })).toBe('10:00 — Отель')
    expect(itemLine({ t: '10:00', w: '' })).toBe('')
    expect(itemLine({ t: '', w: 'Таваф' })).toBe('Таваф')
  })
})

describe('heroView — карточка «Сейчас» при пункте без названия', () => {
  const items = [{ t: '10:00', w: '' }, { t: '12:00', w: 'Зухр в Харам' }]

  it('заголовок не пустой, главная кнопка на месте', () => {
    const v = view(items, '10:30')
    expect(v.title.trim()).not.toBe('')
    expect(v.prog).toBeFalsy()                     // это не строка программы, а подпись гида
    expect(v.cta.title.trim()).not.toBe('')
    expect(v.next?.text).toBe('12:00 — Зухр в Харам')
  })

  it('название отсутствует вовсе (undefined) — экран не падает', () => {
    expect(() => view([{ t: '10:00' }, { t: '12:00', w: 'Зухр' }], '10:30')).not.toThrow()
    expect(view([{ t: '10:00' }, { t: '12:00', w: 'Зухр' }], '10:30').title.trim()).not.toBe('')
  })

  it('следующий пункт без названия и места — строки «дальше» нет, а не «12:00 — »', () => {
    const v = view([{ t: '10:00', w: 'Таваф' }, { t: '12:00', w: ' ' }], '10:30')
    expect(v.title).toBe('Таваф')
    expect(v.next).toBeUndefined()
  })

  it('у карточки устойчивый id: меняется только со сменой пункта, а не каждую минуту', () => {
    const list = [{ t: '10:00', w: 'Таваф' }, { t: '12:00', w: 'Зухр' }]
    expect(view(list, '10:30').id).toBe(view(list, '10:31').id)
    expect(view(list, '10:30').id).not.toBe(view(list, '12:05').id)
    expect(view(list, '09:30').id).not.toBe(view(list, '10:05').id)   // «дальше» → «сейчас» того же пункта
  })
})
