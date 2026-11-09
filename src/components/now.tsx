/* Ядро «как iPhone»: экран «Сейчас», режим «Рядом» (шаги умры по одному на экран),
   «Программа» (сегодня с подсветкой) и меню «Ещё». Время — clock.ts (с демо ?at=). */
import { useEffect, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import { DayPlan, Today, loadProgram, program, programError, useCity } from './today'
import { DuaList, ModePicker, Steps, ZikrList, useMode } from './guide'
import { Announcement, FullProgram } from './group'
import { Where } from './where'
import { Card, Html, Icon } from './ui'
import { demo, leftText, slots, stepFor, tzOf, useNow, wall, where, type Slot } from '../lib/clock'
import { content, loadContent, type DuaItem } from '../lib/content'
import { cityByName, hhmm, next } from '../lib/prayer'
import { data, done } from '../lib/store'
import { fmtDate, pick, t } from '../lib/i18n'
import type { ProgramDay } from '../lib/program'

/** Открытый в режиме «Рядом» шаг (id) или null */
export const nearby = signal<string | null>(null)

const hm = (m: number) => hhmm(((m % 1440) + 1440) % 1440)
const left = (m: number) => leftText(m, t('today.h'), t('today.m'))

/* ───────── Сейчас ───────── */

export function Now({ go }: { go: (h: string) => void }) {
  useEffect(() => { loadProgram(); loadContent() }, [])
  const p = program.value
  const now = useNow(p)
  const d = data.value
  if (!p) return programError.value ? <p class="err">{programError.value}</p> : <Card><div class="sk" /></Card>
  const ph = where(p, now)
  const day = ph.kind === 'day' ? ph.day : ph.kind === 'before' ? ph.first : ph.last
  const tz = tzOf(day), w = wall(now, tz)

  return (
    <>
      {demo && <p class="demo-chip">{t('now.demo')}: {fmtDate(w.iso)} {hm(w.min)} · UTC{tz >= 0 ? '+' : ''}{tz}</p>}
      {d ? <Announcement d={d} /> : null}

      {ph.kind === 'before' && (
        <Card cls="nowcard">
          <div class="kicker">{t('now.before')}</div>
          <div class="now-big">{ph.days} {t('now.days')}</div>
          <p class="now-w">{fmtDate(ph.first.date)} · {ph.first.city}</p>
          <Upcoming list={slots(ph.first).slice(0, 3)} />
          <p class="muted">{t('now.prepare')}</p>
          <div class="btns"><button class="btn" onClick={() => (nearby.value = 'ghusl')}>{t('now.steps')}</button></div>
        </Card>
      )}

      {ph.kind === 'after' && (
        <Card cls="nowcard">
          <div class="now-big sm">{t('now.after')}</div>
          <p class="muted">{t('now.after2')}</p>
          <div class="btns"><button class="btn ghost" onClick={() => go('program')}>{t('nav.program')}</button>
            <button class="btn ghost" onClick={() => go('more/dua')}>{t('more.dua')}</button></div>
        </Card>
      )}

      {ph.kind === 'day' && <DayNow ph={ph} tz={tz} wmin={w.min} />}

      <PrayerLine day={day} now={now} />

      {!d && <p class="muted"><small>{t('now.nocode')}</small></p>}
    </>
  )
}

function DayNow({ ph, tz, wmin }: { ph: Extract<ReturnType<typeof where>, { kind: 'day' }>; tz: number; wmin: number }) {
  const { list, cur, nxt, min, tomorrow, day } = ph
  void tz
  if (cur === -2) {
    return (
      <Card cls="nowcard">
        <div class="kicker">{hm(wmin)} · {day.city}</div>
        <div class="now-big sm">{t('now.dayover')}</div>
        {tomorrow && <>
          <p class="now-w"><b>{t('now.tomorrow')}</b> · {fmtDate(tomorrow.date)} · {tomorrow.city}</p>
          <Upcoming list={slots(tomorrow).slice(0, 3)} />
        </>}
      </Card>
    )
  }
  const main: Slot | undefined = cur >= 0 ? list[cur] : list[nxt]
  const isNow = cur >= 0
  const nx = isNow && nxt >= 0 ? list[nxt] : !isNow && nxt >= 0 ? list[nxt + 1] : undefined
  const step = main ? stepFor(main.i) : null
  return (
    <Card cls="nowcard">
      <div class="kicker">{isNow ? t('now.now') : t('now.next')} · {hm(wmin)} · {day.city}</div>
      {main && <>
        <div class="now-t">{main.i.t}{!isNow && <small> · {t('now.in')} {left(main.s - min)}</small>}</div>
        <div class="now-big">{main.i.w}</div>
        {(main.i.p || main.i.tr || main.i.who) && <p class="now-w">{[main.i.p, main.i.tr, main.i.who].filter(Boolean).join(' · ')}</p>}
        {main.i.m && <p class="now-m">{main.i.m}</p>}
        {main.i.pay && <p class="pay">{main.i.pay}</p>}
      </>}
      {step && <MomentDua id={step} />}
      {nx && (
        <div class="now-next">
          <span class="kicker">{t('now.next')} · {t('now.in')} {left(nx.s - min)}</span>
          <div><b>{nx.i.t}</b> — {nx.i.w}</div>
        </div>
      )}
    </Card>
  )
}

/** Дуа момента + кнопка «Шаги рядом» */
function MomentDua({ id }: { id: string }) {
  const c = content.value
  const s = c?.steps.find(x => x.id === id)
  if (!s) return null
  const du = s.dua?.[0]
  return (
    <div class="moment">
      {du && <DuaBlock d={du} />}
      <button class="btn or" onClick={() => (nearby.value = id)}><Icon id={s.icon} size={22} /> {s.num}. {s.title} — {t('now.steps').toLowerCase()}</button>
    </div>
  )
}

function DuaBlock({ d }: { d: DuaItem }) {
  return (
    <div class="dua">
      {d.label && <div class="lbl">{d.label}</div>}
      {d.ar && <div class="ar" dir="rtl" lang="ar">{d.ar}</div>}
      {d.tr && <div class="tr">{d.tr}</div>}
      {d.ru && <div class="ru">{d.ru}</div>}
      {d.src && <div class="src">{d.src}</div>}
    </div>
  )
}

function Upcoming({ list }: { list: Slot[] }) {
  return <div class="prog">{list.map((x, k) => <><span class="t" key={'t' + k}>{x.i.t}</span><span key={'w' + k}>{x.i.w}</span></>)}</div>
}

function PrayerLine({ day, now }: { day: ProgramDay; now: Date }) {
  // в «Сейчас» город — всегда по программе дня (ручной выбор мог остаться с прошлого раза)
  const city = cityByName(day.city) || useCity(day)
  const nx = next(now, city.lat, city.lon, city.tz, city.method)
  if (!nx) return null
  return (
    <Card cls="mint">
      <p class="now" style="margin:0"><span class="kicker">{t('now.prayer')} · {pick(city.names)}</span><br />
        <b>{t('p.' + nx.key)}</b> {hhmm(nx.min)} · {t('now.in')} {left(nx.left)}</p>
    </Card>
  )
}

/* ───────── Режим «Рядом» ───────── */

export function Nearby() {
  const id = nearby.value
  const c = content.value
  const [more, setMore] = useState(false)
  useEffect(() => { setMore(false) }, [id])
  useEffect(() => {
    if (!id) return
    loadContent()
    const html = document.documentElement, was = html.style.overflow
    html.style.overflow = 'hidden'
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') nearby.value = null }
    addEventListener('keydown', esc)
    return () => { html.style.overflow = was; removeEventListener('keydown', esc) }
  }, [id])
  if (!id) return null
  if (!c) return <div class="near"><div class="sk" /></div>
  const k = Math.max(0, c.steps.findIndex(s => s.id === id))
  const s = c.steps[k], total = c.steps.length
  const mark = () => { done.value = { ...done.value, [s.id]: true } }
  const goTo = (j: number) => { nearby.value = c.steps[j].id; document.querySelector('.near')?.scrollTo(0, 0) }
  return (
    <div class="near" role="dialog" aria-modal="true" aria-label={s.title}>
      <div class="near-top">
        <span class="near-n">{s.num} {t('step.of')} {total}{done.value[s.id] ? ' ✓' : ''}</span>
        <button class="btn ghost sm" onClick={() => (nearby.value = null)}>{t('step.close')} ✕</button>
      </div>
      <div class="near-ico"><Icon id={s.icon} size={56} /></div>
      <h1 class="near-h">{s.title}</h1>
      <p class="near-lead">{s.lead}</p>
      {s.dua?.map((d, i) => <DuaBlock d={d} key={i} />)}
      <button class="btn ghost sm" onClick={() => setMore(!more)} aria-expanded={more}>{t('step.more')} {more ? '▴' : '▾'}</button>
      {more && <Html html={s.html} cls="near-more" />}
      <div class="near-bar">
        <button class="btn ghost" disabled={k === 0} onClick={() => goTo(k - 1)}>← {t('step.prev')}</button>
        {k < total - 1
          ? <button class="btn" onClick={() => { mark(); goTo(k + 1) }}>{t('step.next')} →</button>
          : <button class="btn or" onClick={() => { mark(); nearby.value = null }}>{t('step.finish')} ✓</button>}
      </div>
    </div>
  )
}

/* ───────── Программа ───────── */

export function ProgramNow() {
  useEffect(() => { loadProgram() }, [])
  const p = program.value
  const now = useNow(p)
  if (!p) return programError.value ? <p class="err">{programError.value}</p> : <Card><div class="sk" /></Card>
  const ph = where(p, now)
  return (
    <>
      {ph.kind === 'day' && (
        <Card cls="sand">
          <h2>{t('now.today')}</h2>
          <div class="day-h"><b>{fmtDate(ph.day.date)}</b><small>{ph.day.city}{ph.day.title ? ' · ' + ph.day.title : ''}</small></div>
          <div class="plist">
            {ph.list.map((x, k) => (
              <div key={k} class={'pr' + (k === ph.cur ? ' cur' : '') + (ph.cur !== -2 && k < ph.cur || ph.cur === -2 ? ' past' : '')}>
                <span class="t">{x.i.t}</span>
                <span>{x.i.w}{x.i.p ? <small class="muted"> · {x.i.p}</small> : null}{x.i.pay ? <span class="pay"> · {x.i.pay}</span> : null}
                  {x.i.m ? <div class="muted"><small>{x.i.m}</small></div> : null}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {ph.kind === 'before' && <Card cls="sand"><h2>{t('now.before')} · {ph.days} {t('now.days')}</h2><DayPlan day={ph.first} /></Card>}
      <h2 style="margin:1.2rem .2rem .4rem">{t('now.allprog')}</h2>
      <FullProgram />
    </>
  )
}

/* ───────── Ещё ───────── */

const MORE: [string, string, string][] = [
  ['umra', 'more.umra', 'b-tawaf'],
  ['dua', 'more.dua', 'b-dua'],
  ['zikr', 'more.zikr', 'b-prayer-mat'],
  ['prayer', 'more.prayer', 'b-mihrab'],
  ['where', 'more.where', 'b-pilgrim'],
]

export function More({ sub, go }: { sub: string; go: (h: string) => void }) {
  const mode = useMode()
  const d = data.value
  if (sub) {
    return (
      <>
        <button class="btn ghost sm back" onClick={() => go('more')}>{t('more.back')}</button>
        {sub === 'umra' && <><button class="btn or" style="margin-bottom:.8rem" onClick={() => (nearby.value = 'ghusl')}>{t('now.steps')}</button>
          <ModePicker mode={mode.value} set={m => (mode.value = m)} /><Steps mode={mode.value} canCheck /></>}
        {sub === 'dua' && <DuaList extra={d?.extra} />}
        {sub === 'zikr' && <ZikrList />}
        {sub === 'prayer' && <Today />}
        {sub === 'where' && <Where />}
      </>
    )
  }
  return (
    <div class="more-list">
      {MORE.map(([id, key, ico]) => (
        <button key={id} class="more-row" onClick={() => go('more/' + id)}><Icon id={ico} size={30} /><span>{t(key)}</span><i>›</i></button>
      ))}
      <a class="more-row" href="https://umra.jurt.kz/haram3d/" target="_blank" rel="noopener"><Icon id="i-dome" size={30} /><span>{t('more.haram')}</span><i>↗</i></a>
    </div>
  )
}
