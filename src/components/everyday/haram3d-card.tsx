/* Этап 1а: карточка «Харам заранее (3D)» на «Мой путь» и место окна 3D поверх экрана.
   Окно — ленивый модуль (components/haram3d/viewer.tsx): three.js и 3d-tiles-renderer грузятся только по кнопке,
   первый файл JS не тяжелеет. Пока модуль грузится — «Загружается…»; не загрузился — честная строка и «Попробовать снова». */
import type { ComponentType } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import { MODEL_URLS } from '../../lib/haram3d'
import { t } from '../../lib/i18n'

type ViewerComp = ComponentType<{ onClose: () => void }>

/** Окно 3D открыто (pilgrim.tsx делает остальной экран inert) */
export const haram3dOpen = signal(false)
/** Загруженный компонент окна — после первого успешного import() */
const viewer = signal<ViewerComp | null>(null)

/** Ленивый импорт окна. Объект — чтобы тест мог подменить загрузку (vi.spyOn) */
export const viewerLoader = {
  load: (): Promise<ViewerComp> => import('../haram3d/viewer').then(m => m.Haram3dViewer),
}

/** Наша модель целиком лежит в кэше устройства — откроется без сети. Без поддержки caches — молчим (null) */
async function modelSaved(): Promise<boolean | null> {
  if (typeof caches === 'undefined') return null
  try {
    const hits = await Promise.all(MODEL_URLS.map(u => caches.match(u)))
    return hits.every(Boolean)
  } catch {
    return null
  }
}

type Phase = 'idle' | 'loading' | 'error'

export function Haram3dCard() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [saved, setSaved] = useState<boolean | null>(null)
  // карточку могли убрать с экрана (ушли на другую вкладку), пока грузился файл окна: тогда окно не открываем
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])
  // перепроверяем после закрытия окна: при первом открытии модель как раз ложится в кэш
  const open = haram3dOpen.value
  useEffect(() => {
    let live = true
    void modelSaved().then(v => { if (live) setSaved(v) })
    return () => { live = false }
  }, [open])

  const start = async () => {
    if (phase === 'loading') return
    setPhase('loading')
    try {
      const comp = await viewerLoader.load()
      viewer.value = comp   // модуль уже загружен — следующее нажатие откроет окно сразу
      if (!mounted.current) return
      setPhase('idle')
      haram3dOpen.value = true
    } catch {
      if (mounted.current) setPhase('error')   // нет сети и файл окна не в кэше (или сбой загрузки)
    }
  }

  return (
    <section class="card jr-3d" aria-labelledby="jr-3d-h">
      <h2 id="jr-3d-h">{t('jr.3d')}</h2>
      <p>{t('jr.3d.t')}</p>
      <div class="btns">
        {/* не disabled: иначе кнопка теряет фокус, и после закрытия окна он не вернётся на неё */}
        <button class="btn" onClick={() => void start()} aria-disabled={phase === 'loading'} aria-busy={phase === 'loading'}>
          {phase === 'loading' ? t('jr.3d.loading') : phase === 'error' ? t('jr.3d.retry') : t('jr.3d.open')}
        </button>
      </div>
      <div role="status">{phase === 'error' && <p class="jr-3d-err">{t('jr.3d.err')}</p>}</div>
      {saved && <p class="jr-3d-saved"><span aria-hidden="true">✓ </span>{t('jr.3d.saved')}</p>}
      <p class="muted"><small>{t('jr.3d.hint')}</small></p>
    </section>
  )
}

/** Окно 3D поверх экрана (рендерится в pilgrim.tsx рядом с LessonReader) */
export function Haram3dOverlay() {
  const Comp = viewer.value
  if (!haram3dOpen.value || !Comp) return null
  return <Comp onClose={() => { haram3dOpen.value = false }} />
}
