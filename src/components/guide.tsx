/* Блоки гида умры из JSON-контента: режим, шаги с отметками, дуа, зикр. Общие для паломника и устаза. */
import { useEffect, useState } from 'preact/hooks'
import { useSignal } from '@preact/signals'
import { content, contentError, loadContent, type Dua, type Step, type Zikr } from '../lib/content'
import { done, toggleDone } from '../lib/store'
import { Card, Html, Icon } from './ui'

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
        <div class="kicker">Какая у вас умра?</div>
        <div class="btns">
          {c.modes.kinds.map(k => (
            <button key={k.id} class={'btn ghost' + (mode === k.id ? ' sel' : '')} onClick={() => set(k.id)}>
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
      <div class="acc-h" onClick={() => setOpen(!open)} role="button" aria-expanded={open}>
        <div class="num"><Icon id={s.icon} size={26} /><i>{s.num}</i></div>
        <div class="st">
          {kick && <div class="kicker">{kick}</div>}
          <b>{s.title}</b>
        </div>
        {canCheck && (
          <button class="chk" aria-label={isDone ? 'Снять отметку' : 'Отметить выполненным'}
            onClick={e => { e.stopPropagation(); toggleDone(s.id) }}>
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" stroke-width="2.5" /></svg>
          </button>
        )}
      </div>
      {open && (
        <div class="acc-b"><div class="acc-wrap"><div class="acc-in">
          <Html html={s.html} />
          {canCheck && <button class="donebtn" onClick={() => toggleDone(s.id)}>{isDone ? 'Выполнено ✓' : 'Выполнил(а)'}</button>}
        </div></div></div>
      )}
    </section>
  )
}

export function Steps({ mode, canCheck }: { mode: Mode; canCheck: boolean }) {
  const c = useContent()
  if (contentError.value) return <p class="err">{contentError.value}</p>
  if (!c) return <Card><div class="sk" /></Card>
  const howto = c.info.find(i => i.id === 'howto')
  const bans = c.info.find(i => i.id === 'ihram-bans')
  const total = c.steps.length, n = c.steps.filter(s => done.value[s.id]).length
  return (
    <>
      {canCheck && <p class="muted" style="margin:.2rem 0 .6rem">Выполнено {n} из {total}</p>}
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
      <div class="acc-h" onClick={() => setOpen(!open)} role="button" aria-expanded={open}>
        <div class="ico"><Icon id={d.icon} size={24} /></div>
        <div class="st"><b>{d.title}</b>{!open && <span class="pv">{d.preview}</span>}</div>
      </div>
      {open && <div class="acc-b"><div class="acc-wrap"><div class="acc-in"><Html html={d.html} /></div></div></div>}
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
          <h3>От наставника группы</h3>
          {extra.map((e, i) => (
            <div class="dua" key={i}>
              <div class="lbl">{e.when} · {e.title}</div>
              {e.ar && <div class="ar" dir="rtl">{e.ar}</div>}
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
          <h2>{z.n.ru}{z.goal ? <span class="pill">{z.goal}×</span> : null}</h2>
          {(z.ph ?? [{ ar: String(z.ar ?? ''), tr: String(z.tr ?? ''), ru: String(z.ru ?? '') }]).map((p, i) => (
            <div class="ph" key={i}>
              <div class="ar" dir="rtl">{p.ar}</div>
              <div class="tr">{p.tr}</div>
              <div class="ru">{p.ru}</div>
            </div>
          ))}
          {z.h && <p class="muted">{String(z.h)}</p>}
          {z.src && <div class="src">{String(z.src)}</div>}
        </Card>
      ))}
    </>
  )
}
