/* Расчёты дня для экрана «Сегодня»: следующий намаз, утро/вечер, мысль дня, даты */
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { addDays, dmy, hijriParts, isMorning, nextPrayer, pickThought, thoughtIndex, weekday, KZ_TZ } from './today-day'
import type { DayTimes } from './dumk'

const TODAY: DayTimes = { fajr: 328, sunrise: 408, dhuhr: 701, asr: 885, maghrib: 987, isha: 1067 }
const TOMORROW: DayTimes = { fajr: 329, sunrise: 409, dhuhr: 701, asr: 885, maghrib: 986, isha: 1066 }

describe('часовой пояс', () => {
  test('Казахстан — единый UTC+5 (с 01.03.2024)', () => { expect(KZ_TZ).toBe(5) })
})

describe('nextPrayer', () => {
  test('15:16 — следующий магриб через 1 ч 11 мин', () => {
    expect(nextPrayer(15 * 60 + 16, TODAY, TOMORROW)).toEqual({ key: 'maghrib', min: 987, left: 71, tomorrow: false })
  })
  test('восход пропускается: 06:00 — следующий зухр', () => {
    expect(nextPrayer(360, TODAY, TOMORROW).key).toBe('dhuhr')
  })
  test('ровно в минуту намаза — уже следующий', () => {
    expect(nextPrayer(987, TODAY, TOMORROW).key).toBe('isha')
  })
  test('ночью до фаджра — фаджр сегодня', () => {
    expect(nextPrayer(60, TODAY, TOMORROW)).toEqual({ key: 'fajr', min: 328, left: 268, tomorrow: false })
  })
  test('после иша — фаджр завтра, отсчёт через полночь', () => {
    expect(nextPrayer(23 * 60, TODAY, TOMORROW)).toEqual({ key: 'fajr', min: 329, left: 60 + 329, tomorrow: true })
    expect(nextPrayer(1068, TODAY, TOMORROW)).toMatchObject({ key: 'fajr', tomorrow: true, left: 1440 - 1068 + 329 })
  })
})

describe('isMorning: утро — от фаджра до асра, остальное — вечер', () => {
  test.each([
    [327, false], [328, true], [600, true], [884, true], [885, false], [1200, false], [30, false],
  ])('минута %i → утро: %s', (min, want) => { expect(isMorning(min, TODAY)).toBe(want) })
})

describe('мысль дня', () => {
  test('один и тот же день — одна и та же мысль; следующий день — другая', () => {
    expect(thoughtIndex('2026-11-20', 30)).toBe(thoughtIndex('2026-11-20', 30))
    expect(thoughtIndex('2026-11-21', 30)).toBe((thoughtIndex('2026-11-20', 30) + 1) % 30)
  })
  test('индекс всегда в пределах списка, пустой список — 0', () => {
    for (let i = 0; i < 400; i++) {
      const k = thoughtIndex(addDays('2026-01-01', i), 30)
      expect(k).toBeGreaterThanOrEqual(0); expect(k).toBeLessThan(30)
    }
    expect(thoughtIndex('2026-11-20', 0)).toBe(0)
  })

  type T = { id: string; road: boolean; text: string }
  const ru = JSON.parse(readFileSync(new URL('../../public/content/thoughts.json', import.meta.url), 'utf8')) as T[]
  const kk = JSON.parse(readFileSync(new URL('../../public/content/kk/thoughts.json', import.meta.url), 'utf8')) as T[]

  test('40 мыслей на ru и kk, те же id (t01–t40) в том же порядке', () => {
    expect(ru).toHaveLength(40)
    expect(kk.map(x => x.id)).toEqual(ru.map(x => x.id))
    expect(ru.map(x => x.id)).toEqual(Array.from({ length: 40 }, (_, k) => 't' + String(k + 1).padStart(2, '0')))
  })
  test('у каждой мысли поле road (дорожная или общая), одинаковое на ru и kk; общих не меньше 18', () => {
    for (const x of [...ru, ...kk]) expect(typeof x.road, x.id).toBe('boolean')
    expect(kk.map(x => x.road)).toEqual(ru.map(x => x.road))
    expect(ru.filter(x => !x.road).length).toBeGreaterThanOrEqual(18)
    expect(ru.slice(30).every(x => !x.road)).toBe(true)          // t31–t40 — общие
  })
  test('без даты поездки — только общие мысли, каждый день; с датой — из всех', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 60; i++) {
      const x = pickThought(ru, addDays('2026-11-01', i), false)!
      expect(x.road, x.id).toBe(false)
      seen.add(x.id)
    }
    expect(seen.size).toBe(ru.filter(x => !x.road).length)        // перебираются все общие
    const all = new Set<string>()
    for (let i = 0; i < 60; i++) all.add(pickThought(ru, addDays('2026-11-01', i), true)!.id)
    expect(all.size).toBe(40)
    expect(pickThought([], '2026-11-20', false)).toBeNull()
    expect(pickThought([{ id: 'a', road: true, text: 'x' }], '2026-11-20', false)!.id).toBe('a')   // общих нет — любая
  })
  test('коротко (1–2 предложения), без цитат Корана, хадисов, фетв, обещаний награды и очков', () => {
    const banned = /пророк|пайғамбар|хадис|хадис|аят|коран|құран|сура|сүре|сказал:|айтты:|харам|халал|фард|ваджиб|сунна|сүннет|обязан|міндетті|награ|сауап|очк|балл|молодец|жарайсың|рекорд|ﷺ|«/i
    for (const x of [...ru, ...kk]) {
      expect(x.text.trim()).toBe(x.text)
      expect(x.text.length).toBeLessThan(170)
      expect(x.text.split(/[.!?…](?:\s|$)/).filter(s => s.trim()).length).toBeLessThanOrEqual(2)
      expect(x.text, x.id).not.toMatch(banned)
    }
  })
})

describe('даты', () => {
  test('ДД.ММ.ГГГГ', () => { expect(dmy('2026-11-20')).toBe('20.11.2026') })
  test('addDays переходит через месяц и год', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  test('день недели: 1 — понедельник … 7 — воскресенье', () => {
    expect(weekday('2026-11-19')).toBe(4)
    expect(weekday('2026-11-22')).toBe(7)
    expect(weekday('2026-11-23')).toBe(1)
  })
  test('хиджра по Умм аль-Кура: 19.11.2026 ≈ 9 джумада-ль-ахира 1448', () => {
    const h = hijriParts('2026-11-19')
    // в среде без календаря islamic-umalqura строку просто не показываем
    if (h) expect(h).toEqual({ d: 9, m: 6, y: 1448 })
  })
  test('испорченная дата — без хиджры', () => { expect(hijriParts('nope')).toBeNull() })
})
