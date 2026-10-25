import { useEffect, useState } from 'preact/hooks'
import { useSignal } from '@preact/signals'
import { Announcement, GroupCard, MeCard, Points, Polls, ProgramRows, FullProgram } from '../components/group'
import { DuaList, ModePicker, Steps, ZikrList, useMode } from '../components/guide'
import { Today } from '../components/today'
import { Where } from '../components/where'
import { Card, Foot, Tabs, Top } from '../components/ui'
import { t } from '../lib/i18n'
import { code, data, error, groupCode, lang, loading, readUrlCodes, refresh } from '../lib/store'
import { watchNotes } from '../lib/notes'

type Tab = 'today' | 'group' | 'umra' | 'dua' | 'zikr' | 'program' | 'where'
const TABS: Tab[] = ['today', 'group', 'umra', 'dua', 'zikr', 'program', 'where']

export function Pilgrim() {
  const tab = useSignal<Tab>((TABS.find(x => x === location.hash.slice(1)) as Tab) || 'today')
  const mode = useMode()
  const [input, setInput] = useState('')
  useEffect(() => {
    readUrlCodes(); refresh()
    const onTab = (e: Event) => { const d = (e as CustomEvent<string>).detail as Tab; if (TABS.includes(d)) tab.value = d }
    const onHash = () => { const h = location.hash.slice(1) as Tab; if (TABS.includes(h)) tab.value = h }
    addEventListener('jurt:tab', onTab); addEventListener('hashchange', onHash)
    return () => { removeEventListener('jurt:tab', onTab); removeEventListener('hashchange', onHash) }
  }, [])
  useEffect(() => watchNotes(groupCode.value), [groupCode.value])
  useEffect(() => { history.replaceState(null, '', location.pathname + location.search + '#' + tab.value) }, [tab.value])
  const d = data.value
  void lang.value  // перерисовка при смене языка

  function enter(e: Event) {
    e.preventDefault()
    const v = input.trim()
    if (/^[A-Za-z]+-\d{3,5}$/.test(v)) { groupCode.value = v.toUpperCase(); code.value = '' } else code.value = v.toLowerCase()
    refresh()
  }

  return (
    <>
      <Top title={d?.group?.name || t('app.guide')} sub={d?.me ? d.me.name : d?.group?.code || t('app.entercode')} role={t('role.pilgrim')} />
      <main class="wrap">
        <Tabs items={TABS.map(k => [k, t('tab.' + k)] as [Tab, string])} cur={tab.value} set={x => (tab.value = x)} />
        {error.value && tab.value === 'group' && <p class="err">{error.value}</p>}

        {tab.value === 'today' && <Today />}
        {tab.value === 'group' && (
          <>
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
              <MeCard d={d} />
              <GroupCard d={d} personal={!!d.me} />
              <ProgramRows d={d} />
              <Polls d={d} canVote={!!d.me} />
              <Points d={d} />
              {!d.me && <Card cls="sand"><p>{t('c.common')}</p></Card>}
              <div class="btns"><button class="btn ghost sm" onClick={() => refresh()} disabled={loading.value}>{t('c.refresh')}</button>
                <button class="btn ghost sm" onClick={() => { code.value = ''; groupCode.value = ''; data.value = null }}>{t('c.other')}</button></div>
            </>}
          </>
        )}
        {tab.value === 'umra' && <><ModePicker mode={mode.value} set={m => (mode.value = m)} /><Steps mode={mode.value} canCheck /></>}
        {tab.value === 'dua' && <DuaList extra={d?.extra} />}
        {tab.value === 'zikr' && <ZikrList />}
        {tab.value === 'program' && <FullProgram />}
        {tab.value === 'where' && <Where />}
        {lang.value !== 'ru' && <p class="muted"><small>{t('c.check')}</small></p>}
        <Foot />
      </main>
    </>
  )
}
