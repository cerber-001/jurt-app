/* «Добавить на экран „Домой“»: подсказка на «Сейчас» (одна тонкая строка, закрывается) и подстраница «Ещё → more/install».
   Что показать, решает устройство: уже установлено — ничего; iPhone/iPad в Safari — три шага через «Поделиться»;
   другой браузер на iOS — «откройте в Safari»; Android — кнопка «Установить» (если браузер её дал) или три шага через меню ⋮.
   Значки не рисуем — описываем словами. */
import { useEffect, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import { t } from '../lib/i18n'
import { ls } from '../lib/store'
import { Card } from './ui'

/** Событие Chrome/Android «можно установить»: приходит один раз при загрузке, поэтому ловим его сразу при импорте модуля */
interface InstallPromptEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const promptEvt = signal<InstallPromptEvent | null>(null)
const installed = signal(false)

if (typeof window !== 'undefined') {
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptEvt.value = e as InstallPromptEvent })
  addEventListener('appinstalled', () => { installed.value = true; promptEvt.value = null })
}

type Kind = 'standalone' | 'ios-safari' | 'ios-other' | 'android' | 'android-inapp' | 'other'

const IOS_NOT_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|GSA\/|FBAN|FBAV|Instagram|Line\/|Telegram|WhatsApp/i
const ANDROID_INAPP = /; wv\)|FBAN|FBAV|Instagram|Line\/|Telegram|WhatsApp/i

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || matchMedia('(display-mode: standalone)').matches
}

function isIOS(ua: string): boolean {
  // iPadOS 13+ представляется как Mac с сенсорным экраном
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function deviceKind(): Kind {
  if (typeof navigator === 'undefined') return 'other'
  if (installed.value || isStandalone()) return 'standalone'
  const ua = navigator.userAgent
  if (isIOS(ua)) return /Safari\//.test(ua) && !IOS_NOT_SAFARI.test(ua) ? 'ios-safari' : 'ios-other'
  if (/Android/i.test(ua)) return ANDROID_INAPP.test(ua) ? 'android-inapp' : 'android'
  return 'other'
}

const HINT_KEY = 'jurt.a2hs'

/** Тонкая закрываемая строка под плитками «Сейчас»: только если гид не установлен и строку не закрывали */
export function InstallHint({ go }: { go: (h: string) => void }) {
  const [hidden, setHidden] = useState(() => ls.get(HINT_KEY) === 'hide')
  if (hidden || deviceKind() === 'standalone') return null
  const hide = () => { ls.set(HINT_KEY, 'hide'); setHidden(true) }
  return (
    <div class="a2hs-hint">
      <button class="a2hs-go" onClick={() => go('more/install')}>
        <span>{t('a2.hint')}</span><i aria-hidden="true">›</i>
      </button>
      <button class="a2hs-x" onClick={hide} aria-label={t('a2.close')}><span aria-hidden="true">✕</span></button>
    </div>
  )
}

function Steps({ items }: { items: string[] }) {
  return <ol class="a2hs-steps">{items.map(k => <li key={k}>{t(k)}</li>)}</ol>
}

function CopyLink() {
  const [msg, setMsg] = useState('')
  async function copy() {
    try { await navigator.clipboard.writeText(location.href); setMsg(t('a2.copied')) }
    catch { setMsg(t('a2.copyfail')) }
  }
  return (
    <>
      <div class="btns"><button class="btn" onClick={copy}>{t('a2.copy')}</button></div>
      {msg && <p role="status">{msg}</p>}
    </>
  )
}

function InstallButton({ e }: { e: InstallPromptEvent }) {
  const [busy, setBusy] = useState(false)
  async function run() {
    setBusy(true)
    try {
      await e.prompt()
      const r = await e.userChoice
      if (r.outcome === 'accepted') installed.value = true
    } catch {
      /* браузер не показал окно установки — ниже появятся шаги через меню ⋮ */
    } finally {
      promptEvt.value = null   // событие одноразовое; если отказались — дальше покажем шаги через меню
      setBusy(false)
    }
  }
  return <div class="btns"><button class="btn or a2hs-btn" onClick={run} disabled={busy}>{t('a2.btn')}</button></div>
}

function Body({ kind }: { kind: Kind }) {
  const e = promptEvt.value
  if (kind === 'standalone') return <p class="a2hs-big">{t('a2.done')}</p>
  if (e) return <InstallButton e={e} />
  if (kind === 'ios-safari') return <Steps items={['a2.ios1', 'a2.ios2', 'a2.ios3']} />
  if (kind === 'ios-other') return <><p class="a2hs-big">{t('a2.safari')}</p><CopyLink /></>
  if (kind === 'android') return <Steps items={['a2.and1', 'a2.and2', 'a2.and3']} />
  if (kind === 'android-inapp') return <><p class="a2hs-big">{t('a2.chrome')}</p><CopyLink /></>
  return <p class="a2hs-big">{t('a2.other')}</p>
}

/** Подстраница «Ещё → Добавить на экран „Домой“» */
export function InstallGuide() {
  const [kind, setKind] = useState<Kind>(deviceKind)
  useEffect(() => { setKind(deviceKind()) }, [installed.value])
  return (
    <Card cls="a2hs">
      <h1>{t('more.install')}</h1>
      {kind !== 'standalone' && <p>{t('a2.why')}</p>}
      <Body kind={kind} />
    </Card>
  )
}
