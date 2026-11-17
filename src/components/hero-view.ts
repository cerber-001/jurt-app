/* Что показывает карточка «Сейчас»: чистая логика без разметки (разметка — hero.tsx).
   Пункт программы без названия не ломает экран: вместо пустого заголовка — спокойная подпись гида,
   вместо «12:00 — » — время с местом или ничего. */
import { leftText, slots, stepFor, type Phase } from '../lib/clock'
import { content, type Step } from '../lib/content'
import { hhmm } from '../lib/prayer'
import { done } from '../lib/store'
import { fmtDate, t } from '../lib/i18n'
import type { ProgramItem } from '../lib/program'

type Go = (h: string) => void
type DayPhase = Extract<Phase, { kind: 'day' }>
type BeforePhase = Extract<Phase, { kind: 'before' }>

/** Куда ведут кнопки карточки */
export interface HeroEnv { go: Go; openStep: (id: string) => void }

/** Главная кнопка карточки: одна на экран */
export interface Cta { over: string; title: string; icon?: string; solid: boolean; run: () => void }
/** Что показывает карточка «Сейчас» */
export interface HeroView {
  /** устойчивый id: меняется, только когда наступил другой пункт (а не каждую минуту) — по нему идёт смена с переходом */
  id: string
  kicker: string; title: string; small?: boolean
  /** заголовок — строка программы (она всегда на русском) */
  prog?: boolean
  time?: string; place?: string; note?: string; pay?: string
  cta: Cta
  next?: { over: string; text: string }
}

/** Заголовок длиннее — набираем мельче, чтобы главная кнопка и плитки остались на первом экране */
const LONG_TITLE = 40

const str = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const hm = (m: number) => hhmm(((m % 1440) + 1440) % 1440)
const left = (m: number) => leftText(m, t('today.h'), t('today.m'))

/** Название пункта программы; пустое, из пробелов или отсутствующее — '' */
export function itemTitle(i: Partial<ProgramItem> | null | undefined): string {
  return str(i?.w)
}

/** Строка пункта «10:00 — Таваф»; без названия — с местом; без названия и места — '' */
export function itemLine(i: Partial<ProgramItem> | null | undefined): string {
  const what = itemTitle(i) || str(i?.p)
  if (!what) return ''
  const time = str(i?.t)
  return time ? `${time} — ${what}` : what
}

/** Строка «дальше»: только если есть что показать */
const nextLine = (over: string, i: ProgramItem | undefined) => {
  const text = itemLine(i)
  return text ? { over, text } : undefined
}

export function heroView(ph: Phase, wmin: number, env: HeroEnv): HeroView {
  if (ph.kind === 'before') return beforeView(ph, env)
  if (ph.kind === 'after') return afterView(env)
  return ph.cur === -2 ? restView(ph, wmin, env) : dayView(ph, wmin, env)
}

function beforeView(ph: BeforePhase, { go }: HeroEnv): HeroView {
  const first = slots(ph.first)[0]
  return {
    id: 'before',
    kicker: t('now.before'),
    title: `${ph.days} ${t('now.days')}`,
    place: `${fmtDate(ph.first.date)} · ${ph.first.city}`,
    cta: { over: t('now.getready'), title: t('now.pack'), icon: 'i-plane', solid: true, run: () => go('more/pack') },
    next: nextLine(fmtDate(ph.first.date), first?.i),
  }
}

function afterView({ go }: HeroEnv): HeroView {
  return {
    id: 'after',
    kicker: '', title: t('now.after'), small: true, note: t('now.after2'),
    cta: { over: '', title: t('more.dua'), icon: 'b-dua', solid: false, run: () => go('more/dua') },
  }
}

/** На сегодня всё: показываем, с чего начнётся завтра */
function restView(ph: DayPhase, wmin: number, { go }: HeroEnv): HeroView {
  const tm = ph.tomorrow
  const first = tm ? slots(tm)[0] : undefined
  return {
    id: 'rest:' + ph.day.date,
    kicker: `${hm(wmin)} · ${ph.day.city}`, title: t('now.dayover'), small: true,
    cta: { over: '', title: t('nav.program'), solid: false, run: () => go('program') },
    next: tm ? nextLine(`${t('now.tomorrow')} · ${fmtDate(tm.date)} · ${tm.city}`, first?.i) : undefined,
  }
}

function dayView(ph: DayPhase, wmin: number, env: HeroEnv): HeroView {
  const { list, cur, nxt, min, day } = ph
  const isNow = cur >= 0
  const idx = isNow ? cur : nxt
  const main = list[idx]
  if (!main) return restView(ph, wmin, env)
  const nx = nxt >= 0 ? list[isNow ? nxt : nxt + 1] : undefined
  const own = itemTitle(main.i)
  // без названия шаг умры не угадываем: кнопка ведёт в программу дня
  const step = own ? stepTarget(stepFor(main.i)) : null
  const title = own || t('flow.untitled')
  return {
    id: `${day.date}#${idx}${isNow ? '' : '>'}`,
    kicker: `${isNow ? t('now.now') : t('now.next')} · ${hm(wmin)} · ${day.city}`,
    time: str(main.i.t) ? str(main.i.t) + (isNow ? '' : ` · ${t('now.in')} ${left(main.s - min)}`) : undefined,
    title,
    prog: !!own,
    small: title.length > LONG_TITLE,
    place: [main.i.p, main.i.tr, main.i.who].map(str).filter(Boolean).join(' · '),
    note: str(main.i.m) || undefined,
    pay: str(main.i.pay) || undefined,
    cta: step
      ? { over: t('now.openstep'), title: `${step.num}. ${step.title}`, icon: step.icon, solid: true, run: () => env.openStep(step.id) }
      : { over: '', title: t('now.daybtn'), solid: false, run: () => env.go('program') },
    next: nx ? nextLine(`${t('now.next')} · ${t('now.in')} ${left(nx.s - min)}`, nx.i) : undefined,
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
