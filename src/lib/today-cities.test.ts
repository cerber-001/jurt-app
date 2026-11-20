// @vitest-environment jsdom
/* Города Казахстана для экрана «Сегодня»: список, ближайший город, выбор на телефоне */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { memoryStorage } from '../../tests/helpers/memoryStorage'
import { KZ_CITIES, DEFAULT_CITY, cityById, nearestCity, readCityId, saveCityId, CITY_KEY } from './today-cities'

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()) })
afterEach(() => { vi.unstubAllGlobals() })

describe('список городов', () => {
  test('20 городов, у каждого названия на трёх языках и координаты в Казахстане', () => {
    expect(KZ_CITIES).toHaveLength(20)
    for (const c of KZ_CITIES) {
      expect(c.names.ru && c.names.kk && c.names.en).toBeTruthy()
      expect(c.lat).toBeGreaterThan(40); expect(c.lat).toBeLessThan(56)
      expect(c.lon).toBeGreaterThan(46); expect(c.lon).toBeLessThan(88)
    }
    expect(new Set(KZ_CITIES.map(c => c.id)).size).toBe(20)
  })

  test('по умолчанию — Алматы, координаты как в справочнике ДУМК', () => {
    expect(DEFAULT_CITY.id).toBe('almaty')
    expect(DEFAULT_CITY.lat).toBe(43.238293)
    expect(DEFAULT_CITY.lon).toBe(76.945465)
  })

  test('cityById: неизвестный id — Алматы', () => {
    expect(cityById('astana').names.ru).toBe('Астана')
    expect(cityById('нет такого').id).toBe('almaty')
  })
})

describe('nearestCity', () => {
  test('точка в Алматы — Алматы, в Астане — Астана', () => {
    expect(nearestCity(43.25, 76.92).id).toBe('almaty')
    expect(nearestCity(51.16, 71.47).id).toBe('astana')
  })
  test('Каскелен (под Алматы) — Алматы; Сарыагаш — Шымкент', () => {
    expect(nearestCity(43.2, 76.62).id).toBe('almaty')
    expect(nearestCity(41.46, 69.17).id).toBe('shymkent')
  })
  test('Семей и Усть-Каменогорск не путаются', () => {
    expect(nearestCity(50.41, 80.25).id).toBe('semey')
    expect(nearestCity(49.95, 82.6).id).toBe('oskemen')
  })
})

describe('выбор города хранится на телефоне', () => {
  test('пусто — Алматы; сохранили — читается; мусор — Алматы', () => {
    expect(readCityId()).toBe('almaty')
    saveCityId('taraz')
    expect(readCityId()).toBe('taraz')
    localStorage.setItem(CITY_KEY, 'чужое')
    expect(readCityId()).toBe('almaty')
  })
})
