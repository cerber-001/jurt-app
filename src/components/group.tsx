/* Блоки живых данных группы (Apps Script, тот же сервер, что у v2). */
import { useEffect, useState } from 'preact/hooks'
import { vote } from '../lib/api'
import { fetchProgram, type Program } from '../lib/program'
import { code, data, error, loading, me, refresh } from '../lib/store'
import type { AppData, Poll } from '../lib/types'
import { localAt } from '../lib/announce'
import { tzNow, useNow } from '../lib/clock'
import { loadProgram, program } from './today'
import { Card } from './ui'
import { progLang, t, tf } from '../lib/i18n'

/** значение есть и это не прочерк */
const ok = (v?: string) => !!v && v.trim() !== '—' && v.trim() !== '-'

/** Время объявления — по часам города, где паломник сейчас (сервер пишет его по Алматы).
    Пока программа не загружена, пояс неизвестен — показываем строку сервера как есть. */
export function Announcement({ d }: { d: AppData }) {
  useEffect(() => { loadProgram() }, [])
  const p = program.value
  const now = useNow(p)
  const a = d.announcement
  if (!a?.text) return null
  const at = p ? localAt(a.at, now, tzNow(p, now)) : a.at
  return <Card cls="sand"><div class="ann"><b>{t('grp.ann')}</b><p lang={progLang()}>{a.text}</p><small>{at}</small></div></Card>
}

export function GroupCard({ d, personal }: { d: AppData; personal: boolean }) {
  const g = d.group
  return (
    <Card>
      <h2>{g.name || g.code} <span class="pill">{g.code}</span></h2>
      <div class="kv">
        <span>{t('grp.dep')}</span><span>{g.dep}</span>
        <span>{t('grp.ret')}</span><span>{g.ret}</span>
        <span>{t('grp.medina')}</span><span>{g.medina}</span>
        <span>{t('grp.mecca')}</span><span>{g.mecca}</span>
        {g.flights && <><span>{t('grp.flights')}</span><span>{g.flights}</span></>}
      </div>
      {personal && d.chat && <a class="btn sm" href={d.chat} target="_blank" rel="noopener noreferrer">{t('grp.chat')}</a>}
      <p class="muted" style="font-size:.8rem">{tf('grp.upd', { d: d.updated })}{loading.value ? ' · ' + t('grp.loading') : ''}</p>
    </Card>
  )
}

export function MeCard({ d }: { d: AppData }) {
  const m = d.me
  if (!m) return null
  return (
    <Card cls="mint">
      <h2>{tf('grp.hi', { n: m.first || m.name })}</h2>
      <div class="kv">
        <span>{t('grp.room.medina')}</span><span>{m.medina || '—'}{m.matesMedina?.length ? ' · ' + tf('grp.with', { names: m.matesMedina.map(x => x.name).join(', ') }) : ''}</span>
        <span>{t('grp.room.mecca')}</span><span>{m.mecca || '—'}{m.matesMecca?.length ? ' · ' + tf('grp.with', { names: m.matesMecca.map(x => x.name).join(', ') }) : ''}</span>
      </div>
    </Card>
  )
}

export function Points({ d }: { d: AppData }) {
  if (!d.points?.length) return null
  return (
    <Card>
      <h3>{t('grp.points')}</h3>
      <ul class="list">
        {d.points.map((p, i) => (
          <li key={i}><b lang={progLang()}>{p.city}: {p.name}</b><br /><small lang={progLang()}>{p.how}</small>{p.map && <> · <a class="tap44" href={p.map} target="_blank" rel="noopener noreferrer">{t('grp.map')}</a></>}</li>
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
      <h3>{t('grp.sched')}</h3>
      {[...byDay.entries()].map(([k, rows]) => (
        <div key={k} lang={progLang()}>
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
  if (err) return <p class="err" role="alert">{err}</p>
  if (!p) return <Card><div class="sk" /></Card>
  return (
    <>
      <Card>
        <h2 lang={progLang()}>{p.title}</h2>
        <p class="muted" lang={progLang()}>{p.subtitle}</p>
        <p><small><span lang={progLang()}>{p.group}</span> · {tf('grp.ver', { v: p.version, d: p.updated })}</small></p>
      </Card>
      {p.days.map(d => (
        <Card key={d.id} lang={progLang()}>
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
        <h3>{t('grp.incl')}</h3><ul class="list" lang={progLang()}>{p.incl.map((x, i) => <li key={i}>{x}</li>)}</ul>
        <h3>{t('grp.excl')}</h3><ul class="list" lang={progLang()}>{p.excl.map((x, i) => <li key={i}>{x}</li>)}</ul>
        {p.pay_rule && <p class="muted" lang={progLang()}>{p.pay_rule}</p>}
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
      <h3>{t('grp.polls')}</h3>
      {d.polls.map(p => (
        <div class="poll" key={p.id}>
          <p><b>{p.q}</b> <span class={'pill' + (p.open ? '' : ' red')}>{p.status}</span></p>
          <small class="muted">{tf('grp.until', { d: p.endsTxt })} · {tf('grp.voted', { n: p.voted, m: p.total })}{p.quorum ? ' · ' + tf('grp.quorum', { q: p.quorum }) : ''}</small>
          {p.opts.map((o, i) => {
            const n = p.counts ? p.counts[i] : null
            const pct = n != null && p.voted ? Math.round((n / p.voted) * 100) : 0
            return (
              <button type="button" key={i} class={'opt' + (p.mine === i ? ' mine' : '')} onClick={() => cast(p, i)}
                aria-pressed={p.mine === i} aria-disabled={!canVote || !p.open || undefined}>
                <span style="flex:1">{o}</span>
                {n != null && <><span class="bar" aria-hidden="true"><i style={{ width: pct + '%' }} /></span><span class="n">{n}</span></>}
              </button>
            )
          })}
          {p.after && p.open && <small class="muted">{t('grp.after')}</small>}
          {!canVote && <small class="muted">{t('grp.novote')}</small>}
        </div>
      ))}
    </Card>
  )
}

export function useGroupData() {
  useEffect(() => { refresh() }, [code.value, me.value === undefined])
  return data.value
}
