import { describe, expect, it } from 'vitest'
import {
  FLOOD_DIR, dayPhase, meccaClock, meccaLight, mixHex, parseDebugTime, sceneLight, sunPosition, sunVector,
} from './sun'

/** Момент по времени Мекки (UTC+3) */
const mecca = (iso: string) => new Date(iso + '+03:00')

/** Найти минуту, когда высота солнца пересекает −0,833° (восход — вверх, закат — вниз), в окне [from, from + hours) */
function crossing(from: Date, hours: number, rising: boolean): Date {
  let prev = sunPosition(from).altitude
  for (let m = 1; m <= hours * 60; m++) {
    const t = new Date(from.getTime() + m * 60_000), a = sunPosition(t).altitude
    if (rising ? prev < -0.833 && a >= -0.833 : prev > -0.833 && a <= -0.833) return t
    prev = a
  }
  throw new Error('нет пересечения')
}

const minutesBetween = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 60_000

describe('sunPosition — солнце над Каабой', () => {
  it('в полдень 21 июня почти в зените (Мекка у тропика Рака)', () => {
    // истинный полдень Мекки ≈ 12:20 по местному: долгота 39,83° против пояса 45°
    const p = sunPosition(mecca('2026-06-21T12:20:00'))
    expect(p.altitude).toBeGreaterThan(85)
  })

  it('в полдень 24 ноября — высоко и на юге', () => {
    const p = sunPosition(mecca('2026-11-24T12:12:00'))
    expect(p.altitude).toBeGreaterThan(44)
    expect(p.altitude).toBeLessThan(50)   // 90 − 21,4 − 20,6 (склонение) ≈ 48°
    expect(p.azimuth).toBeGreaterThan(170)
    expect(p.azimuth).toBeLessThan(190)
  })

  it('в полночь — под горизонтом', () => {
    expect(sunPosition(mecca('2026-11-24T00:00:00')).altitude).toBeLessThan(-40)
    expect(sunPosition(mecca('2026-06-21T00:00:00')).altitude).toBeLessThan(-30)
  })

  it('восход и закат 24.11.2026 совпадают с timeanddate.com (Makkah: 06:36 и 17:37) ± 15 мин', () => {
    // источник: https://www.timeanddate.com/sun/@104515 — восход 6:36 (азимут 112°), закат 5:37 pm
    const rise = crossing(mecca('2026-11-24T04:00:00'), 5, true)
    const set = crossing(mecca('2026-11-24T15:00:00'), 5, false)
    expect(minutesBetween(rise, mecca('2026-11-24T06:36:00'))).toBeLessThanOrEqual(15)
    expect(minutesBetween(set, mecca('2026-11-24T17:37:00'))).toBeLessThanOrEqual(15)
    expect(sunPosition(rise).azimuth).toBeGreaterThan(108)
    expect(sunPosition(rise).azimuth).toBeLessThan(116)
  })

  it('утром солнце на востоке, вечером — на западе', () => {
    expect(sunPosition(mecca('2026-11-24T08:00:00')).azimuth).toBeLessThan(180)
    expect(sunPosition(mecca('2026-11-24T16:00:00')).azimuth).toBeGreaterThan(180)
  })
})

describe('sunVector', () => {
  it('единичный; юг на высоте 0 — (0, −1, 0), зенит — (0, 0, 1)', () => {
    const s = sunVector({ altitude: 0, azimuth: 180 })
    expect(s[0]).toBeCloseTo(0, 6); expect(s[1]).toBeCloseTo(-1, 6); expect(s[2]).toBeCloseTo(0, 6)
    expect(sunVector({ altitude: 90, azimuth: 33 })[2]).toBeCloseTo(1, 6)
    const v = sunVector({ altitude: 37, azimuth: 251 })
    expect(Math.hypot(...v)).toBeCloseTo(1, 9)
  })
})

describe('meccaClock', () => {
  it('UTC+3 и переход через полночь', () => {
    expect(meccaClock(new Date('2026-11-24T11:20:00Z'))).toBe('14:20')
    expect(meccaClock(new Date('2026-11-24T22:05:00Z'))).toBe('01:05')
    expect(meccaClock(new Date('2026-11-24T21:00:00Z'))).toBe('00:00')
  })
})

describe('dayPhase', () => {
  it('ночь, утро, день, вечер', () => {
    expect(dayPhase({ altitude: -20, azimuth: 300 })).toBe('night')
    expect(dayPhase({ altitude: 3, azimuth: 110 })).toBe('morning')
    expect(dayPhase({ altitude: 40, azimuth: 180 })).toBe('day')
    expect(dayPhase({ altitude: -2, azimuth: 250 })).toBe('evening')
  })
  it('по часам Мекки: 14:20 — день, 17:45 — вечер, 23:00 — ночь', () => {
    expect(meccaLight(mecca('2026-11-24T14:20:00')).phase).toBe('day')
    expect(meccaLight(mecca('2026-11-24T17:45:00')).phase).toBe('evening')
    expect(meccaLight(mecca('2026-11-24T23:00:00')).phase).toBe('night')
  })
})

describe('sceneLight — свет сцены', () => {
  const noon = sceneLight({ altitude: 48, azimuth: 180 })
  const sunset = sceneLight({ altitude: 2, azimuth: 248 })
  const night = sceneLight({ altitude: -30, azimuth: 300 })

  it('днём — не ночь, яркое солнце по направлению солнца', () => {
    expect(noon.night).toBe(0)
    expect(noon.keyIntensity).toBeGreaterThan(2)
    const s = sunVector({ altitude: 48, azimuth: 180 })
    noon.keyDir.forEach((v, i) => expect(v).toBeCloseTo(s[i], 6))
  })

  it('на закате — низкое тёплое солнце: оранжевее и слабее полуденного', () => {
    expect(sunset.night).toBe(0)
    expect(sunset.keyIntensity).toBeLessThan(noon.keyIntensity)
    const red = (h: number) => (h >> 16) & 255, blue = (h: number) => h & 255
    expect(red(sunset.keyColor) - blue(sunset.keyColor)).toBeGreaterThan(red(noon.keyColor) - blue(noon.keyColor))
    expect(sunset.keyDir[2]).toBeGreaterThan(0)   // для теней солнце не опускается под горизонт
  })

  it('ночью — полный ночной режим: солнца нет, свет прожекторов сверху, тёмно-синее небо, подсветка матафа', () => {
    expect(night.night).toBe(1)
    const f = sunVector(FLOOD_DIR)
    night.keyDir.forEach((v, i) => expect(v).toBeCloseTo(f[i], 6))
    expect(night.keyDir[2]).toBeGreaterThan(0.8)
    expect(night.floodGlow).toBe(1)
    const z = night.sky.zenith, r = (z >> 16) & 255, b = z & 255
    expect(b).toBeGreaterThan(r)          // синее
    expect(b).toBeLessThan(90)            // тёмное
    expect(night.sky.sunGlowK).toBe(0)
    expect(night.goldGlow).toBeGreaterThan(0)
    expect(night.bloomStrength).toBeGreaterThan(noon.bloomStrength)
  })

  it('переход непрерывный: по шагам 0,25° ни одна величина не прыгает', () => {
    let prev = sceneLight({ altitude: 20, azimuth: 250 })
    for (let a = 20; a >= -15; a -= 0.25) {
      const cur = sceneLight({ altitude: a, azimuth: 250 })
      expect(Math.abs(cur.night - prev.night)).toBeLessThan(0.06)
      expect(Math.abs(cur.keyIntensity - prev.keyIntensity)).toBeLessThan(0.15)
      expect(Math.abs(cur.envIntensity - prev.envIntensity)).toBeLessThan(0.03)
      prev = cur
    }
  })
})

describe('mixHex', () => {
  it('концы и середина', () => {
    expect(mixHex(0x000000, 0xffffff, 0)).toBe(0x000000)
    expect(mixHex(0x000000, 0xffffff, 1)).toBe(0xffffff)
    expect(mixHex(0x000000, 0x0000fe, 0.5)).toBe(0x00007f)
    expect(mixHex(0x102030, 0x405060, 7)).toBe(0x405060)   // за пределами 0…1 — до края
  })
})

describe('parseDebugTime — ?h3time=', () => {
  const now = new Date('2026-11-24T10:00:00Z')   // 13:00 в Мекке
  it('«ЧЧ:ММ» — сегодня по Мекке', () => {
    expect(parseDebugTime('22:30', now)?.toISOString()).toBe('2026-11-24T19:30:00.000Z')
    expect(parseDebugTime('01:15', now)?.toISOString()).toBe('2026-11-23T22:15:00.000Z')
  })
  it('полная дата ISO', () => {
    expect(parseDebugTime('2026-06-21T09:20:00Z', now)?.toISOString()).toBe('2026-06-21T09:20:00.000Z')
  })
  it('пусто и мусор — null', () => {
    expect(parseDebugTime(null, now)).toBeNull()
    expect(parseDebugTime('', now)).toBeNull()
    expect(parseDebugTime('25:00', now)).toBeNull()
    expect(parseDebugTime('вечер', now)).toBeNull()
  })
})
