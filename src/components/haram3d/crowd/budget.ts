/* Толпа: сколько людей и насколько подробно — по силе устройства (как на старой странице: тип устройства и экран).
   Чистая логика: признаки устройства передаёт вызывающий (crowd.ts), здесь только решение. */

/** Уровни детализации фигур (узлы fig_m_* и fig_w_* в props.glb) */
export const FIG_TIERS = ['hi', 'near', 'mid', 'far', 'xfar'] as const
export type FigTier = (typeof FIG_TIERS)[number]

/** До какого расстояния от камеры (м) человек рисуется этим уровнем; последний — дальше всех */
export const TIER_DIST: readonly number[] = [7, 14, 40, 60, Infinity]

export interface DeviceHints {
  /** Палец, а не мышь (matchMedia('(pointer: coarse)')) */
  coarse: boolean
  /** Меньшая сторона окна, CSS-пиксели */
  minSide: number
  /** Ядер процессора (navigator.hardwareConcurrency); неизвестно — 0 */
  cores: number
  /** Память, ГБ (navigator.deviceMemory, есть только в Chrome); неизвестно — 0 */
  memory: number
}

export interface CrowdBudget {
  /** Доля людей от полной толпы старой страницы (0…1) */
  density: number
  /** Людей сая (в обе стороны) */
  sai: number
  /** Сколько людей вмещает каждый уровень; не влезли в ближний — идут в следующий */
  caps: readonly number[]
  /** Проходов решателя столкновений за кадр */
  solveIters: number
}

export type DeviceClass = 'desktop' | 'phone' | 'weak'

/** Класс устройства: телефон — «палец» или узкое окно; слабый телефон — ≤ 4 ядер или ≤ 3 ГБ памяти (неизвестно — не слабый) */
export function deviceClass(h: DeviceHints): DeviceClass {
  const phone = h.coarse || h.minSide < 600
  if (!phone) return 'desktop'
  return (h.cores > 0 && h.cores <= 4) || (h.memory > 0 && h.memory <= 3) ? 'weak' : 'phone'
}

/** Компьютер — как старая страница; телефон — меньше людей и меньше подробных фигур вблизи; слабый телефон — ещё меньше */
export function crowdBudget(h: DeviceHints): CrowdBudget {
  const c = deviceClass(h)
  if (c === 'weak') return { density: 0.4, sai: 130, caps: [6, 30, 220, 900, 6000], solveIters: 1 }
  if (c === 'phone') return { density: 0.6, sai: 220, caps: [10, 50, 360, 1400, 9000], solveIters: 2 }
  return { density: 1, sai: 360, caps: [60, 240, 1600, 5000, 18000], solveIters: 4 }
}

export interface RenderBudget {
  /** Сторона карты теней солнца (px); 0 — теней от зданий нет (слабый телефон: остаются пятна под ногами людей) */
  shadowMap: number
  /** Мягкий край тени (PCFSoft) — дороже на каждом пикселе, только на компьютере */
  softShadows: boolean
  /** Свечение (bloom) поверх кадра: отдельный проход на весь экран — только компьютер */
  bloom: boolean
  /** SSAO не включаем нигде: второй проход сцены с подменой материала ломает толпу (поза людей считается в их шейдере)
      и удваивает работу; объём дают тени и пятна под ногами */
  ssao: false
}

/** Свет и пост-эффекты по силе устройства (те же признаки, что у толпы) */
export function renderBudget(h: DeviceHints): RenderBudget {
  const c = deviceClass(h)
  if (c === 'weak') return { shadowMap: 0, softShadows: false, bloom: false, ssao: false }
  if (c === 'phone') return { shadowMap: 1024, softShadows: false, bloom: false, ssao: false }
  return { shadowMap: 2048, softShadows: true, bloom: true, ssao: false }
}

/** Уровень по квадрату расстояния до камеры */
export function tierOf(d2: number): number {
  let t = 0
  while (t < TIER_DIST.length - 1 && d2 >= TIER_DIST[t] * TIER_DIST[t]) t++
  return t
}
