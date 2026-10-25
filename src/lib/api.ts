/* Клиент API гида. Запросы байт в байт как у v2 (umra.jurt.kz): один и тот же контракт отдают
   два сервера — Apps Script (данные в Main_v2) и Edge Function `api` в Supabase (этап 2).
   Какой из них спрашивать, решает apiMode: ?api=v3 в адресе или выбор в штабе; запоминается на устройстве. */
import { signal } from '@preact/signals'
import type { AdminState, ApiError, AppData, Group } from './types'

export type ApiMode = 'v2' | 'v3'
const URLS: Record<ApiMode, string> = {
  v2: import.meta.env.VITE_API_URL as string,                 // Apps Script → Main_v2
  v3: (import.meta.env.VITE_API_V3_URL as string) || '',      // Supabase Edge Function `api`
}
const MODE_LS = 'jurt.api'
function savedMode(): ApiMode { try { return localStorage.getItem(MODE_LS) === 'v3' ? 'v3' : 'v2' } catch { return 'v2' } }
export const apiMode = signal<ApiMode>(savedMode())
export function setApiMode(m: string) {
  const v: ApiMode = m === 'v3' && URLS.v3 ? 'v3' : 'v2'
  apiMode.value = v
  try { v === 'v3' ? localStorage.setItem(MODE_LS, v) : localStorage.removeItem(MODE_LS) } catch { /* приватный режим */ }
}
/** Адрес API для текущего режима */
export const API = () => URLS[apiMode.value] || URLS.v2
const CODE_RE = /^[a-z0-9]{6,12}$/

export class ApiFail extends Error {}

function url(params: Record<string, string | undefined>) {
  const q = new URLSearchParams()
  q.set('t', String(Date.now()))                       // как v2: обход кэша браузера
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const a = API()
  return a + (a.includes('?') ? '&' : '?') + q.toString()
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
  const r = await fetch(API(), { method: 'POST', body: JSON.stringify(body) })
  const d = (await r.json()) as T & { ok: boolean; error?: string }
  if (!d.ok) throw new ApiFail(d.error || 'Сервер ответил ошибкой')
  return d
}

/** Голос паломника — единственная запись без ключа */
export function vote(p: string, id: string, v: number) {
  return post<{ ok: true; polls: AppData['polls'] }>({ a: 'vote', p, id, v })
}

/* ---- штаб организатора: всё с ключом ADMIN_KEY (вводится на устройстве, хранится локально) ---- */
/* Оба сервера отдают в state поле g как код группы (строкой, как у v2); клиенту нужна карточка группы */
function normState(d: AdminState): AdminState {
  const raw = d.g as unknown
  if (typeof raw === 'string') d.g = d.groups?.find(x => x.code === raw) || ({ code: raw, name: raw, dep: '', ret: '', medina: '', mecca: '', flights: '' } as Group)
  return d
}
const state = (body: object) => post<AdminState>(body).then(normState)
export const admin = {
  state: (k: string, g: string) => state({ a: 'state', k, g }),
  announce: (k: string, g: string, text: string) => state({ a: 'ann', k, g, text }),
  rooms: (k: string, g: string, rows: { id: string; medina: string; mecca: string }[]) =>
    state({ a: 'rooms', k, g, rows }),
  poll: (k: string, g: string, p: { q: string; opts: string[]; ends: number; quorum: number; after: boolean }) =>
    state({ a: 'poll', k, g, ...p }),
  pollSet: (k: string, g: string, id: string, status: 'идёт' | 'закрыт' | 'скрыт', ends?: number) =>
    state({ a: 'pollSet', k, g, id, status, ends }),
  /** Карточка группы: поля, которых нет в data, сервер оставляет как были; isNew — новая строка в «Группах» */
  group: (k: string, g: string, data: Partial<Group> & { code?: string }, isNew = false) =>
    state({ a: 'group', k, g, data, isNew }),
}
