/* Экран «Сейчас»: одна большая карточка с одним главным действием и три быстрые плитки под ней.
   Здесь же «Программа» (сегодня с подсветкой) и меню «Ещё». Время — clock.ts (с демо ?at=);
   экран перерисовывается ровно на смене минуты (tick.ts), поэтому часы и «через N мин» до намаза идут живо.
   Что в карточке — hero-view.ts, как она выглядит и сменяется — hero.tsx. */
import { useEffect } from 'preact/hooks'
import { PackList, Stories } from './extras'
import { DayPlan, SavedNote, Today, loadProgram, program, programError, useCity } from './today'
import { DuaList, ZikrList } from './guide'
import { Announcement, FullProgram } from './group'
import { isFresh } from '../lib/announce'
import { lostOpen } from './lost'
import { nearby } from './nearby'
import { Where } from './where'
import { InstallGuide, InstallHint } from './install'
import { Card, Glyph, Icon } from './ui'
import { Hero } from './hero'
import { heroView, type HeroEnv } from './hero-view'
import { demo, leftText, tzOf, useNow, wall, where } from '../lib/clock'
import { loadContent } from '../lib/content'
import { cityByName, hhmm, next } from '../lib/prayer'
import { dayPart, type DayPart } from '../lib/daypart'
import { floorMinute, useMinuteTick } from '../lib/tick'
import { data } from '../lib/store'
import { fmtDate, progLang, t } from '../lib/i18n'
import type { ProgramDay } from '../lib/program'

type Go = (h: string) => void

const hm = (m: number) => hhmm(((m % 1440) + 1440) % 1440)
const left = (m: number) => leftText(m, t('today.h'), t('today.m'))

/** Текущее время с точностью до минуты; компонент сам перерисуется на следующей минуте */
function useMinuteNow(raw: Date): Date {
  useMinuteTick(raw)
  return floorMinute(raw)
}

/* ───────── Сейчас ───────── */

const ANN_ID = 'ann-full'

/** Свежее объявление — строкой над главной карточкой; нажатие прокручивает к полному тексту ниже */
function FreshAnnouncement({ text }: { text: string }) {
  const show = () => document.getElementById(ANN_ID)?.scrollIntoView({ block: 'center' })
  return (
    <div class="a2hs-hint ann-new">
      <button class="a2hs-go" onClick={show}>
        <span><b>{t('ann.new')}</b><span class="ann-new-t" lang={progLang()}>{text}</span></span>
        <i aria-hidden="true">›</i>
      </button>
    </div>
  )
}

export function Now({ go }: { go: Go }) {
  useEffect(() => { loadProgram(); loadContent() }, [])
  const p = program.value
  const now = useMinuteNow(useNow(p))
  const d = data.value
  const ann = d?.announcement?.text ? d.announcement : null
  if (!p) return programError.value ? <p class="err" role="alert">{programError.value}</p> : <Card><div class="sk" /></Card>
  const ph = where(p, now)
  const day = ph.kind === 'day' ? ph.day : ph.kind === 'before' ? ph.first : ph.last
  const tz = tzOf(day), w = wall(now, tz)
  const city = cityByName(day.city)
  const part: DayPart = city ? dayPart(now, w.min, city) : 'day'
  const env: HeroEnv = { go, openStep: id => { nearby.value = id } }

  return (
    <>
      {demo && <p class="demo-chip">{t('now.demo')}: {fmtDate(w.iso)} {hm(w.min)} · UTC{tz >= 0 ? '+' : ''}{tz}</p>}
      {ann && isFresh(ann.at, now) && <FreshAnnouncement text={ann.text} />}
      <Hero v={heroView(ph, w.min, env)} part={part} go={go} />
      {/* всё под карточкой — одним слоем: при смене пункта он плавно переезжает вслед за высотой карточки */}
      <div class="now-below">
        {/* полное объявление — под главной карточкой: иначе на телефоне оно выталкивает «Открыть шаг» под нижнее меню */}
        {d && ann ? <div id={ANN_ID}><Announcement d={d} /></div> : null}
        <Quick day={day} now={now} go={go} />
        <SavedNote />
        <InstallHint go={go} />
        {!d && <p class="muted"><small>{t('now.nocode')}</small></p>}
      </div>
    </>
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
  const now = useMinuteNow(useNow(p))
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
