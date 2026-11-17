import type { ComponentChildren, RefObject } from 'preact'
import { apiMode } from '../lib/api'
import { useEffect, useRef } from 'preact/hooks'
import { hydrateCounters } from '../lib/counters'
import { loadIcons } from '../lib/content'
import { LANGS, t } from '../lib/i18n'
import { lang } from '../lib/store'

export function Icon({ id, size = 22 }: { id: string; size?: number }) {
  useEffect(() => { loadIcons() }, [])
  return <svg width={size} height={size} aria-hidden="true"><use href={'#' + id} /></svg>
}

/* Простые линейные значки там, где в общем наборе icons.svg пары пока нет (чат, телефон, метка, список).
   Временные: в чистовой версии — из конвейера иконок JURT. */
const GLYPHS = {
  chat: 'M4 5h16v11H9l-5 4z',
  phone: 'M6.5 3h3l1.5 4.5-2 1.5a12 12 0 0 0 6 6l1.5-2 4.5 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5a2 2 0 0 1 2-2z',
  pin: 'M12 21s7-6.1 7-11.5a7 7 0 1 0-14 0C5 14.9 12 21 12 21zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
} as const
export type GlyphId = keyof typeof GLYPHS

export function Glyph({ id, size = 24 }: { id: GlyphId; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={GLYPHS[id]} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  )
}

/** Название длиннее — в шапке набираем мельче и в две строки */
const LONG_TITLE = 22

export function Top({ title, sub, role, inert }: { title: string; sub?: string; role: string; inert?: boolean }) {
  return (
    <header class="top" inert={inert}>
      <a href="/" class="logo-a" aria-label={'JURT, ' + t('c.home')}><img class="logo" src="/logo-white.svg" alt="" /></a>
      {/* подзапись есть всегда (пустая — неразрывный пробел, чтецу скрыта): название группы и код приходят из сети
          позже, и шапка не должна менять высоту (CLS). Высоту блока держит и CSS (.top .ttl в v1.css) */}
      <div class={'ttl' + (title.length > LONG_TITLE ? ' long' : '')}><b>{title}</b><small aria-hidden={sub ? undefined : 'true'}>{sub || '\u00a0'}</small></div>
      <span class="role">{role}</span>
      {apiMode.value === 'v3' && <span class="role" title="Данные из Supabase (этап 2); без ?api=v3 — из таблицы Main_v2">v3</span>}
      <LangSwitch />
    </header>
  )
}

export function LangSwitch() {
  return (
    <nav class="lang" aria-label={t('c.lang')}>
      {LANGS.map(([k, label]) => (
        <button key={k} lang={k} class={lang.value === k ? 'on' : ''} aria-pressed={lang.value === k} onClick={() => (lang.value = k)}>{label}</button>
      ))}
    </nav>
  )
}

export function Card({ children, cls = '', lang: l }: { children: ComponentChildren; cls?: string; lang?: string }) {
  return <section class={'card ' + cls} lang={l}>{children}</section>
}

/** Куда ведёт старая кнопка «на „Главной“» из текстов шагов (время намаза и кибла) */
const PRAYER_ROUTE = 'more/prayer'

/** Оживление HTML из контента: арабский — с языком и направлением; кнопка-ссылка на намаз — рабочая */
function hydrateHtml(root: HTMLElement | null) {
  if (!root) return
  root.querySelectorAll<HTMLElement>('.ar').forEach(el => { el.lang = 'ar'; el.dir = 'rtl' })
  root.querySelectorAll<HTMLButtonElement>('button.linkbtn[data-go]').forEach(b => {
    b.textContent = t('step.prayerlink')
    if (b.dataset.h) return
    b.dataset.h = '1'
    // pilgrim.tsx слушает jurt:tab и переходит; «Рядом» закрывается по тому же событию (nearby.tsx)
    b.addEventListener('click', () => dispatchEvent(new CustomEvent('jurt:tab', { detail: PRAYER_ROUTE })))
  })
}

export function Html({ html, cls }: { html: string; cls?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { hydrateHtml(ref.current); hydrateCounters(ref.current) }, [html, lang.value])
  return <div ref={ref} class={cls} dangerouslySetInnerHTML={{ __html: html }} />
}

export function Tabs<T extends string>({ items, cur, set }: { items: [T, string][]; cur: T; set: (t: T) => void }) {
  return (
    <nav class="tabs" role="tablist">
      {items.map(([k, label]) => (
        <button key={k} role="tab" class={cur === k ? 'on' : ''} aria-selected={cur === k} onClick={() => set(k)}>{label}</button>
      ))}
    </nav>
  )
}

export function Foot() {
  return (
    <p class="foot">
      JURT · <a href="/ustaz">устазу</a> · <a href="/admin">штаб</a>
    </p>
  )
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,summary,[tabindex]:not([tabindex="-1"])'

/** Элемент с фокусом сейчас, если он не body: куда вернуть фокус после окна */
function focusedNow(): HTMLElement | null {
  const a = typeof document === 'undefined' ? null : document.activeElement
  return a instanceof HTMLElement && a !== document.body ? a : null
}

/** Окно закрылось: фокус — туда, откуда открыли; если того элемента уже нет (или он недоступен) — в начало
    содержимого <main> (как при смене раздела в pilgrim.tsx), а не в никуда (body) */
function restoreFocus(back: HTMLElement | null) {
  if (back?.isConnected && !back.closest('[inert]')) { back.focus(); if (document.activeElement === back) return }
  const main = document.querySelector<HTMLElement>('main')
  if (!main || main.closest('[inert]')) return
  if (!main.hasAttribute('tabindex')) main.tabIndex = -1
  main.focus({ preventScroll: true })
}

/** Окно поверх экрана (role="dialog"): фокус внутрь при открытии, Tab не уходит наружу, Escape закрывает,
    после закрытия фокус возвращается туда, откуда открыли. Контейнеру нужен tabIndex={-1}.
    Откуда открыли — запоминаем ещё при отрисовке: к моменту эффекта <main>, шапка и меню уже inert
    (pilgrim.tsx), и браузер мог увести фокус в body.
    Системная «Назад» (Android) закрывает окно: при открытии кладём запись в историю, по popstate — onClose.
    Закрыли кнопкой — запись снимаем history.back(), но только если адрес не менялся (переход из окна,
    например «Я потерялся» → карта, уже заменил адрес — его не откатываем). */
export function useDialog(ref: RefObject<HTMLElement>, open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const opener = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current) opener.current = focusedNow()
  wasOpen.current = open
  useEffect(() => {
    if (!open) return
    const back = opener.current ?? focusedNow()
    ref.current?.focus()
    const href = location.href
    history.pushState({ jurtOverlay: 1 }, '')
    let popped = false
    const onPop = () => { popped = true; closeRef.current() }
    addEventListener('popstate', onPop)
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeRef.current(); return }
      const el = ref.current
      if (e.key !== 'Tab' || !el) return
      const f = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(x => x.offsetParent !== null)
      if (!f.length) return
      const first = f[0], last = f[f.length - 1], cur = document.activeElement
      if (e.shiftKey && (cur === first || cur === el)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (cur === last || !el.contains(cur))) { e.preventDefault(); first.focus() }
    }
    addEventListener('keydown', key)
    return () => {
      removeEventListener('keydown', key)
      removeEventListener('popstate', onPop)   // снять ДО back(), иначе он вызовет onClose повторно
      if (!popped && (history.state as { jurtOverlay?: number } | null)?.jurtOverlay && location.href === href) history.back()
      restoreFocus(back)
    }
  }, [open])
}
