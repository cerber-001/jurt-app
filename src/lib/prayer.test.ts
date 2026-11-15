import { describe, expect, test } from 'vitest'
import {
  CITIES, MADINAH, MAKKAH, METHODS, METHOD_NAMES, ORDER, cityByName, hhmm, km, next, qibla, times,
} from './prayer'

const MECCA = CITIES.find(c => c.id === 'mecca')!
const ALMATY = CITIES.find(c => c.id === 'almaty')!
const day = (iso: string, h = 12) => new Date(`${iso}T${String(h).padStart(2, '0')}:00:00Z`)
const mins = (hhmmText: string) => { const [h, m] = hhmmText.split(':').map(Number); return h * 60 + m }

describe('hhmm', () => {
  test.each([
    [0, '00:00'], [65.4, '01:05'], [719.5, '12:00'], [1439, '23:59'], [1440, '00:00'], [-1, '23:59'], [1500, '01:00'],
  ])('%d мин → %s', (m, expected) => {
    expect(hhmm(m)).toBe(expected)
  })
})

describe('qibla', () => {
  test('из Алматы — на юго-запад', () => {
    const q = qibla(ALMATY.lat, ALMATY.lon)
    expect(q).toBeGreaterThan(240)
    expect(q).toBeLessThan(270)
  })
  test('из Медины — почти строго на юг, чуть восточнее (Мекка лежит на 0,2° долготы восточнее)', () => {
    const q = qibla(MADINAH[0], MADINAH[1])
    expect(q).toBeGreaterThan(170)
    expect(q).toBeLessThan(180)
  })
  test('из Лондона — известное значение ≈119°', () => {
    expect(qibla(51.5074, -0.1278)).toBeCloseTo(119, 0)
  })
  test('из Нью-Йорка — ≈58°', () => {
    expect(qibla(40.7128, -74.006)).toBeGreaterThan(57)
    expect(qibla(40.7128, -74.006)).toBeLessThan(60)
  })
  test('значение всегда в диапазоне [0, 360)', () => {
    for (const c of CITIES) {
      const q = qibla(c.lat, c.lon)
      expect(q).toBeGreaterThanOrEqual(0)
      expect(q).toBeLessThan(360)
    }
  })
})

describe('km', () => {
  test('от точки до неё самой — ноль', () => {
    expect(km(MAKKAH[0], MAKKAH[1])).toBeCloseTo(0, 5)
  })
  test('Медина — Мекка ≈ 340 км по прямой', () => {
    expect(km(MADINAH[0], MADINAH[1])).toBeGreaterThan(330)
    expect(km(MADINAH[0], MADINAH[1])).toBeLessThan(350)
  })
  test('симметрична', () => {
    expect(km(43.238, 76.946, 41.008, 28.978)).toBeCloseTo(km(41.008, 28.978, 43.238, 76.946), 6)
  })
})

describe('times (Мекка, метод Умм аль-Кура, 10.11.2026)', () => {
  const t = times(day('2026-11-10'), MECCA.lat, MECCA.lon, MECCA.tz, MECCA.method)

  test('намазы идут по порядку в течение дня', () => {
    expect(t.fajr).toBeLessThan(t.sunrise)
    expect(t.sunrise).toBeLessThan(t.dhuhr)
    expect(t.dhuhr).toBeLessThan(t.asr)
    expect(t.asr).toBeLessThan(t.maghrib)
    expect(t.maghrib).toBeLessThan(t.isha)
  })

  test('времена правдоподобны для ноября в Мекке', () => {
    expect(t.fajr).toBeGreaterThan(mins('04:30')); expect(t.fajr).toBeLessThan(mins('05:30'))
    expect(t.sunrise).toBeGreaterThan(mins('06:00')); expect(t.sunrise).toBeLessThan(mins('06:45'))
    expect(t.dhuhr).toBeGreaterThan(mins('11:55')); expect(t.dhuhr).toBeLessThan(mins('12:30'))
    expect(t.asr).toBeGreaterThan(mins('15:00')); expect(t.asr).toBeLessThan(mins('15:50'))
    expect(t.maghrib).toBeGreaterThan(mins('17:15')); expect(t.maghrib).toBeLessThan(mins('18:00'))
  })

  test('иша по Умм аль-Кура — через 90 минут после магриба', () => {
    expect(t.isha - t.maghrib).toBe(90)
  })

  test('в Рамадан (март 2026) иша — через 120 минут после магриба', () => {
    const r = times(day('2026-03-01'), MECCA.lat, MECCA.lon, MECCA.tz, 'mkk')
    expect(r.isha - r.maghrib).toBe(120)
  })

  test('аср: asr1 (шафиитский) раньше asr2 (ханафитский); итоговый asr у mkk = asr1', () => {
    expect(t.asr1).toBeLessThan(t.asr2)
    expect(t.asr).toBe(t.asr1)
  })

  test('ДУМК (Алматы) использует ханафитский аср и заданный угол иша', () => {
    const a = times(day('2026-11-10', 6), ALMATY.lat, ALMATY.lon, ALMATY.tz, ALMATY.method)
    expect(a.asr).toBe(a.asr2)
    expect(a.maghrib).toBeLessThan(a.isha)
    expect(a.isha - a.maghrib).toBeGreaterThan(60)
  })

  test('неизвестный метод — запасной mkk, объект-метод принимается', () => {
    const base = times(day('2026-11-10'), MECCA.lat, MECCA.lon, 3, 'mkk')
    expect(times(day('2026-11-10'), MECCA.lat, MECCA.lon, 3, 'нет-такого')).toEqual(base)
    expect(times(day('2026-11-10'), MECCA.lat, MECCA.lon, 3, METHODS.mkk)).toEqual(base)
  })

  test('сдвиг дня на сутки смещает время не более чем на пару минут', () => {
    const t2 = times(day('2026-11-11'), MECCA.lat, MECCA.lon, 3, 'mkk')
    expect(Math.abs(t2.fajr - t.fajr)).toBeLessThanOrEqual(2)
    expect(Math.abs(t2.maghrib - t.maghrib)).toBeLessThanOrEqual(2)
  })
})

describe('next', () => {
  const localNow = (iso: string, hh: number, mm = 0) => new Date(Date.parse(iso + 'T00:00:00Z') + ((hh * 60 + mm) - 180) * 60_000)
  const T = times(day('2026-11-10'), MECCA.lat, MECCA.lon, 3, 'mkk')

  test('утром ближайший — зухр (восход пропускается)', () => {
    const now = localNow('2026-11-10', 10)
    const n = next(now, MECCA.lat, MECCA.lon, 3, 'mkk')!
    expect(n.key).toBe('dhuhr')
    expect(n.min).toBe(T.dhuhr)
    expect(n.left).toBe(T.dhuhr - 600)
    expect(Math.abs(n.at.getTime() - (now.getTime() + n.left * 60_000))).toBeLessThan(60_000)
  })

  test('до рассвета ближайший — фаджр', () => {
    const n = next(localNow('2026-11-10', 3), MECCA.lat, MECCA.lon, 3, 'mkk')!
    expect(n.key).toBe('fajr')
    expect(n.left).toBeGreaterThan(0)
  })

  test('после иша — фаджр следующего дня, не дальше суток', () => {
    const n = next(localNow('2026-11-10', 23), MECCA.lat, MECCA.lon, 3, 'mkk')!
    expect(n.key).toBe('fajr')
    expect(n.left).toBeGreaterThan(0)
    expect(n.left).toBeLessThan(24 * 60)
  })

  test('пятничный зухр помечается friday, остальные дни — нет', () => {
    const fri = localNow('2026-11-13', 9)
    expect(new Date(fri.getTime() + 3 * 3600_000).getUTCDay()).toBe(5)
    expect(next(fri, MECCA.lat, MECCA.lon, 3, 'mkk')!.friday).toBe(true)
    expect(next(localNow('2026-11-10', 9), MECCA.lat, MECCA.lon, 3, 'mkk')!.friday).toBe(false)
  })

  test('результат — всегда один из пяти намазов, не восход', () => {
    for (let h = 0; h < 24; h++) {
      const n = next(localNow('2026-11-10', h), MECCA.lat, MECCA.lon, 3, 'mkk')!
      expect(ORDER.filter(k => k !== 'sunrise')).toContain(n.key)
      expect(n.left).toBeGreaterThan(0)
    }
  })
})

describe('cityByName', () => {
  test.each([
    ['Медина', 'medina'], ['Мекка, отель', 'mecca'], ['Мәдина', 'medina'], ['Мекке', 'mecca'],
    ['Istanbul', 'istanbul'], ['СТАМБУЛ', 'istanbul'],
  ])('«%s» → %s', (name, id) => {
    expect(cityByName(name)?.id).toBe(id)
  })
  test('несколько городов в строке — берётся первый по списку CITIES', () => {
    expect(cityByName('Алматы → Стамбул')?.id).toBe('almaty')
  })
  test('неизвестный или пустой город — undefined', () => {
    expect(cityByName('Париж')).toBeUndefined()
    expect(cityByName('')).toBeUndefined()
    expect(cityByName(undefined)).toBeUndefined()
  })
})

describe('справочник городов и методов', () => {
  test('у каждого города есть расчётный метод с названием и имена на трёх языках', () => {
    for (const c of CITIES) {
      expect(METHODS[c.method], c.id).toBeDefined()
      expect(Object.keys(METHOD_NAMES[c.method] ?? {}).sort(), c.id).toEqual(['en', 'kk', 'ru'])
      expect(Object.keys(c.names).sort(), c.id).toEqual(['en', 'kk', 'ru'])
    }
  })
  test('идентификаторы городов уникальны', () => {
    expect(new Set(CITIES.map(c => c.id)).size).toBe(CITIES.length)
  })
})
