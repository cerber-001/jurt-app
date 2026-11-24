/* Экран паломника. Нижнее меню — в двух режимах (2.0 этап 1 «Каждый день», lib/journey.ts → modeOf):
   «каждый день» (нет программы группы, поездка не началась или закончилась): Сегодня · Мой путь · Группа · Ещё, открывается «Сегодня»;
   «поездка» (сегодня день поездки по программе группы): Сейчас · Путь · Группа · Ещё, открывается «Сейчас» — как в 1.1.
   Режим решается сразу по сохранённой копии программы (без мигания меню) и пересчитывается, когда пришла программа,
   данные группы или сменился день. Экраны, которых нет в меню режима, — в «Ещё» («Сегодня» в поездке, «Шаги умры» в обычные дни).
   Адреса: #today #journey #now #path #group #more #more/<раздел> #program — работают в обоих режимах.
   Старые адреса (#umra, #dua…) ведут в новые места; #today теперь — новый экран «Сегодня».
   1.1: смена раздела — плавный переход View Transitions (lib/transition.ts); без поддержки или при «Уменьшить движение» — сразу. */
import { useEffect, useRef, useState } from 'preact/hooks'
import { useSignal } from '@preact/signals'
import { Announcement, GroupCard, MeCard, Points, Polls } from '../components/group'
import { Lost, lostOpen } from '../components/lost'
import { Nearby, nearby } from '../components/nearby'
import { More, Now, ProgramNow, type MoreRow } from '../components/now'
import { Path } from '../components/path'
import { Finale, finale } from '../components/finale'
import { Reader, reading } from '../components/reader'
import { loadProgram, program } from '../components/today'
import { TodayScreen } from '../components/everyday/today'
import { JourneyScreen } from '../components/everyday/journey'
import { LessonReader, lessonOpen } from '../components/everyday/lesson'
import { Haram3dOverlay, haram3dOpen } from '../components/everyday/haram3d-card'
import { Card, Top } from '../components/ui'
import { t } from '../lib/i18n'
import { runTransition, tabKind } from '../lib/transition'
import { demo, useNow } from '../lib/clock'
import { modeOf, ownProgram, savedProgram, type Mode } from '../lib/journey'
import { code, data, error, groupCode, lang, loading, readUrlCodes, refresh } from '../lib/store'
import { watchNotes } from '../lib/notes'
import { isGroupCode } from '../lib/codes'

const NAVS: Record<Mode, readonly string[]> = {
  trip: ['now', 'path', 'group', 'more'],
  everyday: ['today', 'journey', 'group', 'more'],
}
/** Что открывается при входе (и по неизвестному адресу) */
const HOME: Record<Mode, string> = { trip: 'now', everyday: 'today' }
/** Экран, которого нет в нижнем меню режима, — первым пунктом «Ещё» */
const MORE_TOP: Record<Mode, MoreRow> = {
  trip: ['today', 'jr.more.today', 'i-pray'],
  everyday: ['path', 'jr.more.steps', 'i-walk'],
}
const PAGES: readonly string[] = ['now', 'path', 'group', 'more', 'program', 'today', 'journey']
const OLD: Record<string, string> = {
  umra: 'path', 'more/umra': 'path', dua: 'more/dua', zikr: 'more/zikr', where: 'more/where',
}

/** Адрес → раздел; пустой или неизвестный — домашний экран режима */
function norm(h: string, mode: Mode): string {
  h = h.replace(/^#/, '')
  if (OLD[h]) return OLD[h]
  const [a, b] = h.split('/')
  if (!PAGES.includes(a)) return HOME[mode]
  return a === 'more' && b ? 'more/' + b : a
}

/** Адрес в окне указывает на раздел (а не пустой / неизвестный): тогда экран выбрал человек, а не режим */
const isExplicit = (h: string) => { const a = h.replace(/^#/, ''); return !!OLD[a] || PAGES.includes(a.split('/')[0]) }

/** Место в нижнем меню: «Сегодня» и «Сейчас» — первое, «Мой путь» и «Путь» — второе */
const SLOT: Record<string, number> = { now: 0, today: 0, path: 1, journey: 1, group: 2, more: 3 }

/** Порядок раздела для направления перехода: по нижнему меню слева направо; подраздел и «Программа» — на шаг глубже */
function rank(r: string, mode: Mode): number {
  const [a, b] = r.split('/')
  if (a === 'program') return mode === 'trip' ? 1 : 31
  return (SLOT[a] ?? 3) * 10 + (b ? 1 : 0)
}

/** Какой пункт меню подсветить: свой; «Программа» в поездке — «Сейчас»; экран из «Ещё» — «Ещё»; прочее — ничего */
function navCur(main: string, mode: Mode): string {
  if (NAVS[mode].includes(main)) return main
  if (main === 'program') return mode === 'trip' ? 'now' : 'more'
  return main === MORE_TOP[mode][0] ? 'more' : ''
}

function setHash(r: string) {
  const url = location.pathname + location.search + '#' + r
  if (location.pathname + location.search + location.hash !== url) history.replaceState(null, '', url)
}

/** Режим меню: программа (из сети или сохранённая копия) + данные группы + текущее время (с демо ?at=) */
function useMode(): Mode {
  const [saved] = useState(savedProgram)
  const p = ownProgram(program.value ?? saved, data.value?.group?.code || groupCode.value)
  const now = useNow(p)
  return modeOf(p, !!data.value || demo, now)
}

export function Pilgrim() {
  const mode = useMode()
  const route = useSignal(norm(location.hash, mode))
  const mainRef = useRef<HTMLElement>(null)
  const firstRoute = useRef(true)
  // экран выбран режимом (вход без адреса) — при смене режима его можно сменить; выбранный человеком — нет
  const auto = useRef(!isExplicit(location.hash))
  const modeRef = useRef(mode)
  modeRef.current = mode
  // адрес меняем сразу, а не в эффекте и не внутри перехода: useDialog при закрытии окна сверяет адрес
  // и не откатывает переход. Сам экран меняется внутри плавного перехода (если он есть)
  const go = (h: string) => {
    const r = norm(h, modeRef.current)
    auto.current = false
    setHash(r)
    const show = () => { route.value = r; scrollTo(0, 0) }
    if (r === route.value) show()
    else runTransition(show, tabKind(rank(route.value, modeRef.current), rank(r, modeRef.current)))
  }
  useEffect(() => {
    readUrlCodes(); refresh()
    const onTab = (e: Event) => go((e as CustomEvent<string>).detail)
    const onHash = () => { auto.current = false; route.value = norm(location.hash, modeRef.current) }
    addEventListener('jurt:tab', onTab); addEventListener('hashchange', onHash)
    return () => { removeEventListener('jurt:tab', onTab); removeEventListener('hashchange', onHash) }
  }, [])
  useEffect(() => watchNotes(groupCode.value), [groupCode.value])
  // программа нужна для режима: грузим, как только известна группа (без группы режим всегда «каждый день»)
  const hasGroup = !!data.value || demo
  useEffect(() => { if (hasGroup) void loadProgram() }, [hasGroup])
  // сменился режим (пришла программа или данные группы, начался/закончился день поездки):
  // если экран выбирал режим, а не человек, — открыть домашний экран нового режима
  // такую смену делает само приложение, а не человек: фокус в содержимое не переводим (byApp)
  const lastMode = useRef(mode)
  const byApp = useRef(false)
  useEffect(() => {
    const was = lastMode.current
    lastMode.current = mode
    if (was === mode || !auto.current || route.value !== HOME[was]) return
    setHash(HOME[mode])
    byApp.current = true
    route.value = HOME[mode]
  }, [mode])
  useEffect(() => {
    setHash(route.value)
    // смена раздела человеком: фокус в начало содержимого (кроме первого открытия и смены режима приложением)
    const skip = firstRoute.current || byApp.current
    firstRoute.current = false; byApp.current = false
    if (!skip) mainRef.current?.focus({ preventScroll: true })
  }, [route.value])
  const overlay = !!nearby.value || lostOpen.value || finale.value || !!reading.value || lessonOpen.value !== null || haram3dOpen.value
  const d = data.value
  void lang.value  // перерисовка при смене языка
  const [main, sub = ''] = route.value.split('/')
  const back = mode === 'trip' ? ['now', t('nav.now')] : ['more', t('more.back')]

  return (
    <>
      <Top title={d?.group?.name || t('app.guide')} sub={d?.me ? d.me.name : d?.group?.code || t('app.entercode')} role={t('role.pilgrim')} inert={overlay} />
      <main class="wrap core" ref={mainRef} tabIndex={-1} inert={overlay}>
        {main === 'today' && <TodayScreen go={go} />}
        {main === 'journey' && <JourneyScreen go={go} />}
        {main === 'now' && <Now go={go} />}
        {main === 'path' && <Path />}
        {main === 'program' && <><h1 class="sr-only">{t('nav.program')}</h1><button class="btn ghost sm back" onClick={() => go(back[0])}><span aria-hidden="true">←</span> {back[1]}</button><ProgramNow /></>}
        {main === 'group' && <GroupTab />}
        {main === 'more' && <More sub={sub} go={go} top={MORE_TOP[mode]} />}
        {lang.value !== 'ru' && <p class="muted"><small>{t('c.check')}</small></p>}
      </main>
      <BottomNav nav={NAVS[mode]} cur={navCur(main, mode)} go={go} inert={overlay} />
      <Nearby />
      <Lost go={go} />
      <Reader />
      <LessonReader />
      <Haram3dOverlay />
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
/** Новые пункты режима «каждый день» — на прежних значках (новых не рисуем): «Сегодня» — часы, «Мой путь» — путь */
const ICO_OF: Record<string, string> = { today: 'now', journey: 'path' }

function BottomNav({ nav, cur, go, inert }: { nav: readonly string[]; cur: string; go: (h: string) => void; inert?: boolean }) {
  return (
    <nav class="bnav" aria-label={t('nav.menu')} inert={inert}>
      {nav.map(k => (
        <button key={k} class={cur === k ? 'on' : ''} aria-current={cur === k ? 'page' : undefined} onClick={() => go(k)}>
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d={NAV_ICO[ICO_OF[k] ?? k]} fill="none" stroke="currentColor" stroke-width={k === 'more' ? 3.2 : 1.9} stroke-linecap="round" stroke-linejoin="round" /></svg>
          <span>{t('nav.' + k)}</span>
        </button>
      ))}
    </nav>
  )
}
