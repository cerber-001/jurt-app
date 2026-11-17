/* Карточка «Сейчас»: небо по времени суток и содержимое текущего пункта программы.
   Наступил следующий пункт — содержимое сменяется спокойно: где браузер умеет View Transitions, старое растворяется,
   новое проявляется, а высота карточки и всё, что под ней, переезжают плавно (без скачка). Где не умеет — новое
   мягко поднимается (класс rise). При «Уменьшить движение» — просто новое содержимое. */
import { useEffect, useRef, useState } from 'preact/hooks'
import { DAY_PARTS, type DayPart } from '../lib/daypart'
import { progLang } from '../lib/i18n'
import { canTransition, runTransition } from '../lib/transition'
import type { HeroView } from './hero-view'
import { Icon } from './ui'

type Go = (h: string) => void

/** Небо карточки: четыре слоя палитры бренда, виден один — смена части суток идёт плавным наплывом */
function Sky({ part }: { part: DayPart }) {
  return (
    <div class="sky" aria-hidden="true">
      {DAY_PARTS.map(p => <i key={p} class={'sky-' + p + (p === part ? ' on' : '')} />)}
    </div>
  )
}

/** Какой вид карточки показывать сейчас: новый пункт придерживаем, пока браузер снимает старый вид */
function useShownView(v: HeroView): { view: HeroView; smooth: boolean } {
  const smooth = canTransition()
  const [shown, setShown] = useState(v.id)
  const last = useRef(v)
  // тот же пункт (обновилось время) или переход не нужен — показываем свежий вид сразу
  if (!smooth || v.id === shown) last.current = v
  useEffect(() => {
    if (smooth && v.id !== shown) runTransition(() => setShown(v.id), 'hero')
  }, [v.id, shown, smooth])
  return { view: last.current, smooth }
}

export function Hero({ v, part, go }: { v: HeroView; part: DayPart; go: Go }) {
  const { view, smooth } = useShownView(v)
  const c = view.cta
  const pl = progLang()
  return (
    <section class={'hero tod tod-' + part} data-part={part}>
      <Sky part={part} />
      {/* key: наступил следующий пункт программы — содержимое собирается заново */}
      <div class={'hero-in' + (smooth ? '' : ' rise')} key={view.id}>
        {view.kicker && <div class="hero-k">{view.kicker}</div>}
        {view.time && <div class="hero-t">{view.time}</div>}
        <h1 class={'hero-h' + (view.small ? ' sm' : '')} lang={view.prog ? pl : undefined}>{view.title}</h1>
        {view.place && <p class="hero-w" lang={pl}>{view.place}</p>}
        {view.note && <p class="hero-m" lang={pl}>{view.note}</p>}
        {view.pay && <p class="hero-m pay" lang={pl}>{view.pay}</p>}
        <button class={'cta' + (c.solid ? ' solid' : '')} onClick={c.run}>
          {c.icon && <Icon id={c.icon} size={34} />}
          <span>{c.over && <small>{c.over}</small>}<b>{c.title}</b></span>
          <i aria-hidden="true">›</i>
        </button>
        {view.next && (
          <button class="hero-next" onClick={() => go('program')}>
            <span><small>{view.next.over}</small><span lang={pl}>{view.next.text}</span></span>
            <i aria-hidden="true">›</i>
          </button>
        )}
      </div>
    </section>
  )
}
