/* Этап 1а «Харам заранее (3D)»: солнце над Меккой по настоящему времени и свет сцены от него.
   Чистая логика без three.js (её проверяют юнит-тесты sun.test.ts).
   Положение солнца — упрощённая формула NOAA / «Astronomical Almanac» (точность ≈ 0,01° по склонению,
   восход ± 1–2 мин) — для света в 3D этого с запасом. Время Мекки — UTC+3 круглый год (летнего времени нет). */

/** Кааба: широта и долгота, градусы */
export const KAABA_LAT = 21.4225
export const KAABA_LON = 39.8262
/** Мекка — UTC+3 без перехода на летнее время */
export const MECCA_UTC_OFFSET_H = 3

const RAD = Math.PI / 180
const wrap360 = (a: number) => ((a % 360) + 360) % 360

export interface SunPos {
  /** Высота над горизонтом, градусы (< 0 — под горизонтом) */
  altitude: number
  /** Азимут от севера по часовой стрелке, градусы (90 — восток, 180 — юг) */
  azimuth: number
}

/** Солнце в момент date для точки lat/lon (градусы; восток — плюс). Рефракция не учитывается —
    поэтому «восход» здесь — высота −0,833° (верхний край диска с рефракцией), как у NOAA и timeanddate */
export function sunPosition(date: Date, lat = KAABA_LAT, lon = KAABA_LON): SunPos {
  const n = date.getTime() / 86_400_000 + 2440587.5 - 2451545.0   // дни от J2000.0
  const L = wrap360(280.46 + 0.9856474 * n)
  const g = wrap360(357.528 + 0.9856003 * n) * RAD
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD
  const eps = (23.439 - 0.0000004 * n) * RAD
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda))
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda))
  const gmst = wrap360(280.46061837 + 360.98564736629 * n)
  const H = (gmst + lon) * RAD - ra   // часовой угол
  const phi = lat * RAD
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H))
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) / RAD + 180
  return { altitude: alt / RAD, azimuth: wrap360(az) }
}

/** Единичный вектор на солнце в системе данных модели: x — восток, y — север, z — вверх */
export function sunVector(p: SunPos): [number, number, number] {
  const a = p.altitude * RAD, z = p.azimuth * RAD
  return [Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)]
}

/** Часы Мекки «ЧЧ:ММ» */
export function meccaClock(date: Date): string {
  const m = Math.floor(date.getTime() / 60_000) + MECCA_UTC_OFFSET_H * 60
  const d = ((m % 1440) + 1440) % 1440
  return `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`
}

export type DayPhase = 'morning' | 'day' | 'evening' | 'night'

/** Высота солнца, ниже которой — ночь (конец гражданских сумерек), и выше которой — уже «день» */
export const NIGHT_ALT = -6
export const DAY_ALT = 12

/** Как назвать время суток в подписи: ночь — солнце ниже −6°; низкое солнце — утро (восточная половина неба) или вечер */
export function dayPhase(p: SunPos): DayPhase {
  if (p.altitude < NIGHT_ALT) return 'night'
  if (p.altitude < DAY_ALT) return p.azimuth < 180 ? 'morning' : 'evening'
  return 'day'
}

/* ───── Свет сцены от солнца ───── */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
/** Плавная ступень 0 → 1 между a и b */
export const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** Смешать два цвета 0xRRGGBB (в sRGB — для неба и света этого достаточно) */
export function mixHex(a: number, b: number, k: number): number {
  const t = clamp01(k)
  const ch = (s: number) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, t))
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

/** Прожекторы Харама ночью: светят сверху, чуть с юго-востока (там основные мачты) — тени короткие и мягкие */
export const FLOOD_DIR: SunPos = { altitude: 64, azimuth: 150 }
/** Ниже этой высоты солнце для теней не опускаем: иначе тени уходят на километры и карта теней «размазывается» */
const MIN_SHADOW_ALT = 4

export interface SceneLight {
  /** 0 — день (или сумерки), 1 — полная ночь */
  night: number
  /** Направление главного света (солнце днём, прожекторы ночью), единичный вектор в системе данных */
  keyDir: [number, number, number]
  keyColor: number
  keyIntensity: number
  hemiSky: number
  hemiGround: number
  hemiIntensity: number
  /** Тёплая подсветка матафа (точечный свет над Каабой); днём 0 */
  floodGlow: number
  envIntensity: number
  exposure: number
  /** Небо: зенит, горизонт, «земля» под горизонтом (для отражений), сияние вокруг солнца */
  sky: { zenith: number; horizon: number; ground: number; sunGlow: number; sunGlowK: number }
  /** Сила пятен-теней под ногами людей */
  blob: number
  /** Свечение (bloom) — порог и сила: ночью огни и нур сияют сильнее */
  bloomThreshold: number
  bloomStrength: number
  /** Добавка к свечению золота (emissiveIntensity) ночью — золото читается в прожекторах */
  goldGlow: number
}

const norm = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** Свет сцены по положению солнца: день — тёплое солнце; закат и рассвет — низкое оранжевое;
    ночь — тёмно-синее небо, солнце выключено, Харам в тёплых прожекторах */
export function sceneLight(p: SunPos): SceneLight {
  const alt = p.altitude
  const day = smooth(-2, 10, alt)            // солнце светит
  const night = 1 - smooth(-9, -1.5, alt)    // ночной режим
  const low = 1 - smooth(5, 28, alt)         // низкое (тёплое) солнце
  const sun = sunVector({ altitude: Math.max(alt, MIN_SHADOW_ALT), azimuth: p.azimuth })
  const flood = sunVector(FLOOD_DIR)
  const w = clamp01(night / Math.max(night + day, 1e-3))   // доля прожекторов в направлении главного света
  const keyDir = norm([lerp(sun[0], flood[0], w), lerp(sun[1], flood[1], w), lerp(sun[2], flood[2], w)])
  const sunColor = mixHex(0xffedd2, 0xffa45c, low)
  const keyColor = mixHex(sunColor, 0xffcf92, w)
  const dusk = clamp01(1 - day - night)      // сумерки: синее небо с оранжевым краем
  return {
    night,
    keyDir,
    keyColor,
    keyIntensity: 2.2 * day * (1 - 0.3 * low) + 1.15 * night,
    hemiSky: mixHex(mixHex(0xf3f1ea, 0xe8c7a6, low), 0xffd6a8, night),
    hemiGround: mixHex(0x4a4236, 0x1c1a20, night),
    hemiIntensity: lerp(0.8, 0.55, Math.max(night, dusk * 0.6)),
    floodGlow: night,
    envIntensity: lerp(0.55, 0.32, night),
    exposure: lerp(0.9, 0.92, night),
    sky: {
      zenith: mixHex(mixHex(0x3d7fc0, 0x34527e, Math.max(low, dusk)), 0x081a3a, night),
      horizon: mixHex(mixHex(0xcfe4ee, 0xf3b27c, Math.max(low * 0.8, dusk)), 0x24375e, night),
      ground: mixHex(0xc9b9a0, 0x2a241e, night),
      sunGlow: mixHex(0xfff0d0, 0xffb066, low),
      sunGlowK: day * (0.25 + 0.55 * low),
    },
    blob: lerp(0.5, 0.36, night),
    bloomThreshold: lerp(0.92, 0.55, night),
    bloomStrength: lerp(0.22, 0.55, night),
    goldGlow: 0.55 * night,
  }
}

/** Свет «сейчас» в Мекке одним вызовом */
export function meccaLight(date: Date): { pos: SunPos; light: SceneLight; phase: DayPhase; clock: string } {
  const pos = sunPosition(date)
  return { pos, light: sceneLight(pos), phase: dayPhase(pos), clock: meccaClock(date) }
}

/** Время для отладки и снимков из параметра адреса ?h3time=: «ЧЧ:ММ» — сегодня по Мекке, или полная дата ISO.
    Неверное значение — null (берётся настоящее время) */
export function parseDebugTime(v: string | null, now: Date): Date | null {
  if (!v) return null
  const hm = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  if (hm) {
    const h = Number(hm[1]), m = Number(hm[2])
    if (h > 23 || m > 59) return null
    const day = Math.floor((now.getTime() + MECCA_UTC_OFFSET_H * 3_600_000) / 86_400_000)   // сегодняшние сутки по Мекке
    return new Date(day * 86_400_000 + (h * 60 + m - MECCA_UTC_OFFSET_H * 60) * 60_000)
  }
  const d = new Date(v)
  return Number.isFinite(d.getTime()) ? d : null
}
