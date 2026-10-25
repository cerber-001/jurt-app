/* Штаб организатора: ключ штаба (Apps Script) и ключ v3 (Supabase) вводятся на устройстве и хранятся
   только в localStorage. Паспортов и оплат сервер не отдаёт. Записи идут в ту же таблицу Main_v2,
   что и v2 — обе версии видят изменения сразу. */
import { useEffect, useState } from 'preact/hooks'
import { admin, apiMode, setApiMode } from '../lib/api'
import { adminKey, groupCode, v3Key } from '../lib/store'
import { checkKey, dropKey, v3Role } from '../lib/notes'
import { listTripsAll, tripUpsert, type Trip } from '../lib/v3'
import type { AdminState, Group, Person } from '../lib/types'
import { Card, Foot, Top } from '../components/ui'

type Run = (fn: () => Promise<AdminState>) => Promise<void>
const inp = (e: Event) => (e.target as HTMLInputElement).value

/* дд.мм.гггг (таблица) ↔ гггг-мм-дд (Supabase) */
function toIso(d: string) { const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(d.trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : '' }

export function Admin() {
  const [key, setKey] = useState(adminKey.value)
  const [g, setG] = useState(groupCode.value || 'UMRA-0009')
  const [st, setSt] = useState<AdminState | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [ann, setAnn] = useState('')
  const [pq, setPq] = useState(''); const [popts, setPopts] = useState(''); const [ph, setPh] = useState('24'); const [pquorum, setPquorum] = useState('0'); const [pafter, setPafter] = useState(false)

  const run: Run = async fn => {
    setBusy(true); setErr('')
    try { const r = await fn(); setSt(r); adminKey.value = key; groupCode.value = r.g?.code || g; if (r.g?.code) setG(r.g.code) } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  useEffect(() => { if (key && g) run(() => admin.state(key, g)) }, [])

  return (
    <>
      <Top title="Штаб группы" sub={st?.g?.code || 'вход по ключу'} role="организатор" />
      <main class="wrap">
        <Card>
          <form onSubmit={e => { e.preventDefault(); run(() => admin.state(key, g)) }}>
            <label class="f">Ключ штаба<input type="password" value={key} onInput={e => setKey(inp(e))} autocomplete="off" /></label>
            <label class="f">Группа{st?.groups?.length ? (
              <select value={g} onChange={e => { setG((e.target as HTMLSelectElement).value) }}>{st.groups.map(x => <option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}</select>
            ) : <input value={g} onInput={e => setG(inp(e).toUpperCase())} />}</label>
            <label class="f">Источник данных<select value={apiMode.value} onChange={e => { setApiMode((e.target as HTMLSelectElement).value); setSt(null) }}>
              <option value="v2">Таблица Main_v2 (Apps Script)</option><option value="v3">Supabase (v3, этап 2)</option></select></label>
            <div class="btns"><button class="btn" type="submit" disabled={busy}>{st ? 'Обновить' : 'Войти'}</button>
              {st && <button class="btn ghost" type="button" onClick={() => { adminKey.value = ''; setKey(''); setSt(null) }}>Выйти</button>}</div>
          </form>
          {err && <p class="err">{err}</p>}
        </Card>

        {st && <>
          <GroupCard st={st} k={key} run={run} busy={busy} />

          <Card>
            <h3>Объявление</h3>
            {st.ann?.text && <div class="ann"><p>{st.ann.text}</p><small>{st.ann.at}</small></div>}
            <form onSubmit={e => { e.preventDefault(); if (ann.trim()) run(() => admin.announce(key, g, ann.trim())).then(() => setAnn('')) }}>
              <textarea rows={3} value={ann} onInput={e => setAnn((e.target as HTMLTextAreaElement).value)} placeholder="Новое объявление — увидят в v2 и v3 сразу" />
              <div class="btns"><button class="btn or" type="submit" disabled={busy || !ann.trim()}>Опубликовать</button></div>
            </form>
            {st.history?.length > 0 && <details><summary class="muted">История ({st.history.length})</summary><ul class="list">{st.history.map((h, i) => <li key={i}><small>{h.at}</small><br />{h.text}</li>)}</ul></details>}
          </Card>

          <Card>
            <h3>Голосования</h3>
            {st.polls.map(p => (
              <div class="poll" key={p.id}>
                <p><b>{p.q}</b> <span class={'pill' + (p.status === 'идёт' ? '' : ' red')}>{p.status}</span></p>
                <small class="muted">до {p.endsTxt} · {p.voted} из {p.total}{p.quorum ? ` · кворум ${p.quorum}` : ''}</small>
                {p.opts.map((o, i) => <div class="opt" key={i}><span style="flex:1">{o}</span><span class="n">{p.counts?.[i] ?? 0}</span></div>)}
                {p.waiting?.length > 0 && <small class="muted">Не голосовали: {p.waiting.map(w => w.name).join(', ')}</small>}
                <div class="btns">
                  {p.status === 'идёт' && <button class="btn ghost sm" disabled={busy} onClick={() => run(() => admin.pollSet(key, g, p.id, 'закрыт'))}>Закрыть</button>}
                  {p.status === 'закрыт' && <button class="btn ghost sm" disabled={busy} onClick={() => run(() => admin.pollSet(key, g, p.id, 'идёт', Date.now() + 24 * 3600e3))}>Открыть на сутки</button>}
                  {p.status !== 'скрыт' && <button class="btn ghost sm" disabled={busy} onClick={() => run(() => admin.pollSet(key, g, p.id, 'скрыт'))}>Скрыть</button>}
                </div>
              </div>
            ))}
            <details>
              <summary><b>Новое голосование</b></summary>
              <form onSubmit={e => {
                e.preventDefault()
                const opts = popts.split('\n').map(s => s.trim()).filter(Boolean)
                if (!pq.trim() || opts.length < 2) return
                run(() => admin.poll(key, g, { q: pq.trim(), opts, ends: Date.now() + Number(ph) * 3600e3, quorum: Number(pquorum) || 0, after: pafter }))
                  .then(() => { setPq(''); setPopts('') })
              }}>
                <label class="f">Вопрос<input value={pq} onInput={e => setPq(inp(e))} /></label>
                <label class="f">Варианты (по одному в строке)<textarea rows={3} value={popts} onInput={e => setPopts((e.target as HTMLTextAreaElement).value)} /></label>
                <label class="f">Часов до закрытия<input type="number" min="1" value={ph} onInput={e => setPh(inp(e))} /></label>
                <label class="f">Кворум (0 — без кворума)<input type="number" min="0" value={pquorum} onInput={e => setPquorum(inp(e))} /></label>
                <label class="f"><input type="checkbox" style="width:auto" checked={pafter} onChange={e => setPafter((e.target as HTMLInputElement).checked)} /> Итоги только после закрытия</label>
                <div class="btns"><button class="btn" type="submit" disabled={busy}>Создать</button></div>
              </form>
            </details>
          </Card>

          <People st={st} k={key} run={run} busy={busy} />
          <TripsAdmin st={st} />
        </>}
        <Foot />
      </main>
    </>
  )
}

/* ---- карточка группы: просмотр, правка полей, новая группа ---- */
const GROUP_FIELDS: [keyof Group, string, string][] = [
  ['name', 'Название', 'Умра, ноябрь 2026'], ['dep', 'Вылет (дд.мм.гггг)', '28.10.2026'], ['ret', 'Возврат (дд.мм.гггг)', '06.11.2026'],
  ['medina', 'Отель в Медине', ''], ['mecca', 'Отель в Мекке', ''], ['flights', 'Рейсы', 'TK 351 Алматы → Стамбул, 28.10, 06:15'],
  ['chat', 'Чат группы (https://…)', 'https://chat.whatsapp.com/…'], ['show', 'Показывать в гиде (да/нет)', 'да'],
]
function GroupForm({ init, isNew, onSave, onCancel, busy }: { init: Partial<Group>; isNew: boolean; onSave: (d: Partial<Group> & { code?: string }) => void; onCancel: () => void; busy: boolean }) {
  const [d, setD] = useState<Partial<Group> & { code?: string }>({ ...init })
  const set = (k: string, v: string) => setD(x => ({ ...x, [k]: v }))
  return (
    <form onSubmit={e => { e.preventDefault(); onSave(d) }}>
      {isNew && <>
        <label class="f">Код группы<input value={d.code || ''} onInput={e => set('code', inp(e).toUpperCase())} placeholder="UMRA-0010" required /></label>
        <label class="f">Таблица группы (ссылка или ID Google-таблицы)<input value={d.sheet || ''} onInput={e => set('sheet', inp(e))} placeholder="https://docs.google.com/spreadsheets/d/…" /></label>
      </>}
      <div class="grid2">
        {GROUP_FIELDS.map(([k, label, ph]) => (
          <label class="f" key={k}>{label}<input value={String(d[k] ?? '')} onInput={e => set(k, inp(e))} placeholder={ph} /></label>
        ))}
      </div>
      <div class="btns">
        <button class="btn" type="submit" disabled={busy}>{isNew ? 'Создать группу' : 'Сохранить'}</button>
        <button class="btn ghost" type="button" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  )
}
function GroupCard({ st, k, run, busy }: { st: AdminState; k: string; run: Run; busy: boolean }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'new'>('view')
  const [ok, setOk] = useState('')
  const save = (isNew: boolean) => (d: Partial<Group> & { code?: string }) => {
    const code = isNew ? (d.code || '') : st.g.code
    run(() => admin.group(k, code, { ...d, code }, isNew)).then(() => { setMode('view'); setOk(isNew ? 'Группа создана' : 'Сохранено — v2 и v3 обновятся при следующем открытии') })
  }
  return (
    <Card>
      <div class="sec"><h2>{st.g.name} <span class="pill">{st.g.code}</span></h2>
        {mode === 'view' && <div class="btns"><button class="btn ghost sm" onClick={() => { setOk(''); setMode('edit') }}>Изменить</button><button class="btn ghost sm" onClick={() => { setOk(''); setMode('new') }}>+ Новая группа</button></div>}
      </div>
      {mode === 'view' && <>
        <div class="kv"><span>Участников</span><span>{st.total}</span><span>Вылет</span><span>{st.g.dep}</span><span>Возврат</span><span>{st.g.ret}</span>
          <span>Медина</span><span>{st.g.medina || '—'}</span><span>Мекка</span><span>{st.g.mecca || '—'}</span><span>Рейсы</span><span>{st.g.flights || '—'}</span>
          <span>В гиде</span><span>{st.g.on === false ? 'скрыта' : 'показывается'}</span></div>
        <div class="btns">{st.sheetUrl && <a class="btn ghost sm" href={st.sheetUrl} target="_blank" rel="noopener">Таблица</a>}{st.hubUrl && <a class="btn ghost sm" href={st.hubUrl} target="_blank" rel="noopener">Штаб v2</a>}
          <a class="btn ghost sm" href={'/p?g=' + st.g.code}>Гид группы</a><a class="btn ghost sm" href={'/ustaz?g=' + st.g.code}>Экран устаза</a></div>
        {ok && <p class="ok">{ok}</p>}
      </>}
      {mode === 'edit' && <GroupForm init={(({ on: _on, ...rest }) => rest)(st.g)} isNew={false} onSave={save(false)} onCancel={() => setMode('view')} busy={busy} />}
      {mode === 'new' && <><p class="muted">Новая строка в листе «Группы» таблицы Main_v2. Таблицу группы с листом «Участники» подготовьте заранее.</p>
        <GroupForm init={{ show: 'да' }} isNew onSave={save(true)} onCancel={() => setMode('view')} busy={busy} /></>}
    </Card>
  )
}

/* ---- участники и комнаты: правка комнат пишется в лист «Участники» таблицы группы ---- */
function People({ st, k, run, busy }: { st: AdminState; k: string; run: Run; busy: boolean }) {
  const [rooms, setRooms] = useState<Record<string, { medina: string; mecca: string }>>({})
  const [edit, setEdit] = useState(false)
  const [ok, setOk] = useState('')
  useEffect(() => { setRooms({}); setEdit(false) }, [st.updated])
  const val = (p: Person, f: 'medina' | 'mecca') => rooms[p.id]?.[f] ?? p[f]
  const changed = st.people.filter(p => rooms[p.id] && (rooms[p.id].medina !== p.medina || rooms[p.id].mecca !== p.mecca))
  const save = () => run(() => admin.rooms(k, st.g.code, changed.map(p => ({ id: p.id, medina: val(p, 'medina'), mecca: val(p, 'mecca') }))))
    .then(() => setOk(`Комнаты сохранены: ${changed.length}`))
  return (
    <Card>
      <div class="sec"><h3>Участники · {st.total}</h3>
        {!edit ? <button class="btn ghost sm" onClick={() => { setOk(''); setEdit(true) }}>Комнаты</button>
          : <div class="btns"><button class="btn sm" disabled={busy || !changed.length} onClick={save}>Сохранить ({changed.length})</button><button class="btn ghost sm" onClick={() => { setRooms({}); setEdit(false) }}>Отмена</button></div>}
      </div>
      <table class="tbl">
        <thead><tr><th>Имя</th><th>Роль</th><th>Статус</th><th>Медина</th><th>Мекка</th><th>Ссылки</th></tr></thead>
        <tbody>{st.people.map(p => (
          <tr key={p.id} style={p.off ? 'opacity:.5' : ''}>
            <td>{p.name}</td><td>{p.role}</td><td>{p.status}</td>
            {edit ? <>
              <td><input value={val(p, 'medina')} maxLength={20} onInput={e => setRooms(r => ({ ...r, [p.id]: { medina: inp(e), mecca: val(p, 'mecca') } }))} /></td>
              <td><input value={val(p, 'mecca')} maxLength={20} onInput={e => setRooms(r => ({ ...r, [p.id]: { medina: val(p, 'medina'), mecca: inp(e) } }))} /></td>
            </> : <><td>{p.medina}</td><td>{p.mecca}</td></>}
            <td>{p.link && <a href={p.link} target="_blank" rel="noopener">v2</a>} · <a href={'/p?p=' + p.id}>v3</a>{p.wa && <> · <a href={p.wa} target="_blank" rel="noopener">WA</a></>}</td>
          </tr>
        ))}</tbody>
      </table>
      {ok && <p class="ok">{ok}</p>}
      <p class="muted" style="font-size:.8rem">Комнаты пишутся в лист «Участники» таблицы группы — паломники увидят их в v2 и v3. Паспорта и оплаты в приложение не попадают.</p>
    </Card>
  )
}

/* ---- v3 (Supabase): витрина поездок и доступ к заметкам устаза — по ключу v3 ---- */
const STATUSES: Trip['status'][] = ['план', 'набор', 'идёт', 'завершена', 'скрыта']
type TripDraft = { code: string; title: string; dep: string; ret: string; cities: string; status: Trip['status']; summary: string; is_public: boolean; sort: string }
const draftOf = (t?: Trip | null, g?: Group): TripDraft => ({
  code: t?.code || g?.code || '', title: t?.title || g?.name || '', dep: t?.dep || toIso(g?.dep || ''), ret: t?.ret || toIso(g?.ret || ''),
  cities: t ? t.cities.join(', ') : 'Медина, Мекка', status: t?.status || 'план', summary: t?.summary || '', is_public: t?.is_public ?? false, sort: String(t?.sort ?? 0),
})
function TripsAdmin({ st }: { st: AdminState }) {
  const [k, setK] = useState(v3Key.value)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [trips, setTrips] = useState<Trip[] | null>(null)
  const [d, setD] = useState<TripDraft | null>(null)
  const [ok, setOk] = useState('')
  const on = v3Role.value === 'admin'
  const load = async () => { try { setTrips(await listTripsAll(v3Key.value)) } catch (e) { setErr((e as Error).message) } }
  useEffect(() => { if (v3Key.value && !v3Role.value) checkKey(v3Key.value).then(r => { if (r === 'admin') load() }) ; else if (on) load() }, [])
  const login = async (e: Event) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { const r = await checkKey(k); if (r !== 'admin') { setErr(r ? 'Это ключ устаза — здесь нужен ключ организатора' : 'Ключ не подходит') } else await load() } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  const save = async (e: Event) => {
    e.preventDefault(); if (!d) return; setBusy(true); setErr('')
    try {
      await tripUpsert(v3Key.value, { code: d.code.trim().toUpperCase(), title: d.title.trim(), dep: d.dep || null, ret: d.ret || null,
        cities: d.cities.split(',').map(s => s.trim()).filter(Boolean), status: d.status, summary: d.summary.trim() || null, is_public: d.is_public, sort: Number(d.sort) || 0 })
      setD(null); setOk('Поездка сохранена — витрина /trips обновлена'); await load()
    } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  const set = (f: keyof TripDraft, v: string | boolean) => setD(x => x && ({ ...x, [f]: v }))
  const cur = trips?.find(t => t.code === st.g.code)
  return (
    <Card cls="mint">
      <div class="sec"><h3>Витрина и заметки · v3</h3>{on && <button class="btn ghost sm" onClick={() => { dropKey(); setTrips(null); setD(null) }}>Выйти</button>}</div>
      {!on ? (
        <form onSubmit={login}>
          <p class="muted">Ключ организатора v3 открывает витрину поездок (/trips) и заметки устаза. Хранится только на этом устройстве.</p>
          <label class="f">Ключ v3<input type="password" value={k} onInput={e => setK(inp(e))} autocomplete="off" /></label>
          <div class="btns"><button class="btn" type="submit" disabled={busy || !k}>Открыть</button></div>
        </form>
      ) : (
        <>
          <p class="muted">Поездки на витрине: {trips ? trips.length : '…'} · <a href="/trips">/trips</a> · заметки устаза — на <a href={'/ustaz?g=' + st.g.code}>экране устаза</a> (ключ организатора там тоже подходит).</p>
          {trips && !cur && !d && <p>Группы {st.g.code} ещё нет на витрине. <button class="btn sm" onClick={() => { setOk(''); setD(draftOf(null, st.g)) }}>Добавить из карточки группы</button></p>}
          {trips?.map(t => (
            <div class="kv" key={t.id} style="align-items:center">
              <span><b>{t.code}</b><br /><small class={'pill' + (t.is_public && t.status !== 'скрыта' ? ' gr' : '')}>{t.is_public ? t.status : 'не публична'}</small></span>
              <span>{t.title}{t.dep ? <><br /><small class="muted">{t.dep}{t.ret ? ' — ' + t.ret : ''}</small></> : null}
                <div class="btns"><button class="btn ghost sm" onClick={() => { setOk(''); setD(draftOf(t)) }}>Изменить</button><a class="btn ghost sm" href={'/trip/' + t.code}>Открыть</a></div></span>
            </div>
          ))}
          {!d && trips && <div class="btns"><button class="btn ghost sm" onClick={() => { setOk(''); setD(draftOf(null)) }}>+ Поездка</button></div>}
          {d && (
            <form onSubmit={save}>
              <div class="grid2">
                <label class="f">Код<input value={d.code} onInput={e => set('code', inp(e).toUpperCase())} required /></label>
                <label class="f">Название<input value={d.title} onInput={e => set('title', inp(e))} required /></label>
                <label class="f">Вылет<input type="date" value={d.dep} onInput={e => set('dep', inp(e))} /></label>
                <label class="f">Возврат<input type="date" value={d.ret} onInput={e => set('ret', inp(e))} /></label>
                <label class="f">Города (через запятую)<input value={d.cities} onInput={e => set('cities', inp(e))} /></label>
                <label class="f">Статус<select value={d.status} onChange={e => set('status', (e.target as HTMLSelectElement).value)}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
                <label class="f">Порядок на витрине<input type="number" value={d.sort} onInput={e => set('sort', inp(e))} /></label>
              </div>
              <label class="f">Описание (публичное, без имён и цен)<textarea rows={3} value={d.summary} maxLength={1500} onInput={e => set('summary', (e.target as HTMLTextAreaElement).value)} /></label>
              <label class="chkl"><input type="checkbox" checked={d.is_public} onChange={e => set('is_public', (e.target as HTMLInputElement).checked)} /> Показывать на витрине /trips</label>
              <div class="btns"><button class="btn" type="submit" disabled={busy}>Сохранить</button><button class="btn ghost" type="button" onClick={() => setD(null)}>Отмена</button></div>
            </form>
          )}
          {ok && <p class="ok">{ok}</p>}
        </>
      )}
      {err && <p class="err">{err}</p>}
    </Card>
  )
}
