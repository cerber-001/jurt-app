/* Режим «Рядом»: один шаг умры на экран, крупно. На тавафе и саи вместо «Дальше» —
   счётчик под большим пальцем: одна огромная кнопка «+1», экран не гаснет. */
import { Fragment } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import { content, loadContent, type DuaItem } from '../lib/content'
import { done } from '../lib/store'
import { t, tf } from '../lib/i18n'
import { openFinale } from './finale'
import { keepAwake } from '../lib/wake'
import { afterOverlayClosed } from '../lib/overlay'
import { attachSwipe, type SwipeDir } from '../lib/swipe'
import { reading } from './reader'
import { Notes } from './notes'
import { ROUNDS, RoundsDial, hintsOf, isRounds, sound, toggleSound, useRounds } from './rounds'
import { Html, Icon, useDialog } from './ui'

/** Открытый в режиме «Рядом» шаг (id) или null */
export const nearby = signal<string | null>(null)

/** Сколько ждать после нажатия «+1», прежде чем та же зона экрана начнёт листать шаги (защита от двойного касания) */
const TAP_GUARD_MS = 1200
/** Насколько содержимое следует за пальцем при свайпе (доля сдвига) и насколько бледнеет */
const DRAG_FOLLOW = 0.3
const DRAG_FADE_PX = 900

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Лёгкое «следование» за пальцем: только transform и opacity (через переменные --sx и --so в wow-rite.css) */
function dragTo(el: HTMLElement, dx: number | null) {
  if (dx === null || reducedMotion()) { el.classList.remove('drag'); el.style.removeProperty('--sx'); el.style.removeProperty('--so'); return }
  el.classList.add('drag')
  el.style.setProperty('--sx', dx * DRAG_FOLLOW + 'px')
  el.style.setProperty('--so', String(1 - Math.min(0.35, Math.abs(dx) / DRAG_FADE_PX)))
}

/** Свайп по окну шага. enabled и onSwipe читаются из ref — слушатели ставятся один раз на открытое окно */
function useStepSwipe(box: { current: HTMLDivElement | null }, open: boolean, ready: boolean,
  enabled: () => boolean, onSwipe: (d: SwipeDir) => void) {
  const fresh = useRef({ enabled, onSwipe })
  fresh.current = { enabled, onSwipe }
  useEffect(() => {
    const el = box.current
    if (!open || !ready || !el) return
    return attachSwipe(el, {
      enabled: () => fresh.current.enabled(),
      onSwipe: d => fresh.current.onSwipe(d),
      onDrag: dx => dragTo(el, dx),
    })
  }, [open, ready])
}

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
  // откуда въезжает новый шаг: 'next' — справа, 'prev' — слева; null — без анимации (первое открытие)
  const [dir, setDir] = useState<SwipeDir | null>(null)
  const rounds = useRounds(id ?? '')
  const lastTap = useRef(0)
  const box = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLHeadingElement>(null)
  const nextBtn = useRef<HTMLButtonElement>(null)
  const seen = useRef<{ id: string | null; counting: boolean }>({ id: null, counting: false })
  const counting = !!id && isRounds(id) && rounds.n < ROUNDS
  const close = () => { nearby.value = null }
  useDialog(box, open, close)
  const steps = c?.steps ?? []
  const k = Math.max(0, steps.findIndex(x => x.id === id))
  const goTo = (j: number) => {
    if (j < 0 || j >= steps.length) return
    setDir(j > k ? 'next' : 'prev')
    nearby.value = steps[j].id
    box.current?.scrollTo?.(0, 0)
  }
  // «Дальше» и свайп влево — одно и то же: шаг отмечается выполненным; после последнего шага — финал.
  // Финал открываем ДО закрытия окна: он дождётся, пока «Рядом» снимет свою запись истории (lib/overlay.ts)
  const forward = () => {
    if (!steps.length || Date.now() - lastTap.current < TAP_GUARD_MS) return
    done.value = { ...done.value, [steps[k].id]: true }
    if (k < steps.length - 1) goTo(k + 1)
    else { openFinale(); nearby.value = null }
  }
  // свайп: влево — следующий шаг (как «Дальше»), вправо — предыдущий (ничего не отмечает); с последнего шага
  // свайп никуда не ведёт — финал только по кнопке. Во время счёта кругов не листаем (палец занят «+1»)
  useStepSwipe(box, open, !!c, () => !counting, d => {
    if (d === 'prev') goTo(k - 1)
    else if (k < steps.length - 1) forward()
  })

  useEffect(() => { setMore(false) }, [id])
  useEffect(() => { if (!open) setDir(null) }, [open])
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
  if (!c) return <div class="near" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-busy="true" aria-label={t('c.loading')}><div class="sk" /></div>

  const s = c.steps[k], total = c.steps.length
  const withCount = isRounds(s.id)
  const plus = () => { lastTap.current = Date.now(); rounds.add() }
  const restart = () => { if (confirm(t('rnd.resetq'))) rounds.reset() }
  // все 7 кругов пройдены: спокойный экран «Таваф завершён → дальше …» без лишнего текста
  const finished = withCount && rounds.n >= ROUNDS
  const after = c.steps[k + 1]
  // для чтеца: «Таваф завершён. Дальше: 3. …» — область живёт всё время, пока открыто окно, текст меняется
  const finMsg = finished ? t(`fin.${s.id}.k`) + (after ? `. ${t('fin.next')}: ${after.num}. ${after.title}` : '') : ''
  // «Читать крупно»: окно шага закрываем, чтение открываем, когда история браузера успокоится; после чтения — шаг снова
  const readLarge = () => {
    const back = s.id, items = s.dua, title = s.title
    afterOverlayClosed(() => { reading.value = { title, items, after: () => { nearby.value = back } } })
    nearby.value = null
  }

  return (
    <div class={'near' + (withCount ? ' cnt' : '') + (dir ? ' in-' + dir : '')} ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="near-h" aria-describedby="near-sw">
      <p class="sr-only" id="near-sw">{t('rite.swipe')}</p>
      <p class="sr-only" role="status" aria-atomic="true">{finMsg}</p>
      <div class="near-top">
        <span class="near-n">{s.num} {t('step.of')} {total}{done.value[s.id] ? <><span aria-hidden="true"> ✓</span><span class="sr-only"> · {t('path.done')}</span></> : ''}</span>
        <button class="btn ghost sm" onClick={close}>{t('step.close')} <span aria-hidden="true">✕</span></button>
      </div>
      <Fragment key={s.id}>
      {!withCount && <div class="near-ico"><Icon id={s.icon} size={56} /></div>}
      <h1 class="near-h" id="near-h" ref={head} tabIndex={-1}>{s.title}</h1>
      {isRounds(s.id) && <RoundsDial id={s.id} n={rounds.n} hints={hintsOf(s.html)} />}
      {finished && after && isRounds(s.id) && (
        <section class="fin-note">
          <div class="fin-k">{t(`fin.${s.id}.k`)}</div>
          <p class="fin-sub">{t(`rnd.${s.id}.all`)}</p>
          <div class="fin-next"><small>{t('fin.next')}</small><b>{after.num}. {after.title}</b></div>
        </section>
      )}
      {!finished && s.lead && <p class="near-lead">{s.lead}</p>}
      {!finished && s.dua?.length > 0 && <button class="btn ghost sm read-go" onClick={readLarge}>{t('read.open')}</button>}
      {!finished && s.dua?.map((d, i) => <DuaBlock d={d} key={i} />)}
      <div class="near-links">
        <button class="btn ghost sm" onClick={() => setMore(!more)} aria-expanded={more}>{t('step.more')} <span aria-hidden="true">{more ? '▴' : '▾'}</span></button>
        {counting && k > 0 && <button class="btn ghost sm" onClick={() => goTo(k - 1)}><span aria-hidden="true">←</span> {t('step.prev')}</button>}
        {withCount && rounds.n > 0 && <button class="btn ghost sm" onClick={restart}>{t('rnd.reset')}</button>}
        {counting && <button class="btn ghost sm" onClick={forward}>{t('rnd.skip')} <span aria-hidden="true">→</span></button>}
        {counting && <button class={'btn ghost sm snd' + (sound.value ? ' sel' : '')} onClick={toggleSound}>{sound.value ? t('rite.snd.on') : t('rite.snd.off')}</button>}
      </div>
      {more && <><Html html={s.html} cls="near-more" /><Notes id={'step:' + s.id} /></>}
      </Fragment>
      {counting ? (
        <div class="near-bar tap">
          <button class="btn ghost undo" disabled={!rounds.n} onClick={rounds.undo} aria-label={'−1, ' + t('rnd.undo')}>−1</button>
          <button class="btn plus" onClick={plus}><b aria-hidden="true">+1</b><span>{t(`rnd.${s.id}.btn`)}</span></button>
        </div>
      ) : (
        <div class="near-bar">
          <button class="btn ghost" disabled={k === 0} onClick={() => goTo(k - 1)}><span aria-hidden="true">←</span> {t('step.prev')}</button>
          {k < total - 1
            ? <button class={'btn' + (finished ? ' or' : '')} ref={nextBtn} onClick={forward}>{finished && after ? tf('fin.go', { n: after.num }) : t('step.next')} <span aria-hidden="true">→</span></button>
            : <button class="btn or" ref={nextBtn} onClick={forward}>{t('step.finish')} <span aria-hidden="true">✓</span></button>}
        </div>
      )}
    </div>
  )
}
