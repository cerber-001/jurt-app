/* Устаз: гид и программа без личных данных участников. Устаз обезличен — ни имён, ни «последней инстанции». */
import { useEffect, useState } from 'preact/hooks'
import { useSignal } from '@preact/signals'
import { Announcement, GroupCard, Points, Polls, ProgramRows, FullProgram } from '../components/group'
import { DuaList, ModePicker, Steps, ZikrList, useMode } from '../components/guide'
import { Card, Foot, Tabs, Top } from '../components/ui'
import { fetchApp } from '../lib/api'
import type { AppData } from '../lib/types'

type Tab = 'group' | 'umra' | 'dua' | 'zikr' | 'program'

export function Ustaz() {
  const tab = useSignal<Tab>('umra')
  const mode = useMode()
  const [g, setG] = useState(() => new URLSearchParams(location.search).get('g')?.toUpperCase() || (localStorage.getItem('jurt.group') || ''))
  const [d, setD] = useState<AppData | null>(null)
  const [err, setErr] = useState('')
  async function load(code: string) {
    if (!code) return
    setErr('')
    try { setD(await fetchApp({ g: code })) } catch (e) { setErr((e as Error).message) }
  }
  useEffect(() => { load(g) }, [])
  return (
    <>
      <Top title="Наставник группы" sub={d?.group?.code || 'гид и программа'} role="устаз" />
      <main class="wrap">
        <Tabs items={[['umra', 'Умра'], ['dua', 'Дуа'], ['zikr', 'Зикр'], ['group', 'Группа'], ['program', 'Программа']]} cur={tab.value} set={t => (tab.value = t)} />
        {tab.value === 'group' && (
          <>
            <Card>
              <form onSubmit={e => { e.preventDefault(); load(g) }}>
                <label class="f">Код группы<input value={g} onInput={e => setG((e.target as HTMLInputElement).value.toUpperCase())} placeholder="UMRA-0009" /></label>
                <div class="btns"><button class="btn" type="submit">Показать</button></div>
              </form>
              {err && <p class="err">{err}</p>}
            </Card>
            {d && <><Announcement d={d} /><GroupCard d={d} personal={false} /><ProgramRows d={d} /><Polls d={d} canVote={false} /><Points d={d} /></>}
          </>
        )}
        {tab.value === 'umra' && <><Card cls="mint"><p>Тексты шагов и дуа — те же, что видят паломники. Замечания к текстам передаются организатору; в приложении устаз не выступает последней инстанцией по фикху.</p></Card><ModePicker mode={mode.value} set={m => (mode.value = m)} /><Steps mode={mode.value} canCheck={false} /></>}
        {tab.value === 'dua' && <DuaList extra={d?.extra} />}
        {tab.value === 'zikr' && <ZikrList />}
        {tab.value === 'program' && <FullProgram />}
        <Foot />
      </main>
    </>
  )
}
