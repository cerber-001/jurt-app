/* Блоки гида умры из JSON-контента: режим, шаги с отметками, дуа, зикр. Общие для паломника и устаза. */
import { useEffect, useState } from 'preact/hooks'
import { useSignal } from '@preact/signals'
import { content, contentError, loadContent, type Dua, type Step, type Zikr } from '../lib/content'
import { done, ls, toggleDone } from '../lib/store'
import { Card, Html, Icon } from './ui'
import { pick, t, tf } from '../lib/i18n'
import { Notes } from './notes'

type Mode = 'first' | 'again' | 'mecca'
const modeLS = 'jurt.mode'
export function useMode() {
  const m = useSignal<Mode>(((() => { try { return localStorage.getItem(modeLS) } catch { return null } })() as Mode) || 'first')
  useEffect(() => {
    document.documentElement.dataset.mode = m.value
    try { localStorage.setItem(modeLS, m.value) } catch { /* приватный режим */ }
  }, [m.value])
  return m
}

export function useContent() {
  useEffect(() => { loadContent() }, [])
  return content.value
}

export function ModePicker({ mode, set }: { mode: Mode; set: (m: Mode) => void }) {
  const c = useContent()
  if (!c) return null
  return (
    <Card>
      <div class="modeq">
        <div class="kicker">{t('path.kind')}?</div>
        <div class="btns">
          {c.modes.kinds.map(k => (
            <button key={k.id} class={'btn ghost' + (mode === k.id ? ' sel' : '')} aria-pressed={mode === k.id} onClick={() => set(k.id)}>
              {k.title}<small>{k.hint}</small>
            </button>
          ))}
        </div>
        {c.modes.details.map(d => (
          <details key={d.id}><summary>{d.title}</summary><Html html={d.html} /></details>
        ))}
      </div>
    </Card>
  )
}

export function StepCard({ s, mode, canCheck }: { s: Step; mode: Mode; canCheck: boolean }) {
  const [open, setOpen] = useState(false)
  const isDone = !!done.value[s.id]
  const kick = s.kicker ? (mode === 'mecca' ? s.kicker.mecca || s.kicker.first : s.kicker.first || s.kicker.mecca) : ''
  return (
    <section class={'acc step' + (open ? ' open' : '') + (isDone ? ' done' : '')} data-id={s.id}>
      <div class="acc-h">
        <button type="button" class="acc-t" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span class="num"><Icon id={s.icon} size={26} /><i>{s.num}</i></span>
          <span class="st">
            {kick && <span class="kicker">{kick}</span>}
            <b>{s.title}</b>
          </span>
        </button>
        {canCheck && (
          <button type="button" class="chk" aria-pressed={isDone} aria-label={t('path.check') + ': ' + s.title}
            onClick={() => toggleDone(s.id)}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" stroke-width="2.5" /></svg>
          </button>
        )}
      </div>
      {open && (
        <div class="acc-b"><div class="acc-wrap"><div class="acc-in">
          <Html html={s.html} />
          <Notes id={'step:' + s.id} />
          {canCheck && <button class="donebtn" onClick={() => toggleDone(s.id)}>{isDone ? t('step.done') : t('step.idid')}</button>}
        </div></div></div>
      )}
    </section>
  )
}

export function Steps({ mode, canCheck }: { mode: Mode; canCheck: boolean }) {
  const c = useContent()
  if (contentError.value) return <p class="err" role="alert">{contentError.value}</p>
  if (!c) return <Card><div class="sk" /></Card>
  const howto = c.info.find(i => i.id === 'howto')
  const bans = c.info.find(i => i.id === 'ihram-bans')
  const total = c.steps.length, n = c.steps.filter(s => done.value[s.id]).length
  return (
    <>
      {canCheck && <p class="muted" style="margin:.2rem 0 .6rem">{tf('step.count', { n, m: total })}</p>}
      {howto && <details class="acc info blue"><summary class="acc-h"><div class="num"><Icon id={howto.icon} size={26} /></div><div class="st"><b>{howto.title}</b></div></summary><div class="acc-in"><Html html={howto.html} /></div></details>}
      {c.steps.map(s => (
        <>
          <StepCard key={s.id} s={s} mode={mode} canCheck={canCheck} />
          {s.id === 'talbiya' && bans && (
            <details class="acc info"><summary class="acc-h"><div class="num"><Icon id={bans.icon} size={26} /></div><div class="st"><b>{bans.title}</b></div></summary><div class="acc-in"><Html html={bans.html} /></div></details>
          )}
        </>
      ))}
    </>
  )
}

export function DuaCard({ d }: { d: Dua }) {
  const [open, setOpen] = useState(false)
  return (
    <section class={'acc dq' + (open ? ' open' : '')}>
      <button type="button" class="acc-h acc-t" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span class="ico"><Icon id={d.icon} size={24} /></span>
        <span class="st"><b>{d.title}</b>{!open && <span class="pv">{d.preview}</span>}</span>
      </button>
      {open && <div class="acc-b"><div class="acc-wrap"><div class="acc-in"><Html html={d.html} /><Notes id={'dua:' + d.id} /></div></div></div>}
    </section>
  )
}

export function DuaList({ extra }: { extra?: { when: string; title: string; ar: string; tr: string; ru: string; src: string }[] }) {
  const c = useContent()
  if (!c) return <Card><div class="sk" /></Card>
  return (
    <>
      {extra && extra.length > 0 && (
        <Card cls="sand">
          <h2 class="as-h3">{t('dua.mentor')}</h2>
          {extra.map((e, i) => (
            <div class="dua" key={i}>
              <div class="lbl">{e.when} · {e.title}</div>
              {e.ar && <div class="ar" dir="rtl" lang="ar">{e.ar}</div>}
              {e.tr && <div class="tr">{e.tr}</div>}
              {e.ru && <div class="ru">{e.ru}</div>}
              {e.src && <div class="src">{e.src}</div>}
            </div>
          ))}
        </Card>
      )}
      {c.dua.map(d => <DuaCard key={d.id} d={d} />)}
    </>
  )
}

export function ZikrList() {
  const c = useContent()
  if (!c) return <Card><div class="sk" /></Card>
  return (
    <>
      {c.zikr.map((z: Zikr) => (
        <Card key={z.id} cls="zk">
          <h2>{pick(z.n)}{z.goal ? <span class="pill">{z.goal}×</span> : null}</h2>
          {(z.ph ?? [{ ar: String(z.ar ?? ''), tr: String(z.tr ?? ''), ru: String(z.ru ?? '') }]).map((p, i) => (
            <div class="ph" key={i}>
              <div class="ar" dir="rtl" lang="ar">{p.ar}</div>
              <div class="tr">{p.tr}</div>
              <div class="ru">{p.ru}</div>
            </div>
          ))}
          {z.goal ? <ZikrTap id={z.id} goal={+z.goal} /> : null}
          {z.h && <p class="muted">{String(z.h)}</p>}
          {z.src && <div class="src">{String(z.src)}</div>}
          <Notes id={'zikr:' + z.id} />
        </Card>
      ))}
    </>
  )
}

/** Тап-счётчик зикра: n/цель, вибрация, хранится на устройстве (jurt.zk-<id>) */
function ZikrTap({ id, goal }: { id: string; goal: number }) {
  const key = 'jurt.zk-' + id
  const [n, setN] = useState(() => +ls.get(key) || 0)
  const put = (v: number) => { setN(v); ls.set(key, v ? String(v) : '') }
  const tap = () => { const v = n + 1; navigator.vibrate?.(v % goal === 0 ? [70, 50, 140] : 25); put(v) }
  return (
    <div class="crow zktap">
      <button class="zkbtn" onClick={tap} aria-label={`${t('zk.plus')} · ${n} / ${goal}`}>{n}<small>/{goal}</small></button>
      <button onClick={() => put(Math.max(0, n - 1))} disabled={!n} aria-label={'− 1, ' + t('zk.minus')}>− 1</button>
      <button onClick={() => put(0)} disabled={!n} aria-label={'0, ' + t('zk.zero')}>0</button>
      <span class="sr-only" aria-live="polite" aria-atomic="true">{n} / {goal}</span>
    </div>
  )
}
