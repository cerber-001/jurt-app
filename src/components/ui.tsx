import type { ComponentChildren } from 'preact'
import { apiMode } from '../lib/api'
import { useEffect } from 'preact/hooks'
import { loadIcons } from '../lib/content'
import { LANGS, t } from '../lib/i18n'
import { lang } from '../lib/store'

export function Icon({ id, size = 22 }: { id: string; size?: number }) {
  useEffect(() => { loadIcons() }, [])
  return <svg width={size} height={size} aria-hidden="true"><use href={'#' + id} /></svg>
}

export function Top({ title, sub, role }: { title: string; sub?: string; role: string }) {
  return (
    <header class="top">
      <a href="/" aria-label="На главную"><img class="logo" src="/logo-white.svg" alt="JURT" /></a>
      <div class="ttl"><b>{title}</b>{sub && <small>{sub}</small>}</div>
      <span class="role">{role}</span>
      {apiMode.value === 'v3' && <span class="role" title="Данные из Supabase (этап 2); без ?api=v3 — из таблицы Main_v2">v3</span>}
      <LangSwitch />
    </header>
  )
}

export function LangSwitch() {
  return (
    <nav class="lang" aria-label={t('c.lang')}>
      {LANGS.map(([k, label]) => <button key={k} class={lang.value === k ? 'on' : ''} onClick={() => (lang.value = k)}>{label}</button>)}
    </nav>
  )
}

export function Card({ children, cls = '' }: { children: ComponentChildren; cls?: string }) {
  return <section class={'card ' + cls}>{children}</section>
}

export function Html({ html, cls }: { html: string; cls?: string }) {
  return <div class={cls} dangerouslySetInnerHTML={{ __html: html }} />
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
      JURT · платформа паломника, демо v3 · <a href="https://umra.jurt.kz/" target="_blank" rel="noopener">гид v2</a>
      <a href="/">роли</a>
    </p>
  )
}
