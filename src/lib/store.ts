/* Состояние приложения на сигналах. Личный код и ключ штаба — только в localStorage устройства. */
import { signal, computed, effect } from '@preact/signals'
import { fetchApp, ApiFail, setApiMode } from './api'
import type { AppData } from './types'

const LS = {
  code: 'jurt.code', group: 'jurt.group', key: 'jurt.adminKey', lang: 'jurt.lang', data: 'jurt.data',
  done: 'jurt.done', theme: 'jurt.theme', v3: 'jurt.v3Key', city: 'jurt.city',
}
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k) || '' } catch { return '' } },
  set: (k: string, v: string) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k) } catch { /* приватный режим */ } },
}

export type Lang = 'ru' | 'kk' | 'en'
export const lang = signal<Lang>((ls.get(LS.lang) as Lang) || 'ru')
export const code = signal(ls.get(LS.code))          // личный код паломника (?p=)
export const groupCode = signal(ls.get(LS.group))    // код группы (?g=)
export const adminKey = signal(ls.get(LS.key))       // ключ штаба Apps Script — вводится вручную организатором
export const v3Key = signal(ls.get(LS.v3))           // ключ v3 (Supabase): роль admin или ustaz, см. v3.ts
export const cityId = signal(ls.get(LS.city))        // город для намаза/погоды, выбранный вручную ('' = по программе)
export const data = signal<AppData | null>(parse(ls.get(LS.data)))
export const loading = signal(false)
export const error = signal('')
export const done = signal<Record<string, boolean>>(parse(ls.get(LS.done)) || {})  // отметки шагов умры

function parse<T>(s: string): T | null { try { return s ? (JSON.parse(s) as T) : null } catch { return null } }

effect(() => ls.set(LS.lang, lang.value))
effect(() => ls.set(LS.code, code.value))
effect(() => ls.set(LS.group, groupCode.value))
effect(() => ls.set(LS.key, adminKey.value))
effect(() => ls.set(LS.v3, v3Key.value))
effect(() => ls.set(LS.city, cityId.value))
effect(() => ls.set(LS.done, JSON.stringify(done.value)))
effect(() => { if (data.value) ls.set(LS.data, JSON.stringify(data.value)) })

export const me = computed(() => data.value?.me ?? null)
export const group = computed(() => data.value?.group ?? null)

/** Коды из адреса (?p=…, ?g=…) — как у v2, личная ссылка та же самая; ?api=v3|v2 — какой сервер спрашивать */
export function readUrlCodes() {
  const q = new URLSearchParams(location.search)
  const p = q.get('p'), g = q.get('g'), a = q.get('api')
  if (p) code.value = p.trim().toLowerCase()
  if (g) groupCode.value = g.trim().toUpperCase()
  if (a) setApiMode(a.trim().toLowerCase())
}

export async function refresh() {
  loading.value = true; error.value = ''
  try {
    data.value = await fetchApp({ p: code.value || undefined, g: groupCode.value || undefined })
    if (data.value.group?.code) groupCode.value = data.value.group.code
  } catch (e) {
    error.value = e instanceof ApiFail ? e.message : 'Нет связи. Показаны сохранённые данные.'
    if (e instanceof ApiFail && /код|ссылка/i.test(e.message)) code.value = ''
  } finally {
    loading.value = false
  }
}

export function toggleDone(id: string) { done.value = { ...done.value, [id]: !done.value[id] } }
