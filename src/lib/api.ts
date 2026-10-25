/* Клиент Apps Script. Запросы байт в байт как у v2 (umra.jurt.kz), поэтому обе версии
   читают и пишут одни и те же данные: сервер один. Фаза 1 архитектуры v3. */
import type { AdminState, ApiError, AppData, Group } from './types'

export const API = import.meta.env.VITE_API_URL as string
const CODE_RE = /^[a-z0-9]{6,12}$/

export class ApiFail extends Error {}

function url(params: Record<string, string | undefined>) {
  const q = new URLSearchParams()
  q.set('t', String(Date.now()))                       // как v2: обход кэша браузера
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  return API + (API.includes('?') ? '&' : '?') + q.toString()
}

/** Данные для гида: p — личный код, g — код группы (без p сервер не отдаёт личное) */
export async function fetchApp(opts: { p?: string; g?: string }): Promise<AppData> {
  const p = opts.p?.trim().toLowerCase()
  if (p && !CODE_RE.test(p)) throw new ApiFail('Личный код неверного вида')
  const r = await fetch(url({ p, g: opts.g?.trim().toUpperCase() }))
  const d = (await r.json()) as AppData | ApiError
  if (!d.ok) throw new ApiFail(d.error || 'Сервер ответил ошибкой')
  return d
}

/* POST как text/plain — без preflight, Apps Script иначе не принимает */
async function post<T>(body: object): Promise<T> {
  const r = await fetch(API, { method: 'POST', body: JSON.stringify(body) })
  const d = (await r.json()) as T & { ok: boolean; error?: string }
  if (!d.ok) throw new ApiFail(d.error || 'Сервер ответил ошибкой')
  return d
}

/** Голос паломника — единственная запись без ключа */
export function vote(p: string, id: string, v: number) {
  return post<{ ok: true; polls: AppData['polls'] }>({ a: 'vote', p, id, v })
}

/* ---- штаб организатора: всё с ключом ADMIN_KEY (вводится на устройстве, хранится локально) ---- */
export const admin = {
  state: (k: string, g: string) => post<AdminState>({ a: 'state', k, g }),
  announce: (k: string, g: string, text: string) => post<AdminState>({ a: 'ann', k, g, text }),
  rooms: (k: string, g: string, rows: { id: string; medina: string; mecca: string }[]) =>
    post<AdminState>({ a: 'rooms', k, g, rows }),
  poll: (k: string, g: string, p: { q: string; opts: string[]; ends: number; quorum: number; after: boolean }) =>
    post<AdminState>({ a: 'poll', k, g, ...p }),
  pollSet: (k: string, g: string, id: string, status: 'идёт' | 'закрыт' | 'скрыт', ends?: number) =>
    post<AdminState>({ a: 'pollSet', k, g, id, status, ends }),
  /** Карточка группы: поля, которых нет в data, сервер оставляет как были; isNew — новая строка в «Группах» */
  group: (k: string, g: string, data: Partial<Group> & { code?: string }, isNew = false) =>
    post<AdminState>({ a: 'group', k, g, data, isNew }),
}
