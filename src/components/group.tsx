/* Блоки живых данных группы (Apps Script, тот же сервер, что у v2). */
import { useEffect, useState } from 'preact/hooks'
import { vote } from '../lib/api'
import { fetchProgram, type Program } from '../lib/program'
import { code, data, error, loading, me, refresh } from '../lib/store'
import type { AppData, Poll } from '../lib/types'
import { Card } from './ui'

/** значение есть и это не прочерк */
const ok = (v?: string) => !!v && v.trim() !== '—' && v.trim() !== '-'

export function Announcement({ d }: { d: AppData }) {
  if (!d.announcement?.text) return null
  return <Card cls="sand"><div class="ann"><b>Объявление</b><p>{d.announcement.text}</p><small>{d.announcement.at}</small></div></Card>
}

export function GroupCard({ d, personal }: { d: AppData; personal: boolean }) {
  const g = d.group
  return (
    <Card>
      <h2>{g.name || g.code} <span class="pill">{g.code}</span></h2>
      <div class="kv">
        <span>Вылет</span><span>{g.dep}</span>
        <span>Возврат</span><span>{g.ret}</span>
        <span>Медина</span><span>{g.medina}</span>
        <span>Мекка</span><span>{g.mecca}</span>
        {g.flights && <><span>Рейсы</span><span>{g.flights}</span></>}
      </div>
      {personal && d.chat && <a class="btn sm" href={d.chat} target="_blank" rel="noopener">Чат группы в WhatsApp</a>}
      <p class="muted" style="font-size:.8rem">Обновлено {d.updated}{loading.value ? ' · обновляю…' : ''}</p>
    </Card>
  )
}

export function MeCard({ d }: { d: AppData }) {
  const m = d.me
  if (!m) return null
  return (
    <Card cls="mint">
      <h2>Ассаляму алейкум, {m.first || m.name}</h2>
      <div class="kv">
        <span>Комната в Медине</span><span>{m.medina || '—'}{m.matesMedina?.length ? ' · с ' + m.matesMedina.map(x => x.name).join(', ') : ''}</span>
        <span>Комната в Мекке</span><span>{m.mecca || '—'}{m.matesMecca?.length ? ' · с ' + m.matesMecca.map(x => x.name).join(', ') : ''}</span>
      </div>
    </Card>
  )
}

export function Points({ d }: { d: AppData }) {
  if (!d.points?.length) return null
  return (
    <Card>
      <h3>Места сбора</h3>
      <ul class="list">
        {d.points.map((p, i) => (
          <li key={i}><b>{p.city}: {p.name}</b><br /><small>{p.how}</small>{p.map && <> · <a href={p.map} target="_blank" rel="noopener">карта</a></>}</li>
        ))}
      </ul>
    </Card>
  )
}

/** Программа ближайших дней — строки, которые отдаёт сервер (лист «Программа» Main_v2) */
export function ProgramRows({ d }: { d: AppData }) {
  if (!d.program?.length) return null
  const byDay = new Map<string, typeof d.program>()
  for (const r of d.program) { const k = r.date + ' ' + r.day; byDay.set(k, [...(byDay.get(k) || []), r]) }
  return (
    <Card>
      <h3>Расписание группы</h3>
      {[...byDay.entries()].map(([k, rows]) => (
        <div key={k}>
          <div class="day-h"><b>{k}</b><small>{rows[0].city}</small></div>
          <div class="prog">
            {rows.map((r, i) => (
              <>
                <span class="t" key={'t' + i}>{r.time}</span>
                <span key={'w' + i}>{r.what}{ok(r.place) && <small> · {r.place}</small>}{ok(r.transport) && <small> · {r.transport}</small>}{ok(r.who) && <small> · {r.who}</small>}</span>
              </>
            ))}
          </div>
        </div>
      ))}
    </Card>
  )
}

/** Полная программа тура — program.json из v2 (обезличенная) */
export function FullProgram() {
  const [p, setP] = useState<Program | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { fetchProgram().then(setP).catch(e => setErr(String(e))) }, [])
  if (err) return <p class="err">{err}</p>
  if (!p) return <Card><div class="sk" /></Card>
  return (
    <>
      <Card>
        <h2>{p.title}</h2>
        <p class="muted">{p.subtitle}</p>
        <p><small>{p.group} · версия {p.version} · обновлено {p.updated}</small></p>
      </Card>
      {p.days.map(d => (
        <Card key={d.id}>
          <div class="day-h"><b>{d.date}</b><small>{d.city}{d.title ? ' · ' + d.title : ''}</small></div>
          <div class="prog">
            {d.items.map((it, i) => (
              <>
                <span class="t" key={'t' + i}>{it.t}</span>
                <span key={'w' + i}>
                  {it.w}{ok(it.p) && <small> · {it.p}</small>}{ok(it.tr) && <small> · {it.tr}</small>}{ok(it.who) && <small> · {it.who}</small>}
                  {it.m && <><br /><small class="muted">{it.m}</small></>}
                  {it.pay && <><br /><span class="pay">{it.pay}</span></>}
                </span>
              </>
            ))}
          </div>
        </Card>
      ))}
      <Card cls="sand">
        <h3>Входит</h3><ul class="list">{p.incl.map((x, i) => <li key={i}>{x}</li>)}</ul>
        <h3>Не входит</h3><ul class="list">{p.excl.map((x, i) => <li key={i}>{x}</li>)}</ul>
        {p.pay_rule && <p class="muted">{p.pay_rule}</p>}
      </Card>
    </>
  )
}

export function Polls({ d, canVote }: { d: AppData; canVote: boolean }) {
  const [busy, setBusy] = useState('')
  if (!d.polls?.length) return null
  async function cast(p: Poll, v: number) {
    if (!canVote || !code.value || !p.open || busy) return
    setBusy(p.id)
    try {
      const r = await vote(code.value, p.id, v)
      if (data.value) data.value = { ...data.value, polls: r.polls }
    } catch (e) { error.value = (e as Error).message } finally { setBusy('') }
  }
  return (
    <Card>
      <h3>Голосования группы</h3>
      {d.polls.map(p => (
        <div class="poll" key={p.id}>
          <p><b>{p.q}</b> <span class={'pill' + (p.open ? '' : ' red')}>{p.status}</span></p>
          <small class="muted">до {p.endsTxt} · проголосовали {p.voted} из {p.total}{p.quorum ? ` · кворум ${p.quorum}` : ''}</small>
          {p.opts.map((o, i) => {
            const n = p.counts ? p.counts[i] : null
            const pct = n != null && p.voted ? Math.round((n / p.voted) * 100) : 0
            return (
              <div key={i} class={'opt' + (p.mine === i ? ' mine' : '')} onClick={() => cast(p, i)} role={canVote && p.open ? 'button' : undefined}>
                <span style="flex:1">{o}</span>
                {n != null && <><span class="bar"><i style={{ width: pct + '%' }} /></span><span class="n">{n}</span></>}
              </div>
            )
          })}
          {p.after && p.open && <small class="muted">Итоги покажем после закрытия</small>}
          {!canVote && <small class="muted">Голосовать можно по личной ссылке паломника</small>}
        </div>
      ))}
    </Card>
  )
}

export function useGroupData() {
  useEffect(() => { refresh() }, [code.value, me.value === undefined])
  return data.value
}
