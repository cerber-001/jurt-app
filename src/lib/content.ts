/* Контент гида — JSON-блоки с устойчивыми id (public/content/*.json, перенесены из v2 скриптом tools/extract_v2.py).
   Каждый блок адресуем по id — это основа будущего «конструктора»: пользователь собирает свой гид из блоков.
   Языки: русский — content/<имя>.json; казахский и английский — content/<kk|en>/<имя>.json с той же схемой и теми же id.
   Нет перевода (404, сеть, не JSON) — по каждому файлу отдельно берём русский. */
import { effect, signal } from '@preact/signals'
import { lang, type Lang } from './store'
import { t } from './i18n'

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

/** Один JSON-файл. Dev-сервер на отсутствующий файл отдаёт index.html с кодом 200 — r.json() тогда бросит ошибку */
async function j<T>(path: string): Promise<T> {
  const r = await fetch(BASE + path)
  if (!r.ok) throw new Error(path + ': ' + r.status)
  return (await r.json()) as T
}

/** Файл контента на языке и язык, на котором он реально пришёл */
export interface Localized<T> { data: T; lang: Lang }

const files = new Map<string, Promise<Localized<unknown>>>()

async function fetchLocalizedOnce<T>(name: string, l: Lang): Promise<Localized<T>> {
  if (l !== 'ru') {
    try { return { data: await j<T>(l + '/' + name), lang: l } }
    catch { /* перевода этого файла пока нет — ниже русский; сбой русского уже не глотаем */ }
  }
  return { data: await j<T>(name), lang: 'ru' }
}

/** Файл контента на языке l с запасным русским. Удачные ответы кэшируются, неудачные — нет (повторим при следующем вызове) */
export function fetchLocalized<T>(name: string, l: Lang): Promise<Localized<T>> {
  const k = l + '/' + name
  const hit = files.get(k)
  if (hit) return hit as Promise<Localized<T>>
  const p = fetchLocalizedOnce<T>(name, l)
  files.set(k, p)
  p.catch(() => files.delete(k))
  return p
}

const take = <T,>(name: string, l: Lang) => fetchLocalized<T>(name, l).then(x => x.data)

async function fetchAll(l: Lang): Promise<Content> {
  const [steps, info, dua, zikr, modes] = await Promise.all([
    take<Step[]>('steps.json', l), take<Info[]>('info.json', l), take<Dua[]>('dua.json', l),
    take<Zikr[]>('zikr.json', l), take<Modes>('modes.json', l),
  ])
  return { steps, info, dua, zikr, modes }
}

const ready = new Map<Lang, Content>()
let started = false

/** Контент на текущем языке. Пока грузится новый язык, на экране остаётся прежний; устаревший ответ не перезаписывает свежий */
export async function loadContent() {
  started = true
  const l = lang.value
  try {
    const c = ready.get(l) ?? await fetchAll(l)
    ready.set(l, c)
    if (lang.value === l) { content.value = c; contentError.value = '' }
  } catch (e) {
    if (lang.value === l) contentError.value = t('err.content') + ': ' + (e as Error).message
  }
  return content.value
}

/* Смена языка — перезагрузить контент, если его уже показывали */
effect(() => { void lang.value; if (started) void loadContent() })

/** Спрайт иконок v2 — вставляется в документ один раз, дальше <use href="#b-ihram"/> */
let spriteLoaded = false
export async function loadIcons() {
  if (spriteLoaded || typeof document === 'undefined') return
  spriteLoaded = true
  try {
    const r = await fetch(BASE + 'icons.svg')
    if (!r.ok) throw new Error('icons.svg: ' + r.status)
    const div = document.createElement('div')
    div.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden'
    div.setAttribute('aria-hidden', 'true')
    div.innerHTML = await r.text()
    document.body.prepend(div)
  } catch { spriteLoaded = false /* попробуем при следующем значке */ }
}
