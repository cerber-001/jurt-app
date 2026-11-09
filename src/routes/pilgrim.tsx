/* Экран паломника — ядро «как iPhone» (аудит 09.11.2026):
   нижнее меню из 4 пунктов: Сейчас · Программа · Группа · Ещё. Всё прочее (шаги, дуа, зикр, намаз, карта) — в «Ещё».
   Адреса: #now #program #group #more #more/<раздел>. Старые адреса (#today, #umra, #dua…) ведут в новые места. */
import { useEffect, useState } from 'preact/hooks'
import { useSignal } from '@preact/signals'
import { Announcement, GroupCard, MeCard, Points, Polls } from '../components/group'
import { More, Nearby, Now, ProgramNow } from '../components/now'
import { Card, Foot, Top } from '../components/ui'
import { t } from '../lib/i18n'
import { code, data, error, groupCode, lang, loading, readUrlCodes, refresh } from '../lib/store'
import { watchNotes } from '../lib/notes'

const MAIN = ['now', 'program', 'group', 'more'] as const
const OLD: Record<string, string> = { today: 'more/prayer', umra: 'more/umra', dua: 'more/dua', zikr: 'more/zikr', where: 'more/where' }

function norm(h: string): string {
  h = h.replace(/^#/, '')
  if (OLD[h]) return OLD[h]
  const [a, b] = h.split('/')
  if (!(MAIN as readonly string[]).includes(a)) return 'now'
  return a === 'more' && b ? 'more/' + b : a
}

export function Pilgrim() {
  const route = useSignal(norm(location.hash))
  const go = (h: string) => { route.value = norm(h); scrollTo(0, 0) }
  useEffect(() => {
    readUrlCodes(); refresh()
    const onTab = (e: Event) => go((e as CustomEvent<string>).detail)
    const onHash = () => { route.value = norm(location.hash) }
    addEventListener('jurt:tab', onTab); addEventListener('hashchange', onHash)
    return () => { removeEventListener('jurt:tab', onTab); removeEventListener('hashchange', onHash) }
  }, [])
  useEffect(() => watchNotes(groupCode.value), [groupCode.value])
  useEffect(() => { history.replaceState(null, '', location.pathname + location.search + '#' + route.value) }, [route.value])
  const d = data.value
  void lang.value  // перерисовка при смене языка
  const [main, sub = ''] = route.value.split('/')

  return (
    <>
      <Top title={d?.group?.name || t('app.guide')} sub={d?.me ? d.me.name : d?.group?.code || t('app.entercode')} role={t('role.pilgrim')} />
      <main class="wrap core">
        {main === 'now' && <Now go={go} />}
        {main === 'program' && <ProgramNow />}
        {main === 'group' && <GroupTab go={go} />}
        {main === 'more' && <More sub={sub} go={go} />}
        {lang.value !== 'ru' && <p class="muted"><small>{t('c.check')}</small></p>}
        <Foot />
      </main>
      <BottomNav cur={main} go={go} />
      <Nearby />
    </>
  )
}

function GroupTab({ go }: { go: (h: string) => void }) {
  const d = data.value
  const [input, setInput] = useState('')
  function enter(e: Event) {
    e.preventDefault()
    const v = input.trim()
    if (/^[A-Za-z]+-\d{3,5}$/.test(v)) { groupCode.value = v.toUpperCase(); code.value = '' } else code.value = v.toLowerCase()
    refresh()
  }
  return (
    <>
      {error.value && <p class="err">{error.value}</p>}
      {!d && !loading.value && (
        <Card>
          <h2>{t('c.yourcode')}</h2>
          <p class="muted">{t('c.codehint')}</p>
          <form onSubmit={enter}><input value={input} onInput={e => setInput((e.target as HTMLInputElement).value)} placeholder={t('c.codeph')} /><div class="btns"><button class="btn" type="submit">{t('c.open')}</button></div></form>
        </Card>
      )}
      {!d && loading.value && <Card><div class="sk" /></Card>}
      {d && <>
        <Announcement d={d} />
        <button class="btn or lost" onClick={() => go('more/where')}>📍 {t('grp.lost')}</button>
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
  program: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  group: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6 9c0-3.3 2.7-6 6-6s6 2.7 6 6m1-9a3 3 0 1 0 0-6m2 15c0-2.6-1.3-4.8-3.2-5.6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
}

function BottomNav({ cur, go }: { cur: string; go: (h: string) => void }) {
  return (
    <nav class="bnav" aria-label="Меню">
      {MAIN.map(k => (
        <button key={k} class={cur === k ? 'on' : ''} aria-current={cur === k ? 'page' : undefined} onClick={() => go(k)}>
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d={NAV_ICO[k]} fill="none" stroke="currentColor" stroke-width={k === 'more' ? 3.2 : 1.9} stroke-linecap="round" stroke-linejoin="round" /></svg>
          <span>{t('nav.' + k)}</span>
        </button>
      ))}
    </nav>
  )
}
