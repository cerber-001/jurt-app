/* Тасбих экрана «Сегодня»: три фразы по 33 раза, по кругу. Без очков, итогов, рекордов и истории:
   на экране — только счёт внутри текущей фразы. Счёт живёт в памяти (tasbihCount / setTasbihCount);
   на телефоне хранится одно число и дата — только чтобы случайная перезагрузка не обнулила счёт.
   Хранилище закрыто или переполнено — счёт всё равно идёт (в памяти). На следующий день — с нуля. */
import { ls } from './store'

export const TASBIH_KEY = 'jurt.today.tasbih'
export const BLOCK = 33
export const PHRASES = 3

export interface TasbihView {
  /** счёт внутри текущей фразы: 0…33 */
  count: number
  /** номер фразы на экране: 0…2 */
  phrase: number
  /** какая фраза будет следующей */
  next: number
}

/** n — касаний за сегодня. На 33-м касании фраза ещё на экране (33), с 34-го — следующая с 1 */
export function tasbihView(n: number): TasbihView {
  if (n <= 0) return { count: 0, phrase: 0, next: 1 }
  const phrase = Math.floor((n - 1) / BLOCK) % PHRASES
  return { count: ((n - 1) % BLOCK) + 1, phrase, next: (phrase + 1) % PHRASES }
}

export function readTasbih(iso: string): number {
  try {
    const o = JSON.parse(ls.get(TASBIH_KEY) || 'null') as { d?: unknown; n?: unknown } | null
    const n = Number(o?.n)
    return o?.d === iso && Number.isInteger(n) && n > 0 ? n : 0
  } catch { return 0 /* испорченная запись — начинаем с нуля */ }
}

export function writeTasbih(iso: string, n: number): void {
  ls.set(TASBIH_KEY, n > 0 ? JSON.stringify({ d: iso, n }) : '')
}

/* Счёт в памяти: источник правды на экране. Хранилище читается только при запуске и при смене дня */
let mem: { d: string; n: number } | null = null

/** Счёт за день iso: из памяти; новый день или первый запуск — восстановить из хранилища */
export function tasbihCount(iso: string): number {
  if (!mem || mem.d !== iso) mem = { d: iso, n: readTasbih(iso) }
  return mem.n
}

/** Новый счёт: сразу в память, затем (если получится) в хранилище */
export function setTasbihCount(iso: string, n: number): void {
  const v = Number.isInteger(n) && n > 0 ? n : 0
  mem = { d: iso, n: v }
  writeTasbih(iso, v)
}

/** Забыть счёт в памяти — как при новом запуске приложения (для тестов) */
export function forgetTasbih(): void { mem = null }
