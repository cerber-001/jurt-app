/* Контент гида — JSON-блоки с устойчивыми id (public/content/*.json, перенесены из v2 скриптом tools/extract_v2.py).
   Каждый блок адресуем по id — это основа будущего «конструктора»: пользователь собирает свой гид из блоков. */
import { signal } from '@preact/signals'

export interface DuaItem { label?: string; ar?: string; tr?: string; ru?: string; src?: string }
export interface Step {
  id: string; num: number; icon: string
  kicker: { first?: string; mecca?: string } | null
  title: string; tags: { kind: string; text: string }[]
  lead: string; dua: DuaItem[]; html: string
}
export interface Info { id: string; icon: string; kicker: string | null; title: string; html: string }
export interface Dua { id: string; icon: string; title: string; preview: string; items: DuaItem[]; html: string }
export interface Zikr {
  id: string; n: Record<string, string>; goal?: number; fix?: boolean
  ph?: { ar: string; tr: string; ru: string; kk?: string; en?: string }[]; h?: string; src?: string
  [k: string]: unknown
}
export interface Modes {
  kinds: { id: 'first' | 'again' | 'mecca'; title: string; hint: string }[]
  details: { id: string; title: string; html: string }[]
}
export interface Content { steps: Step[]; info: Info[]; dua: Dua[]; zikr: Zikr[]; modes: Modes }

export const content = signal<Content | null>(null)
export const contentError = signal('')

const BASE = import.meta.env.BASE_URL + 'content/'
async function j<T>(name: string): Promise<T> {
  const r = await fetch(BASE + name)
  if (!r.ok) throw new Error(name + ': ' + r.status)
  return r.json() as Promise<T>
}

export async function loadContent() {
  if (content.value) return content.value
  try {
    const [steps, info, dua, zikr, modes] = await Promise.all([
      j<Step[]>('steps.json'), j<Info[]>('info.json'), j<Dua[]>('dua.json'), j<Zikr[]>('zikr.json'), j<Modes>('modes.json'),
    ])
    content.value = { steps, info, dua, zikr, modes }
  } catch (e) {
    contentError.value = 'Контент гида не загрузился: ' + (e as Error).message
  }
  return content.value
}

/** Спрайт иконок v2 — вставляется в документ один раз, дальше <use href="#b-ihram"/> */
let spriteLoaded = false
export async function loadIcons() {
  if (spriteLoaded || typeof document === 'undefined') return
  spriteLoaded = true
  try {
    const r = await fetch(BASE + 'icons.svg')
    const div = document.createElement('div')
    div.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
    div.setAttribute('aria-hidden', 'true')
    div.innerHTML = await r.text()
    document.body.prepend(div)
  } catch { spriteLoaded = false }
}
