/* Режим «Рядом»: один шаг умры на экран, крупно. На тавафе и саи вместо «Дальше» —
   счётчик под большим пальцем: одна огромная кнопка «+1», экран не гаснет. */
import { useEffect, useRef, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import { content, loadContent, type DuaItem } from '../lib/content'
import { done } from '../lib/store'
import { t } from '../lib/i18n'
import { keepAwake } from '../lib/wake'
import { Notes } from './notes'
import { ROUNDS, RoundsDial, hintsOf, isRounds, useRounds } from './rounds'
import { Html, Icon, useDialog } from './ui'

/** Открытый в режиме «Рядом» шаг (id) или null */
export const nearby = signal<string | null>(null)

/** Сколько ждать после нажатия «+1», прежде чем та же зона экрана начнёт листать шаги (защита от двойного касания) */
const TAP_GUARD_MS = 1200

export function DuaBlock({ d }: { d: DuaItem }) {
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

export function Nearby() {
  const id = nearby.value
  const open = !!id
  const c = content.value
  const [more, setMore] = useState(false)
  const rounds = useRounds(id ?? '')
  const lastTap = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLHeadingElement>(null)
  const nextBtn = useRef<HTMLButtonElement>(null)
  const seen = useRef<{ id: string | null; counting: boolean }>({ id: null, counting: false })
  const counting = !!id && isRounds(id) && rounds.n < ROUNDS
  const close = () => { nearby.value = null }
  useDialog(box, open, close)

  useEffect(() => { setMore(false) }, [id])
  // фокус: новый шаг — на его заголовок; седьмой круг — на «Дальше» (кнопка «+1» исчезла)
  useEffect(() => {
    const was = seen.current
    seen.current = { id, counting }
    if (!id || !c) return
    if (was.id && was.id !== id) head.current?.focus({ preventScroll: true })
    else if (was.id === id && was.counting && !counting) nextBtn.current?.focus({ preventScroll: true })
  })
  useEffect(() => {
    if (!open) return
    loadContent()
    const html = document.documentElement, was = html.style.overflow
    html.style.overflow = 'hidden'
    // ссылка из текста шага (например, «Намаз, кибла») уводит на другой экран — «Рядом» закрываем
    addEventListener('jurt:tab', close)
    const letSleep = keepAwake()
    return () => { html.style.overflow = was; removeEventListener('jurt:tab', close); letSleep() }
  }, [open])

  if (!id) return null
  if (!c) return <div class="near" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-busy="true"><div class="sk" /></div>

  const k = Math.max(0, c.steps.findIndex(s => s.id === id))
  const s = c.steps[k], total = c.steps.length
  const withCount = isRounds(s.id)
  const goTo = (j: number) => { nearby.value = c.steps[j].id; document.querySelector('.near')?.scrollTo(0, 0) }
  const forward = () => {
    if (Date.now() - lastTap.current < TAP_GUARD_MS) return
    done.value = { ...done.value, [s.id]: true }
    if (k < total - 1) goTo(k + 1); else nearby.value = null
  }
  const plus = () => { lastTap.current = Date.now(); rounds.add() }
  const restart = () => { if (confirm(t('rnd.resetq'))) rounds.reset() }

  return (
    <div class={'near' + (withCount ? ' cnt' : '')} ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="near-h">
      <div class="near-top">
        <span class="near-n">{s.num} {t('step.of')} {total}{done.value[s.id] ? <><span aria-hidden="true"> ✓</span><span class="sr-only"> · {t('path.done')}</span></> : ''}</span>
        <button class="btn ghost sm" onClick={close}>{t('step.close')} <span aria-hidden="true">✕</span></button>
      </div>
      {!withCount && <div class="near-ico"><Icon id={s.icon} size={56} /></div>}
      <h1 class="near-h" id="near-h" ref={head} tabIndex={-1}>{s.title}</h1>
      {isRounds(s.id) && <RoundsDial id={s.id} n={rounds.n} hints={hintsOf(s.html)} />}
      {s.lead && <p class="near-lead">{s.lead}</p>}
      {s.dua?.map((d, i) => <DuaBlock d={d} key={i} />)}
      <div class="near-links">
        <button class="btn ghost sm" onClick={() => setMore(!more)} aria-expanded={more}>{t('step.more')} <span aria-hidden="true">{more ? '▴' : '▾'}</span></button>
        {withCount && rounds.n > 0 && <button class="btn ghost sm" onClick={restart}>{t('rnd.reset')}</button>}
        {counting && <button class="btn ghost sm" onClick={forward}>{t('rnd.skip')} <span aria-hidden="true">→</span></button>}
      </div>
      {more && <><Html html={s.html} cls="near-more" /><Notes id={'step:' + s.id} /></>}
      {counting ? (
        <div class="near-bar tap">
          <button class="btn ghost undo" disabled={!rounds.n} onClick={rounds.undo} aria-label={'−1, ' + t('rnd.undo')}>−1</button>
          <button class="btn plus" onClick={plus}><b aria-hidden="true">+1</b><span>{t(`rnd.${s.id}.btn`)}</span></button>
        </div>
      ) : (
        <div class="near-bar">
          <button class="btn ghost" disabled={k === 0} onClick={() => goTo(k - 1)}><span aria-hidden="true">←</span> {t('step.prev')}</button>
          {k < total - 1
            ? <button class="btn" ref={nextBtn} onClick={forward}>{t('step.next')} <span aria-hidden="true">→</span></button>
            : <button class="btn or" ref={nextBtn} onClick={forward}>{t('step.finish')} <span aria-hidden="true">✓</span></button>}
        </div>
      )}
    </div>
  )
}
