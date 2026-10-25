import { useEffect, useState } from 'preact/hooks'
import { useSignal } from '@preact/signals'
import { Announcement, GroupCard, MeCard, Points, Polls, ProgramRows, FullProgram } from '../components/group'
import { DuaList, ModePicker, Steps, ZikrList, useMode } from '../components/guide'
import { Card, Foot, Tabs, Top } from '../components/ui'
import { code, data, error, groupCode, loading, readUrlCodes, refresh } from '../lib/store'

type Tab = 'group' | 'umra' | 'dua' | 'zikr' | 'program'

export function Pilgrim() {
  const tab = useSignal<Tab>('group')
  const mode = useMode()
  const [input, setInput] = useState('')
  useEffect(() => { readUrlCodes(); refresh() }, [])
  const d = data.value

  function enter(e: Event) {
    e.preventDefault()
    const v = input.trim()
    if (/^[A-Za-z]+-\d{3,5}$/.test(v)) { groupCode.value = v.toUpperCase(); code.value = '' } else code.value = v.toLowerCase()
    refresh()
  }

  return (
    <>
      <Top title={d?.group?.name || 'Гид паломника'} sub={d?.me ? d.me.name : d?.group?.code || 'введите код'} role="паломник" />
      <main class="wrap">
        <Tabs items={[['group', 'Группа'], ['umra', 'Умра'], ['dua', 'Дуа'], ['zikr', 'Зикр'], ['program', 'Программа']]} cur={tab.value} set={t => (tab.value = t)} />
        {error.value && <p class="err">{error.value}</p>}

        {tab.value === 'group' && (
          <>
            {!d && !loading.value && (
              <Card>
                <h2>Ваш код</h2>
                <p class="muted">Личный код из ссылки организатора (тот же, что в гиде v2) или код группы вида UMRA-0009.</p>
                <form onSubmit={enter}><input value={input} onInput={e => setInput((e.target as HTMLInputElement).value)} placeholder="например: UMRA-0009" /><div class="btns"><button class="btn" type="submit">Открыть</button></div></form>
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
              {!d.me && <Card cls="sand"><p>Это общий вид группы. Комната, соседи и голосование открываются по личной ссылке от организатора.</p></Card>}
              <div class="btns"><button class="btn ghost sm" onClick={() => refresh()} disabled={loading.value}>Обновить</button>
                <button class="btn ghost sm" onClick={() => { code.value = ''; groupCode.value = ''; data.value = null }}>Другой код</button></div>
            </>}
          </>
        )}
        {tab.value === 'umra' && <><ModePicker mode={mode.value} set={m => (mode.value = m)} /><Steps mode={mode.value} canCheck /></>}
        {tab.value === 'dua' && <DuaList extra={d?.extra} />}
        {tab.value === 'zikr' && <ZikrList />}
        {tab.value === 'program' && <FullProgram />}
        <Foot />
      </main>
    </>
  )
}
