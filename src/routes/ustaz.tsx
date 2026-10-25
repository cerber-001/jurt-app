/* Устаз: гид и программа без личных данных участников. Устаз обезличен — ни имён, ни «последней инстанции».
   С ключом v3 (роль ustaz или admin) под каждым шагом, дуа и зикром появляется редактор заметок. */
import { useEffect, useState } from 'preact/hooks'
import { useSignal } from '@preact/signals'
import { Announcement, GroupCard, Points, Polls, ProgramRows, FullProgram } from '../components/group'
import { DuaList, ModePicker, Steps, ZikrList, useContent, useMode } from '../components/guide'
import { Card, Foot, Tabs, Top } from '../components/ui'
import { fetchApp } from '../lib/api'
import { checkKey, dropKey, editMode, notes, notesErr, removeNote, v3Role, watchNotes } from '../lib/notes'
import { v3Key } from '../lib/store'
import type { AppData } from '../lib/types'
import { pick } from '../lib/i18n'

type Tab = 'umra' | 'dua' | 'zikr' | 'group' | 'program' | 'notes'

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
  useEffect(() => watchNotes(g), [g])
  // ключ с прошлого раза проверяем молча; при уходе со страницы редактор выключаем
  useEffect(() => {
    if (v3Key.value) checkKey(v3Key.value).catch(() => { editMode.value = false })
    return () => { editMode.value = false }
  }, [])
  const on = editMode.value
  return (
    <>
      <Top title="Наставник группы" sub={d?.group?.code || g || 'гид и программа'} role="устаз" />
      <main class="wrap">
        <Tabs items={[['umra', 'Умра'], ['dua', 'Дуа'], ['zikr', 'Зикр'], ['group', 'Группа'], ['program', 'Программа'], ['notes', on ? `Заметки · ${notes.value.length}` : 'Ключ']]} cur={tab.value} set={t => (tab.value = t)} />
        {tab.value === 'notes' && <KeyCard g={g} setG={setG} />}
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
        {tab.value === 'umra' && <>
          <Card cls="mint"><p>Тексты шагов и дуа — те же, что видят паломники. Замечания к текстам передаются организатору; в приложении устаз не выступает последней инстанцией по фикху.</p>
            {on ? <p class="muted"><small>Редактор заметок включён: под каждым шагом есть кнопка «+ Заметка устаза». Паломники видят заметки без имени автора.</small></p>
              : <p class="muted"><small>Чтобы оставлять заметки к шагам, дуа и зикрам, введите ключ устаза на вкладке «Ключ».</small></p>}
          </Card>
          <ModePicker mode={mode.value} set={m => (mode.value = m)} /><Steps mode={mode.value} canCheck={false} /></>}
        {tab.value === 'dua' && <DuaList extra={d?.extra} />}
        {tab.value === 'zikr' && <ZikrList />}
        {tab.value === 'program' && <FullProgram />}
        <Foot />
      </main>
    </>
  )
}

/** Ключ v3 (устаз или организатор) + список всех заметок, загруженных для группы */
function KeyCard({ g, setG }: { g: string; setG: (v: string) => void }) {
  const [k, setK] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const c = useContent()
  async function enter(e: Event) {
    e.preventDefault()
    setBusy(true); setErr('')
    try {
      const role = await checkKey(k.trim())
      if (!role) setErr('Ключ не подходит')
      setK('')
    } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  const title = (id: string) => {
    const [kind, bid] = id.split(':')
    if (!c) return id
    if (kind === 'step') return 'Шаг: ' + (c.steps.find(s => s.id === bid)?.title || bid)
    if (kind === 'dua') return 'Дуа: ' + (c.dua.find(x => x.id === bid)?.title || bid)
    if (kind === 'zikr') return 'Зикр: ' + (pick(c.zikr.find(z => z.id === bid)?.n) || bid)
    return id
  }
  return (
    <>
      <Card>
        <h2>Ключ устаза</h2>
        {v3Role.value ? (
          <>
            <p>Доступ открыт: <span class="pill gr">{v3Role.value === 'admin' ? 'организатор' : 'устаз'}</span>. Заметки можно добавлять на вкладках «Умра», «Дуа», «Зикр».</p>
            <p class="muted"><small>Заметка без галочки «Только для группы» видна во всех поездках. Язык заметки — текущий язык интерфейса.</small></p>
            <div class="btns"><button class="btn ghost sm" onClick={dropKey}>Выйти</button></div>
          </>
        ) : (
          <form onSubmit={enter}>
            <p class="muted">Ключ выдаёт организатор. Он хранится только на этом устройстве.</p>
            <label class="f">Ключ<input type="password" value={k} onInput={e => setK((e.target as HTMLInputElement).value)} autocomplete="off" required /></label>
            <label class="f">Код группы (для заметок только этой поездке)<input value={g} onInput={e => setG((e.target as HTMLInputElement).value.toUpperCase())} placeholder="UMRA-0009" /></label>
            {err && <p class="err">{err}</p>}
            <div class="btns"><button class="btn" type="submit" disabled={busy}>Войти</button></div>
          </form>
        )}
      </Card>
      <Card>
        <h2>Заметки {g ? `· общие и ${g}` : '· общие'}</h2>
        {notesErr.value && <p class="err">{notesErr.value}</p>}
        {!notes.value.length && <p class="muted">Пока нет ни одной заметки.</p>}
        <div class="list">
          {notes.value.map(n => (
            <div class="note" key={n.id}>
              <b>{title(n.block_id)}</b> <span class="pill">{n.lang}</span> {n.trip_code && <span class="pill">{n.trip_code}</span>}
              <div style="white-space:pre-line">{n.body}</div>
              {n.src && <small>Источник: {n.src}</small>}
              {v3Role.value && <div class="btns"><button class="btn ghost sm" onClick={async () => { if (confirm('Удалить заметку?')) await removeNote(n.id) }}>Удалить</button></div>}
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}
