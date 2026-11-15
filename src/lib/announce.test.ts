import { describe, expect, test } from 'vitest'
import { FRESH_HOURS, announcedAt, isFresh, localAt } from './announce'

/* Сервер пишет время объявления как «ДД.ММ ЧЧ:ММ» по Алматы (UTC+5), без года. */
const utc = (iso: string) => new Date(iso + 'Z')

describe('announcedAt', () => {
  test('«01.11 22:30» по Алматы — это 17:30 UTC того же дня', () => {
    expect(announcedAt('01.11 22:30', utc('2026-11-01T18:00:00'))?.toISOString()).toBe('2026-11-01T17:30:00.000Z')
  })

  test('год — текущий; декабрьское объявление в январе относится к прошлому году', () => {
    expect(announcedAt('31.12 23:00', utc('2027-01-01T02:00:00'))?.toISOString()).toBe('2026-12-31T18:00:00.000Z')
  })

  test('нечитаемая строка — null', () => {
    expect(announcedAt('вчера', utc('2026-11-01T18:00:00'))).toBeNull()
    expect(announcedAt('', utc('2026-11-01T18:00:00'))).toBeNull()
    expect(announcedAt('45.13 99:99', utc('2026-11-01T18:00:00'))).toBeNull()
  })
})

describe('isFresh', () => {
  const now = utc('2026-11-01T18:00:00')   // 23:00 по Алматы

  test('объявление получасовой давности — свежее', () => {
    expect(isFresh('01.11 22:30', now)).toBe(true)
  })

  test(`ровно на границе ${FRESH_HOURS} часов — уже не свежее`, () => {
    expect(isFresh('01.11 17:00', now)).toBe(false)
    expect(isFresh('01.11 17:01', now)).toBe(true)
  })

  test('объявление нескольких дней давности — не свежее', () => {
    expect(isFresh('28.10 13:35', now)).toBe(false)
  })

  test('небольшое расхождение часов (объявление «из будущего» на 5 минут) — свежее', () => {
    expect(isFresh('01.11 23:05', now)).toBe(true)
  })

  test('без времени или с нечитаемым временем — не свежее', () => {
    expect(isFresh(undefined, now)).toBe(false)
    expect(isFresh('—', now)).toBe(false)
  })
})

describe('localAt', () => {
  const now = utc('2026-11-01T18:00:00')

  test('Мекка (UTC+3): «13:35» по Алматы — это 11:35 по местному', () => {
    expect(localAt('01.11 13:35', now, 3)).toBe('01.11 11:35')
  })

  test('Алматы (UTC+5): время не меняется', () => {
    expect(localAt('01.11 13:35', now, 5)).toBe('01.11 13:35')
  })

  test('переход через полночь меняет и дату', () => {
    expect(localAt('01.11 01:10', now, 3)).toBe('31.10 23:10')
  })

  test('нечитаемая строка возвращается как есть', () => {
    expect(localAt('только что', now, 3)).toBe('только что')
  })
})
