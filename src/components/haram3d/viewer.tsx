/* Этап 1а: окно «Харам заранее (3D)» на весь экран (как Reader и урок дня): ловушка фокуса, Escape и «Назад» закрывают.
   Ленивый модуль — three.js, 3d-tiles-renderer и словарь окна в первый файл JS не попадают (грузит карточка на «Мой путь»).
   Внутри: canvas WebGL, переключатель «Фото-3D / Наша модель», виды, честная строка статуса и подписи прав. */
import { useEffect, useRef, useState } from 'preact/hooks'
import { viewsOf, walkMinutes, type Layer } from '../../lib/haram3d'
import { h3t, h3tf } from '../../lib/strings.haram3d'
import { kzToday } from '../../lib/today-day'
import { parseDebugTime } from '../../lib/sun'
import { lang } from '../../lib/store'
import { useDialog } from '../ui'
import { createController, statusKey, type Controller, type ViewerState } from './controller'
import '../../styles/haram3d.css'

const LAYERS: readonly Layer[] = ['google', 'ours']

/** Ключ Google задаётся при сборке (VITE_GOOGLE_MAPS_KEY); в коде его нет */
function mapsKey(): string {
  return (import.meta.env.VITE_GOOGLE_MAPS_KEY ?? '').trim()
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Часы для света: настоящие; с ?h3time=22:30 (время Мекки) или ?h3time=<ISO> — с этого момента и дальше по ходу
    (для снимков ночи и проверки, системные часы не трогаем) */
function clockFn(): () => Date {
  let start: Date | null = null
  try { start = parseDebugTime(new URLSearchParams(location.search).get('h3time'), new Date()) } catch { /* нет location */ }
  if (!start) return () => new Date()
  const shift = start.getTime() - Date.now()
  return () => new Date(Date.now() + shift)
}

/** «Сейчас в Мекке 14:20 — день»: только у нашей модели — её свет идёт по этим часам */
function MeccaClock({ s }: { s: ViewerState }) {
  if (s.layer !== 'ours' || !s.clock) return null
  return <p class="h3-clock">{h3tf('h3.clock', { t: s.clock.hm, p: h3t('h3.ph.' + s.clock.phase) })}</p>
}

/** Подписи прав поверх canvas, внизу: Фото-3D — надпись Google и копирайты тайлов; наша модель — OSM и автор Каабы */
function Credits({ s }: { s: ViewerState }) {
  if (s.layer === 'google') return (
    <p class="h3-credits">
      <b class="h3-g">Google</b>{s.credits && <span> · {s.credits}</span>}
      {s.view === 'route' && <span class="h3-own">{h3t('h3.c.route')}</span>}
    </p>
  )
  return (
    <p class="h3-credits">
      <span>{h3t('h3.c.ours')}</span>
      <span>{h3t('h3.c.kaaba')}</span>
    </p>
  )
}

/** Строка статуса и пояснения под видами */
function Status({ s, retry }: { s: ViewerState; retry: () => void }) {
  const [a, b] = walkMinutes(s.routeLen ?? 0)
  return (
    <div class="h3-status" role="status">
      <p class="h3-st">{h3t(statusKey(s))}</p>
      {s.layer === 'ours' && s.ours === 'loading' && <p class="h3-sub">{h3t('h3.ours.loading')}</p>}
      {s.ours === 'error' && (
        <p class="h3-sub h3-err">{h3t('h3.ours.err')} <button class="linkbtn" onClick={retry}>{h3t('h3.retry')}</button></p>
      )}
      {s.layer === 'google' && s.view === 'route' && s.routeLen !== null && (
        <p class="h3-sub"><b>{h3tf('h3.r.info', { m: s.routeLen, a, b })}</b> <small>{h3t('h3.r.note')}</small></p>
      )}
      {s.layer === 'ours' && (s.view === 'tawaf' || s.view === 'sai') && <p class="h3-sub">{h3t('h3.n.' + s.view)}</p>}
    </div>
  )
}

function Controls({ s, c }: { s: ViewerState; c: Controller }) {
  return (
    <div class="h3-bar">
      <div class="h3-seg" role="group" aria-label={h3t('h3.layers')}>
        {LAYERS.map(l => (
          <button key={l} class={s.layer === l ? 'on' : ''} aria-pressed={s.layer === l} onClick={() => c.selectLayer(l)}>{h3t('h3.' + l)}</button>
        ))}
      </div>
      <div class="h3-chips" role="group" aria-label={h3t('h3.views')}>
        {viewsOf(s.layer).map(v => (
          <button key={v.id} class={'h3-chip' + (s.view === v.id ? ' on' : '')} aria-pressed={s.view === v.id}
            onClick={() => c.selectView(v.id)}>{h3t('h3.v.' + v.id)}</button>
        ))}
      </div>
      <Status s={s} retry={() => c.retryOurs()} />
    </div>
  )
}

export function Haram3dViewer({ onClose }: { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const start = useRef<HTMLSpanElement>(null)
  const end = useRef<HTMLSpanElement>(null)
  const [ctl, setCtl] = useState<Controller | null>(null)
  useDialog(box, true, onClose)
  void lang.value   // перерисовка при смене языка

  useEffect(() => {
    const c = createController(stage.current!, {
      key: mapsKey(),
      online: () => navigator.onLine !== false,
      today: () => kzToday(),
      reducedMotion: reducedMotion(),
      labels: { start: start.current!, end: end.current! },
      now: clockFn(),
    })
    setCtl(c)
    return () => c.dispose()   // WebGL-контекст, тайлы, цикл кадров и слушатели — всё снимается при закрытии
  }, [])

  // подпись для экранного чтеца — у самого canvas (его создаёт движок), а не у контейнера: подписи прав внутри остаются читаемыми
  const label = h3t('h3.canvas')
  useEffect(() => {
    const cv = stage.current?.querySelector('canvas')
    if (cv) { cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', label) }
  }, [ctl, label])

  const s = ctl?.state.value ?? null
  /** 3D не показать: WebGL нет вовсе или браузер отобрал его во время показа */
  const down = !!s && (s.noGl || s.lost)
  return (
    <div class="reader h3" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="h3-h">
      <div class="rd-top">
        <h1 id="h3-h">{h3t('h3.title')}</h1>
        <button class="btn ghost sm" onClick={onClose}>{h3t('h3.close')} <span aria-hidden="true">✕</span></button>
      </div>
      <div class={'h3-stage' + (down ? ' nogl' : '')} ref={stage}>
        <span class="h3-pin" ref={start} style={{ display: 'none' }}>{h3t('h3.r.start')}</span>
        <span class="h3-pin end" ref={end} style={{ display: 'none' }}>{h3t('h3.r.end')}</span>
        {s && !down && <MeccaClock s={s} />}
        {s && !down && <Credits s={s} />}
      </div>
      {s && down && <p class="h3-st h3-err" role="alert">{h3t(statusKey(s))}</p>}
      {s && ctl && !down && <Controls s={s} c={ctl} />}
    </div>
  )
}
