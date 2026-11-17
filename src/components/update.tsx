/* 1.1: плашка «Есть новая версия — обновить» и тихий значок «Гид сохранён на телефоне ✓».
   Режим PWA — prompt: новая версия скачивается в фоне и ждёт; страница сама не перезагружается
   (паломник может быть посреди тавафа). Нажал «Обновить» — новая версия включается и страница перезагружается.
   Плашка стоит в потоке страницы над шапкой, а не поверх содержимого: счётчик кругов она не закрывает.
   Новую версию спрашиваем раз в час и при возвращении в гид (не чаще раза в 10 минут, только при сети).
   «Позже» прячет плашку до следующего возвращения в гид. Чтецу текст плашки объявляет постоянная живая область. */
import { signal } from '@preact/signals'
import { useEffect, useState } from 'preact/hooks'
import type { RegisterSWOptions } from 'virtual:pwa-register'
import { t } from '../lib/i18n'
import { ls } from '../lib/store'
import { useLater } from './live'

type Apply = (reloadPage?: boolean) => Promise<void>
export type Register = (o: RegisterSWOptions) => Apply

/** Как часто спрашивать сервер о новой версии, пока гид открыт */
export const CHECK_MS = 60 * 60_000
/** При возвращении в гид спрашиваем не чаще, чем раз в столько */
export const RECHECK_MS = 10 * 60_000
/** Сколько секунд виден значок «сохранён на телефоне» */
export const NOTE_MS = 8_000
/** Если новая версия не включилась сама, через столько перезагружаем страницу */
const RELOAD_FALLBACK_MS = 6_000
const SAVED_KEY = 'jurt.offline'

export const needRefresh = signal(false)
/** Показать значок офлайн-копии сейчас (только в первый раз) */
export const offlineNote = signal(false)
/** Офлайн-копия гида уже была готова на этом телефоне */
export const savedOffline = (): boolean => ls.get(SAVED_KEY) === '1'

let apply: Apply | null = null
let reg: ServiceWorkerRegistration | null = null
let lastCheck = 0
/** Новая версия скачана и ждёт (даже если плашку спрятали «Позже») */
let waiting = false

/** Спросить сервер о новой версии — только при сети */
function check(): void {
  if (!reg || !navigator.onLine) return
  lastCheck = Date.now()
  reg.update().catch(() => { /* нет сети — спросим в следующий раз */ })
}

/** Вернулись в гид: спрятанная «Позже» плашка показывается снова (раз за возвращение), заодно спрашиваем сервер */
function onVisible(): void {
  if (document.visibilityState !== 'visible') return
  if (waiting && !needRefresh.value) needRefresh.value = true
  if (Date.now() - lastCheck >= RECHECK_MS) check()
}

export function initPwa(register: Register): void {
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
  apply = register({
    immediate: true,
    onNeedRefresh() { waiting = true; needRefresh.value = true },
    onOfflineReady() {
      if (savedOffline()) return
      ls.set(SAVED_KEY, '1')
      offlineNote.value = true
    },
    onRegisteredSW(_url, r) {
      if (!r) return
      reg = r
      lastCheck = Date.now()
      setInterval(check, CHECK_MS)
    },
  })
}

/** Плашку убрали — фокус в начало содержимого, а не в никуда (body) */
function focusMain(): void {
  const main = document.querySelector<HTMLElement>('main')
  if (!main) return
  if (!main.hasAttribute('tabindex')) main.tabIndex = -1
  main.focus({ preventScroll: true })
}

function UpdateNotice() {
  const [busy, setBusy] = useState(false)
  async function run() {
    setBusy(true)
    setTimeout(() => location.reload(), RELOAD_FALLBACK_MS)
    await apply?.(true)
  }
  // текст плашки чтецу читает живая область (UpdateBar), здесь он только для глаз
  return (
    <div class="upd">
      <span class="upd-t" aria-hidden="true">{t('upd.new')}</span>
      <button class="upd-go" onClick={run} disabled={busy}>{busy ? t('upd.busy') : t('upd.go')}</button>
      {!busy && <button class="upd-x" onClick={() => { needRefresh.value = false; focusMain() }}>{t('upd.later')}</button>}
    </div>
  )
}

function SavedNote() {
  useEffect(() => {
    const id = setTimeout(() => { offlineNote.value = false }, NOTE_MS)
    return () => clearTimeout(id)
  }, [])
  return <p class="upd-saved" aria-hidden="true">{t('upd.saved')}</p>
}

/** Монтируется один раз в app.tsx, над всеми маршрутами */
export function UpdateBar() {
  const msg = needRefresh.value ? t('upd.new') : offlineNote.value ? t('upd.saved') : ''
  const live = useLater(msg)
  return (
    <>
      <p class="sr-only" role="status" aria-atomic="true">{live}</p>
      {needRefresh.value ? <UpdateNotice /> : offlineNote.value ? <SavedNote /> : null}
    </>
  )
}
