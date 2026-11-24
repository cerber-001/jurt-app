/* 2.0 этап 1: экран «Мой путь» — подготовка к умре по макету «Каждый день» (19.11.2026), сверху вниз:
   дата поездки → отсчёт → подготовка по дням → «Харам заранее (3D)» (этап 1а, haram3d-card.tsx) → «Хочу поехать» (если нет группы).
   Дата — из программы группы (только чтение) или указанная вручную (jurt.trip). Расчёты — lib/journey.ts. */
import { useState } from 'preact/hooks'
import { countdown, daysWord, fmtFull, leadText, leadUrl, ownProgram, readTrip, saveTrip, savedProgram, tripOf, type Countdown, type Trip } from '../../lib/journey'
import { kzToday } from '../../lib/today-day'
import { demo } from '../../lib/clock'
import { data, groupCode } from '../../lib/store'
import { t, tf } from '../../lib/i18n'
import { program } from '../today'
import { Card } from '../ui'
import { PrepList } from './journey-prep'
import { Haram3dCard } from './haram3d-card'

type Go = (h: string) => void

/** Дата поездки: из программы — текстом с подписью; вручную — поле даты и «Очистить» */
function DateCard({ trip, manual, set, locked }: { trip: Trip | null; manual: string; set: (v: string) => void; locked: boolean }) {
  if (locked && trip) {
    return (
      <Card cls="jr-date">
        <p class="jr-lbl">{t('jr.date')}</p>
        <p class="jr-dval">{fmtFull(trip.start)}</p>
        <p class="muted"><small>{t('jr.date.prog')}</small></p>
      </Card>
    )
  }
  return (
    <Card cls="jr-date">
      <label class="jr-field">
        <span class="jr-lbl">{t('jr.date')}</span>
        <input type="date" value={manual} aria-describedby="jr-date-hint"
          onChange={e => set((e.target as HTMLInputElement).value)} />
      </label>
      <p class="muted" id="jr-date-hint"><small>{t('jr.date.hint')}</small></p>
      {manual && <button class="linkbtn jr-clear" onClick={() => set('')}>{t('jr.date.clear')}</button>}
    </Card>
  )
}

/** Тёмная карточка отсчёта (как главная карточка «Сейчас») */
function CountCard({ cd, trip, go }: { cd: Countdown; trip: Trip; go: Go }) {
  const fly = tf('jr.cd.fly', { d: fmtFull(trip.start) })
  if (cd.kind === 'before') return (
    <section class="hero jr-count" aria-labelledby="jr-cd-h">
      <p class="hero-k">{t('jr.cd.before')}</p>
      <h2 class="hero-h" id="jr-cd-h">{daysWord(cd.days)}</h2>
      <p class="hero-w">{fly}</p>
    </section>
  )
  if (cd.kind === 'today') return (
    <section class="hero jr-count" aria-labelledby="jr-cd-h">
      <p class="hero-k">{t('jr.cd.today.k')}</p>
      <h2 class="hero-h" id="jr-cd-h">{t('jr.cd.today')}</h2>
      <p class="hero-w">{fly}</p>
    </section>
  )
  if (cd.kind === 'during') return (
    <section class="hero jr-count" aria-labelledby="jr-cd-h">
      <p class="hero-k">{t('jr.cd.during.k')}</p>
      <h2 class="hero-h" id="jr-cd-h">{t('jr.cd.during')}</h2>
      <div class="btns"><button class="btn or" onClick={() => go('now')}>{t('jr.cd.during.go')}</button></div>
    </section>
  )
  return (
    <section class="hero jr-count jr-after" aria-labelledby="jr-cd-h">
      <p class="hero-k">{t('jr.cd.after.k')}</p>
      <h2 class="hero-h" id="jr-cd-h">{t('jr.cd.after')}</h2>
      <p class="hero-w">{t('jr.cd.after.t')}</p>
    </section>
  )
}

/** «Хочу поехать»: WhatsApp с готовым текстом (номер — только из VITE_LEAD_WA); без номера — честное «скоро» */
function Lead({ start }: { start: string }) {
  const [soon, setSoon] = useState(false)
  const url = leadUrl(import.meta.env.VITE_LEAD_WA, leadText(start))
  return (
    <section class="card sand jr-lead-card" aria-labelledby="jr-lead-h">
      <h2 id="jr-lead-h">{t('jr.lead.h')}</h2>
      <p class="muted">{t('jr.lead.t')}</p>
      <div class="btns">
        {url
          ? <a class="btn ghost jr-lead" href={url} target="_blank" rel="noopener noreferrer">{t('jr.lead.btn')}</a>
          : <button class="btn ghost" aria-expanded={soon} aria-controls="jr-soon" onClick={() => setSoon(!soon)}>{t('jr.lead.btn')}</button>}
      </div>
      {!url && <div id="jr-soon" role="status">{soon && <p class="jr-soon-t">{t('jr.lead.soon')}</p>}</div>}
    </section>
  )
}

export function JourneyScreen({ go }: { go: Go }) {
  const [manual, setManual] = useState(readTrip)
  const [saved] = useState(savedProgram)
  const set = (v: string) => { saveTrip(v); setManual(readTrip()) }
  const hasGroup = !!data.value || demo
  const today = kzToday()
  const trip = tripOf(ownProgram(program.value ?? saved, data.value?.group?.code || groupCode.value), hasGroup, manual, today)
  const cd = trip ? countdown(trip.start, trip.end, today) : null
  // программа закончилась — дата снова вводится вручную (для следующей поездки)
  const locked = !!trip?.fromProgram && cd?.kind !== 'after'
  const upcoming = trip && cd && cd.kind !== 'after' ? trip.start : null

  return (
    <>
      <h1 class="sr-only">{t('nav.journey')}</h1>
      <DateCard trip={trip} manual={manual} set={set} locked={locked} />
      {trip && cd
        ? <CountCard cd={cd} trip={trip} go={go} />
        : <Card cls="sand jr-none"><p>{t('jr.cd.none')}</p></Card>}
      <PrepList start={upcoming} go={go} />
      <Haram3dCard />
      {!data.value && <Lead start={upcoming ?? ''} />}
    </>
  )
}
