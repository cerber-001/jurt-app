/* Экран «Сейчас»: одна большая карточка с одним главным действием и три быстрые плитки под ней.
   Здесь же «Программа» (сегодня с подсветкой) и меню «Ещё». Время — clock.ts (с демо ?at=). */
import { useEffect } from 'preact/hooks'
import { PackList, Stories } from './extras'
import { DayPlan, SavedNote, Today, loadProgram, program, programError, useCity } from './today'
import { DuaList, ZikrList } from './guide'
import { Announcement, FullProgram } from './group'
import { lostOpen } from './lost'
import { nearby } from './nearby'
import { Where } from './where'
import { InstallGuide, InstallHint } from './install'
import { Card, Glyph, Icon } from './ui'
import { demo, leftText, slots, stepFor, tzOf, useNow, wall, where, type Phase } from '../lib/clock'
import { content, loadContent, type Step } from '../lib/content'
import { cityByName, hhmm, next } from '../lib/prayer'
import { data, done } from '../lib/store'
import { fmtDate, progLang, t } from '../lib/i18n'
import type { ProgramDay, ProgramItem } from '../lib/program'

type Go = (h: string) => void
type DayPhase = Extract<Phase, { kind: 'day' }>
type BeforePhase = Extract<Phase, { kind: 'before' }>

/** Главная кнопка карточки: одна на экран */
interface Cta { over: string; title: string; icon?: string; solid: boolean; run: () => void }
/** Что показывает карточка «Сейчас» */
interface HeroView {
  kicker: string; title: string; small?: boolean
  /** заголовок — строка программы (она всегда на русском) */
  prog?: boolean
  time?: string; place?: string; note?: string; pay?: string
  cta: Cta
  next?: { over: string; text: string }
}

/** Заголовок длиннее — набираем мельче, чтобы главная кнопка и плитки остались на первом экране */
const LONG_TITLE = 40

const hm = (m: number) => hhmm(((m % 1440) + 1440) % 1440)
const left = (m: number) => leftText(m, t('today.h'), t('today.m'))
const line = (i: ProgramItem) => `${i.t} — ${i.w}`

/* ───────── Сейчас ───────── */

export function Now({ go }: { go: Go }) {
  useEffect(() => { loadProgram(); loadContent() }, [])
  const p = program.value
  const now = useNow(p)
  const d = data.value
  if (!p) return programError.value ? <p class="err" role="alert">{programError.value}</p> : <Card><div class="sk" /></Card>
  const ph = where(p, now)
  const day = ph.kind === 'day' ? ph.day : ph.kind === 'before' ? ph.first : ph.last
  const tz = tzOf(day), w = wall(now, tz)

  return (
    <>
      {demo && <p class="demo-chip">{t('now.demo')}: {fmtDate(w.iso)} {hm(w.min)} · UTC{tz >= 0 ? '+' : ''}{tz}</p>}
      {d ? <Announcement d={d} /> : null}
      <Hero v={heroView(ph, w.min, go)} go={go} />
      <Quick day={day} now={now} go={go} />
      <SavedNote />
      <InstallHint go={go} />
      {!d && <p class="muted"><small>{t('now.nocode')}</small></p>}
    </>
  )
}

function heroView(ph: Phase, wmin: number, go: Go): HeroView {
  if (ph.kind === 'before') return beforeView(ph, go)
  if (ph.kind === 'after') return afterView(go)
  return ph.cur === -2 ? restView(ph, wmin, go) : dayView(ph, wmin, go)
}

function beforeView(ph: BeforePhase, go: Go): HeroView {
  const first = slots(ph.first)[0]
  return {
    kicker: t('now.before'),
    title: `${ph.days} ${t('now.days')}`,
    place: `${fmtDate(ph.first.date)} · ${ph.first.city}`,
    cta: { over: t('now.getready'), title: t('now.pack'), icon: 'i-plane', solid: true, run: () => go('more/pack') },
    next: first ? { over: fmtDate(ph.first.date), text: line(first.i) } : undefined,
  }
}

function afterView(go: Go): HeroView {
  return {
    kicker: '', title: t('now.after'), small: true, note: t('now.after2'),
    cta: { over: '', title: t('more.dua'), icon: 'b-dua', solid: false, run: () => go('more/dua') },
  }
}

/** На сегодня всё: показываем, с чего начнётся завтра */
function restView(ph: DayPhase, wmin: number, go: Go): HeroView {
  const tm = ph.tomorrow
  const first = tm ? slots(tm)[0] : undefined
  return {
    kicker: `${hm(wmin)} · ${ph.day.city}`, title: t('now.dayover'), small: true,
    cta: { over: '', title: t('nav.program'), solid: false, run: () => go('program') },
    next: tm && first ? { over: `${t('now.tomorrow')} · ${fmtDate(tm.date)} · ${tm.city}`, text: line(first.i) } : undefined,
  }
}

function dayView(ph: DayPhase, wmin: number, go: Go): HeroView {
  const { list, cur, nxt, min, day } = ph
  const isNow = cur >= 0
  const main = isNow ? list[cur] : list[nxt]
  if (!main) return restView(ph, wmin, go)
  const nx = nxt >= 0 ? list[isNow ? nxt : nxt + 1] : undefined
  const step = stepTarget(stepFor(main.i))
  return {
    kicker: `${isNow ? t('now.now') : t('now.next')} · ${hm(wmin)} · ${day.city}`,
    time: main.i.t + (isNow ? '' : ` · ${t('now.in')} ${left(main.s - min)}`),
    title: main.i.w,
    prog: true,
    small: main.i.w.length > LONG_TITLE,
    place: [main.i.p, main.i.tr, main.i.who].filter(Boolean).join(' · '),
    note: main.i.m,
    pay: main.i.pay,
    cta: step
      ? { over: t('now.openstep'), title: `${step.num}. ${step.title}`, icon: step.icon, solid: true, run: () => { nearby.value = step.id } }
      : { over: '', title: t('now.daybtn'), solid: false, run: () => go('program') },
    next: nx ? { over: `${t('now.next')} · ${t('now.in')} ${left(nx.s - min)}`, text: line(nx.i) } : undefined,
  }
}

/** Шаг умры для пункта программы: первый ещё не отмеченный, начиная с найденного */
function stepTarget(id: string | null): Step | null {
  const steps = content.value?.steps
  if (!id || !steps) return null
  const from = steps.findIndex(s => s.id === id)
  if (from < 0) return null
  return steps.slice(from).find(s => !done.value[s.id]) ?? steps[from]
}

function Hero({ v, go }: { v: HeroView; go: Go }) {
  const c = v.cta
  const pl = progLang()
  return (
    <section class="hero">
      {v.kicker && <div class="hero-k">{v.kicker}</div>}
      {v.time && <div class="hero-t">{v.time}</div>}
      <h1 class={'hero-h' + (v.small ? ' sm' : '')} lang={v.prog ? pl : undefined}>{v.title}</h1>
      {v.place && <p class="hero-w" lang={pl}>{v.place}</p>}
      {v.note && <p class="hero-m" lang={pl}>{v.note}</p>}
      {v.pay && <p class="hero-m pay" lang={pl}>{v.pay}</p>}
      <button class={'cta' + (c.solid ? ' solid' : '')} onClick={c.run}>
        {c.icon && <Icon id={c.icon} size={34} />}
        <span>{c.over && <small>{c.over}</small>}<b>{c.title}</b></span>
        <i aria-hidden="true">›</i>
      </button>
      {v.next && (
        <button class="hero-next" onClick={() => go('program')}>
          <span><small>{v.next.over}</small><span lang={pl}>{v.next.text}</span></span>
          <i aria-hidden="true">›</i>
        </button>
      )}
    </section>
  )
}

/** Три быстрые плитки: намаз, дуа, «я потерялся» */
function Quick({ day, now, go }: { day: ProgramDay; now: Date; go: Go }) {
  // город — всегда по программе дня (ручной выбор мог остаться с прошлого раза)
  const city = cityByName(day.city) || useCity(day)
  const nx = next(now, city.lat, city.lon, city.tz, city.method)
  return (
    <div class="quick">
      <button class="qt" onClick={() => go('more/prayer')}>
        <Icon id="b-mihrab" size={28} />
        <b>{nx ? `${t('p.' + nx.key)} ${hhmm(nx.min)}` : t('now.prayer')}</b>
        {nx && <small>{t('now.in')} {left(nx.left)}</small>}
      </button>
      <button class="qt" onClick={() => go('more/dua')}>
        <Icon id="b-dua" size={28} />
        <b>{t('more.dua')}</b>
      </button>
      <button class="qt sos" onClick={() => { lostOpen.value = true }}>
        <Icon id="b-pilgrim" size={28} />
        <b>{t('lost.btn')}</b>
      </button>
    </div>
  )
}

/* ───────── Программа ───────── */

export function ProgramNow() {
  useEffect(() => { loadProgram() }, [])
  const p = program.value
  const now = useNow(p)
  if (!p) return programError.value ? <p class="err" role="alert">{programError.value}</p> : <Card><div class="sk" /></Card>
  const ph = where(p, now)
  const pl = progLang()
  return (
    <>
      <SavedNote />
      {ph.kind === 'day' && (
        <Card cls="sand">
          <h2>{t('now.today')}</h2>
          <div class="day-h"><b>{fmtDate(ph.day.date)}</b><small lang={pl}>{ph.day.city}{ph.day.title ? ' · ' + ph.day.title : ''}</small></div>
          <div class="plist" lang={pl}>
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
      <div lang={pl}><FullProgram /></div>
    </>
  )
}

/* ───────── Ещё ───────── */

const MORE: [string, string, string][] = [
  ['dua', 'more.dua', 'b-dua'],
  ['zikr', 'more.zikr', 'b-prayer-mat'],
  ['prayer', 'more.prayer', 'b-mihrab'],
  ['where', 'more.where', 'b-pilgrim'],
  ['pack', 'more.pack', 'i-plane'],
  ['stories', 'more.stories', 'i-voice'],
]

/** Подразделы без видимого h1 — скрытый заголовок для чтеца (у сборов, историй и «экрана Домой» h1 свой) */
const SUB_H1: Record<string, string> = { dua: 'more.dua', zikr: 'more.zikr', prayer: 'more.prayer', where: 'more.where' }

export function More({ sub, go }: { sub: string; go: Go }) {
  const d = data.value
  if (sub) {
    return (
      <>
        <button class="btn ghost sm back" onClick={() => go('more')}><span aria-hidden="true">←</span> {t('more.back')}</button>
        {SUB_H1[sub] && <h1 class="sr-only">{t(SUB_H1[sub])}</h1>}
        {sub === 'dua' && <DuaList extra={d?.extra} />}
        {sub === 'zikr' && <ZikrList />}
        {sub === 'prayer' && <Today />}
        {sub === 'where' && <Where />}
        {sub === 'pack' && <PackList />}
        {sub === 'stories' && <Stories />}
        {sub === 'install' && <InstallGuide />}
      </>
    )
  }
  return (
    <div class="more-list">
      <h1 class="sr-only">{t('nav.more')}</h1>
      <button class="more-row" onClick={() => go('program')}><Glyph id="list" size={30} /><span>{t('nav.program')}</span><i aria-hidden="true">›</i></button>
      {MORE.map(([id, key, ico]) => (
        <button key={id} class="more-row" onClick={() => go('more/' + id)}><Icon id={ico} size={30} /><span>{t(key)}</span><i aria-hidden="true">›</i></button>
      ))}
      <button class="more-row" onClick={() => go('more/install')}><Icon id="i-door" size={30} /><span>{t('more.install')}</span><i aria-hidden="true">›</i></button>
      <a class="more-foot" href="/roles">{t('more.roles')}</a>
    </div>
  )
}
