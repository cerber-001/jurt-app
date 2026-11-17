/* Экран паломника — гид 1.0: нижнее меню из 4 пунктов: Сейчас · Путь · Группа · Ещё.
   «Программа» открывается из «Сейчас» и из «Ещё»; дуа, зикр, намаз, карта, сборы — в «Ещё».
   Адреса: #now #path #group #more #more/<раздел> #program. Старые адреса (#today, #umra, #dua…) ведут в новые места.
   1.1: смена раздела — плавный переход View Transitions (lib/transition.ts); без поддержки или при «Уменьшить движение» — сразу. */
import { useEffect, useRef, useState } from 'preact/hooks'
import { useSignal } from '@preact/signals'
import { Announcement, GroupCard, MeCard, Points, Polls } from '../components/group'
import { Lost, lostOpen } from '../components/lost'
import { Nearby, nearby } from '../components/nearby'
import { More, Now, ProgramNow } from '../components/now'
import { Path } from '../components/path'
import { Finale, finale } from '../components/finale'
import { Reader, reading } from '../components/reader'
import { Card, Top } from '../components/ui'
import { t } from '../lib/i18n'
import { runTransition, tabKind } from '../lib/transition'
import { code, data, error, groupCode, lang, loading, readUrlCodes, refresh } from '../lib/store'
import { watchNotes } from '../lib/notes'
import { isGroupCode } from '../lib/codes'

const NAV = ['now', 'path', 'group', 'more'] as const
const PAGES: readonly string[] = [...NAV, 'program']
const OLD: Record<string, string> = {
  today: 'more/prayer', umra: 'path', 'more/umra': 'path', dua: 'more/dua', zikr: 'more/zikr', where: 'more/where',
}

function norm(h: string): string {
  h = h.replace(/^#/, '')
  if (OLD[h]) return OLD[h]
  const [a, b] = h.split('/')
  if (!PAGES.includes(a)) return 'now'
  return a === 'more' && b ? 'more/' + b : a
}

/** Порядок раздела для направления перехода: по нижнему меню слева направо; подраздел и «Программа» — на шаг глубже */
function rank(r: string): number {
  const [a, b] = r.split('/')
  if (a === 'program') return 1
  return NAV.indexOf(a as typeof NAV[number]) * 10 + (b ? 1 : 0)
}

function setHash(r: string) {
  const url = location.pathname + location.search + '#' + r
  if (location.pathname + location.search + location.hash !== url) history.replaceState(null, '', url)
}

export function Pilgrim() {
  const route = useSignal(norm(location.hash))
  const mainRef = useRef<HTMLElement>(null)
  const firstRoute = useRef(true)
  // адрес меняем сразу, а не в эффекте и не внутри перехода: useDialog при закрытии окна сверяет адрес
  // и не откатывает переход. Сам экран меняется внутри плавного перехода (если он есть)
  const go = (h: string) => {
    const r = norm(h)
    setHash(r)
    const show = () => { route.value = r; scrollTo(0, 0) }
    if (r === route.value) show()
    else runTransition(show, tabKind(rank(route.value), rank(r)))
  }
  useEffect(() => {
    readUrlCodes(); refresh()
    const onTab = (e: Event) => go((e as CustomEvent<string>).detail)
    const onHash = () => { route.value = norm(location.hash) }
    addEventListener('jurt:tab', onTab); addEventListener('hashchange', onHash)
    return () => { removeEventListener('jurt:tab', onTab); removeEventListener('hashchange', onHash) }
  }, [])
  useEffect(() => watchNotes(groupCode.value), [groupCode.value])
  useEffect(() => {
    setHash(route.value)
    // смена раздела: фокус в начало содержимого (кроме первого открытия)
    if (firstRoute.current) { firstRoute.current = false; return }
    mainRef.current?.focus({ preventScroll: true })
  }, [route.value])
  const overlay = !!nearby.value || lostOpen.value || finale.value || !!reading.value
  const d = data.value
  void lang.value  // перерисовка при смене языка
  const [main, sub = ''] = route.value.split('/')

  return (
    <>
      <Top title={d?.group?.name || t('app.guide')} sub={d?.me ? d.me.name : d?.group?.code || t('app.entercode')} role={t('role.pilgrim')} inert={overlay} />
      <main class="wrap core" ref={mainRef} tabIndex={-1} inert={overlay}>
        {main === 'now' && <Now go={go} />}
        {main === 'path' && <Path />}
        {main === 'program' && <><h1 class="sr-only">{t('nav.program')}</h1><button class="btn ghost sm back" onClick={() => go('now')}><span aria-hidden="true">←</span> {t('nav.now')}</button><ProgramNow /></>}
        {main === 'group' && <GroupTab />}
        {main === 'more' && <More sub={sub} go={go} />}
        {lang.value !== 'ru' && <p class="muted"><small>{t('c.check')}</small></p>}
      </main>
      <BottomNav cur={main === 'program' ? 'now' : main} go={go} inert={overlay} />
      <Nearby />
      <Lost go={go} />
      <Reader />
      <Finale />
    </>
  )
}

function GroupTab() {
  const d = data.value
  const [input, setInput] = useState('')
  function enter(e: Event) {
    e.preventDefault()
    const v = input.trim()
    if (isGroupCode(v)) { groupCode.value = v.toUpperCase(); code.value = '' } else code.value = v.toLowerCase()
    refresh()
  }
  return (
    <>
      <h1 class="sr-only">{t('nav.group')}</h1>
      {error.value && <p class="err" role="alert">{error.value}</p>}
      {!d && !loading.value && (
        <Card>
          <h2 id="code-h">{t('c.yourcode')}</h2>
          <p class="muted" id="code-hint">{t('c.codehint')}</p>
          <form onSubmit={enter}><input aria-labelledby="code-h" aria-describedby="code-hint" value={input} onInput={e => setInput((e.target as HTMLInputElement).value)} placeholder={t('c.codeph')} /><div class="btns"><button class="btn" type="submit">{t('c.open')}</button></div></form>
        </Card>
      )}
      {!d && loading.value && <Card><div class="sk" /></Card>}
      {d && <>
        <Announcement d={d} />
        <button class="btn lost" onClick={() => { lostOpen.value = true }}>{t('lost.btn')}</button>
        <MeCard d={d} />
        <GroupCard d={d} personal={!!d.me} />
        <Points d={d} />
        <Polls d={d} canVote={!!d.me} />
        {!d.me && <Card cls="sand"><p>{t('c.common')}</p></Card>}
        <div class="btns"><button class="btn ghost sm" onClick={() => refresh()} disabled={loading.value}>{t('c.refresh')}</button>
          <button class="btn ghost sm" onClick={() => { code.value = ''; groupCode.value = ''; data.value = null }}>{t('c.other')}</button></div>
      </>}
    </>
  )
}

const NAV_ICO: Record<string, string> = {
  now: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3.5 2',
  path: 'M6 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 18h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7',
  group: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6m1-9a3 3 0 1 0 0-6m2 15c0-2.6-1.3-4.8-3.2-5.6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
}

function BottomNav({ cur, go, inert }: { cur: string; go: (h: string) => void; inert?: boolean }) {
  return (
    <nav class="bnav" aria-label={t('nav.menu')} inert={inert}>
      {NAV.map(k => (
        <button key={k} class={cur === k ? 'on' : ''} aria-current={cur === k ? 'page' : undefined} onClick={() => go(k)}>
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d={NAV_ICO[k]} fill="none" stroke="currentColor" stroke-width={k === 'more' ? 3.2 : 1.9} stroke-linecap="round" stroke-linejoin="round" /></svg>
          <span>{t('nav.' + k)}</span>
        </button>
      ))}
    </nav>
  )
}
