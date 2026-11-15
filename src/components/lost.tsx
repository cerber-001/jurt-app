/* «Я потерялся»: спокойный экран поверх всего. Одно главное действие — написать в чат группы;
   ниже — позвонить соседу по комнате, показать себя на карте группы, место сбора и отель.
   Показываем только то, что пришло с сервера: телефона руководителя в данных пока нет. */
import { useEffect, useRef } from 'preact/hooks'
import { signal } from '@preact/signals'
import { useNow, where, type Phase } from '../lib/clock'
import { t } from '../lib/i18n'
import { data, groupCode } from '../lib/store'
import type { AppData, Mate, MeetPoint } from '../lib/types'
import { loadProgram, program } from './today'
import { Glyph, Icon, useDialog } from './ui'

/** Открыт ли экран «Я потерялся» */
export const lostOpen = signal(false)
/** Просьба карте «Где группа»: сразу включить «делиться местом» и пометку «потерялся» */
export const autoLost = signal(false)

type Town = 'mecca' | 'medina' | null
type Primary = 'chat' | 'call' | 'show'

const CHAT_OK = /^https:\/\/(chat\.whatsapp\.com|wa\.me)\//
const WEB_OK = /^https:\/\//
const MIN_TEL_DIGITS = 7

const digits = (tel = '') => tel.replace(/[^\d+]/g, '')
const filled = (v?: string) => !!v && v.trim() !== '—' && v.trim() !== '-'
const townOf = (city = ''): Town => (/мекк/i.test(city) ? 'mecca' : /медин/i.test(city) ? 'medina' : null)
const dayOf = (ph: Phase) => (ph.kind === 'day' ? ph.day : ph.kind === 'before' ? ph.first : ph.last)

function matesFor(d: AppData, town: Town): Mate[] {
  const m = d.me
  if (!m) return []
  const all = town === 'medina' ? m.matesMedina : town === 'mecca' ? m.matesMecca : [...(m.matesMecca ?? []), ...(m.matesMedina ?? [])]
  return (all ?? []).filter((x, k, a) => digits(x.tel).length >= MIN_TEL_DIGITS && a.findIndex(y => digits(y.tel) === digits(x.tel)) === k)
}

function pointsFor(d: AppData, town: Town): MeetPoint[] {
  const all = d.points ?? []
  const here = all.filter(p => townOf(p.city) === town)
  return here.length ? here : all
}

function hotelsFor(d: AppData, town: Town): string[] {
  const g = d.group
  const all = town === 'mecca' ? [g.mecca] : town === 'medina' ? [g.medina] : [g.medina, g.mecca]
  return all.filter(filled)
}

interface LostProps { go: (h: string) => void }

export function Lost({ go }: LostProps) {
  return lostOpen.value ? <LostSheet go={go} /> : null
}

function LostSheet({ go }: LostProps) {
  const p = program.value
  const now = useNow(p)
  const box = useRef<HTMLDivElement>(null)
  useDialog(box, true, () => { lostOpen.value = false })
  useEffect(() => {
    loadProgram()
    const html = document.documentElement, was = html.style.overflow
    html.style.overflow = 'hidden'
    return () => { html.style.overflow = was }
  }, [])

  const d = data.value
  const town = p ? townOf(dayOf(where(p, now)).city) : null
  const chat = d ? [d.chat, d.group?.chat].find(u => !!u && CHAT_OK.test(u)) : undefined
  const mates = d ? matesFor(d, town) : []
  const points = d ? pointsFor(d, town) : []
  const hotels = d ? hotelsFor(d, town) : []
  const primary: Primary = chat ? 'chat' : mates.length ? 'call' : 'show'
  const cls = (kind: Primary, k = 0) => 'lost-act' + (primary === kind && k === 0 ? ' or' : '')
  const close = () => { lostOpen.value = false }
  const showMe = () => { autoLost.value = true; close(); go('more/where') }
  const enterCode = () => { close(); go('group') }

  return (
    <div class="near lost" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="lost-h">
      <div class="near-top">
        <span class="near-n">{t('lost.btn')}</span>
        <button class="btn ghost sm" onClick={close}>{t('step.close')} <span aria-hidden="true">✕</span></button>
      </div>
      <h1 class="lost-h" id="lost-h">{t('lost.h')}</h1>
      <p class="lost-lead">{t('lost.lead')}</p>

      {chat && (
        <a class={cls('chat')} href={chat} target="_blank" rel="noopener noreferrer">
          <Glyph id="chat" size={30} /><span><b>{t('lost.chat')}</b><small>{t('lost.chatsub')}</small></span>
        </a>
      )}
      {mates.map((m, k) => (
        <a class={cls('call', k)} href={'tel:' + digits(m.tel)} key={m.tel}>
          <Glyph id="phone" size={28} /><span><b>{t('lost.call')}: {m.name}</b><small>{t('lost.mate')} · {m.tel}</small></span>
        </a>
      ))}
      {groupCode.value && (
        <button class={cls('show')} onClick={showMe}>
          <Glyph id="pin" size={28} /><span><b>{t('lost.show')}</b><small>{t('lost.showsub')}</small></span>
        </button>
      )}

      {points.map((pt, k) => (
        <div class="lost-card" key={k}>
          <span class="kicker">{t('lost.meet')} · {pt.city}</span>
          <b>{pt.name}</b>
          {filled(pt.how) && <p>{pt.how}</p>}
          {WEB_OK.test(pt.map || '') && <p><a class="tap44" href={pt.map} target="_blank" rel="noopener noreferrer">{t('where.open')} <span aria-hidden="true">↗</span></a></p>}
        </div>
      ))}
      {hotels.length > 0 && (
        <div class="lost-card hotel">
          <Icon id="b-city-gate" size={30} />
          <div><span class="kicker">{t('lost.hotel')}</span>{hotels.map(h => <b key={h}>{h}</b>)}<p>{t('lost.hotelsub')}</p></div>
        </div>
      )}
      {!d?.me && (
        <div class="lost-card">
          <p>{t('lost.nocode')}</p>
          <button class="btn" onClick={enterCode}>{t('lost.entercode')}</button>
        </div>
      )}
    </div>
  )
}
