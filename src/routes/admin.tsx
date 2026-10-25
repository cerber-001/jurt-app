/* Штаб организатора: ключ вводится на устройстве и хранится только в localStorage. Паспортов и оплат сервер не отдаёт. */
import { useEffect, useState } from 'preact/hooks'
import { admin } from '../lib/api'
import { adminKey, groupCode } from '../lib/store'
import type { AdminState } from '../lib/types'
import { Card, Foot, Top } from '../components/ui'

export function Admin() {
  const [key, setKey] = useState(adminKey.value)
  const [g, setG] = useState(groupCode.value || 'UMRA-0009')
  const [st, setSt] = useState<AdminState | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [ann, setAnn] = useState('')
  const [pq, setPq] = useState(''); const [popts, setPopts] = useState(''); const [ph, setPh] = useState('24'); const [pquorum, setPquorum] = useState('0'); const [pafter, setPafter] = useState(false)

  async function run(fn: () => Promise<AdminState>) {
    setBusy(true); setErr('')
    try { const r = await fn(); setSt(r); adminKey.value = key; groupCode.value = r.g?.code || g } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  useEffect(() => { if (key && g) run(() => admin.state(key, g)) }, [])

  return (
    <>
      <Top title="Штаб группы" sub={st?.g?.code || 'вход по ключу'} role="организатор" />
      <main class="wrap">
        <Card>
          <form onSubmit={e => { e.preventDefault(); run(() => admin.state(key, g)) }}>
            <label class="f">Ключ штаба<input type="password" value={key} onInput={e => setKey((e.target as HTMLInputElement).value)} autocomplete="off" /></label>
            <label class="f">Группа{st?.groups?.length ? (
              <select value={g} onChange={e => setG((e.target as HTMLSelectElement).value)}>{st.groups.map(x => <option key={x.code} value={x.code}>{x.code} · {x.name}</option>)}</select>
            ) : <input value={g} onInput={e => setG((e.target as HTMLInputElement).value.toUpperCase())} />}</label>
            <div class="btns"><button class="btn" type="submit" disabled={busy}>{st ? 'Обновить' : 'Войти'}</button>
              {st && <button class="btn ghost" type="button" onClick={() => { adminKey.value = ''; setKey(''); setSt(null) }}>Выйти</button>}</div>
          </form>
          {err && <p class="err">{err}</p>}
        </Card>

        {st && <>
          <Card>
            <h2>{st.g.name} <span class="pill">{st.g.code}</span></h2>
            <div class="kv"><span>Участников</span><span>{st.total}</span><span>Вылет</span><span>{st.g.dep}</span><span>Возврат</span><span>{st.g.ret}</span></div>
            <div class="btns">{st.sheetUrl && <a class="btn ghost sm" href={st.sheetUrl} target="_blank" rel="noopener">Таблица</a>}{st.hubUrl && <a class="btn ghost sm" href={st.hubUrl} target="_blank" rel="noopener">Штаб v2</a>}</div>
          </Card>

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
                <label class="f">Вопрос<input value={pq} onInput={e => setPq((e.target as HTMLInputElement).value)} /></label>
                <label class="f">Варианты (по одному в строке)<textarea rows={3} value={popts} onInput={e => setPopts((e.target as HTMLTextAreaElement).value)} /></label>
                <label class="f">Часов до закрытия<input type="number" min="1" value={ph} onInput={e => setPh((e.target as HTMLInputElement).value)} /></label>
                <label class="f">Кворум (0 — без кворума)<input type="number" min="0" value={pquorum} onInput={e => setPquorum((e.target as HTMLInputElement).value)} /></label>
                <label class="f"><input type="checkbox" style="width:auto" checked={pafter} onChange={e => setPafter((e.target as HTMLInputElement).checked)} /> Итоги только после закрытия</label>
                <div class="btns"><button class="btn" type="submit" disabled={busy}>Создать</button></div>
              </form>
            </details>
          </Card>

          <Card>
            <h3>Участники</h3>
            <table class="tbl">
              <thead><tr><th>Имя</th><th>Роль</th><th>Статус</th><th>Медина</th><th>Мекка</th><th>Ссылки</th></tr></thead>
              <tbody>{st.people.map(p => (
                <tr key={p.id} style={p.off ? 'opacity:.5' : ''}>
                  <td>{p.name}</td><td>{p.role}</td><td>{p.status}</td><td>{p.medina}</td><td>{p.mecca}</td>
                  <td>{p.link && <a href={p.link} target="_blank" rel="noopener">v2</a>} · <a href={'/p?p=' + p.id}>v3</a>{p.wa && <> · <a href={p.wa} target="_blank" rel="noopener">WA</a></>}</td>
                </tr>
              ))}</tbody>
            </table>
            <p class="muted" style="font-size:.8rem">Комнаты правятся в таблице (этап 1 — здесь). Паспорта и оплаты в приложение не попадают.</p>
          </Card>
        </>}
        <Foot />
      </main>
    </>
  )
}
