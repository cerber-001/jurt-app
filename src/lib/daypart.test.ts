import { describe, expect, it } from 'vitest'
import { partAt } from './daypart'

// примерные времена Мекки в ноябре, минуты от полуночи
const T = { fajr: 5 * 60 + 10, sunrise: 6 * 60 + 25, maghrib: 17 * 60 + 40, isha: 19 * 60 + 10 }

describe('partAt — время суток по солнцу города', () => {
  it('до фаджра — ночь', () => expect(partAt(4 * 60, T)).toBe('night'))
  it('от фаджра до 45 минут после восхода — рассвет', () => {
    expect(partAt(T.fajr, T)).toBe('dawn')
    expect(partAt(T.sunrise + 30, T)).toBe('dawn')
  })
  it('днём — день', () => expect(partAt(12 * 60, T)).toBe('day'))
  it('за 50 минут до магриба и до иша — закат', () => {
    expect(partAt(T.maghrib - 50, T)).toBe('dusk')
    expect(partAt(T.isha - 1, T)).toBe('dusk')
  })
  it('с иша — ночь', () => expect(partAt(T.isha, T)).toBe('night'))
})
