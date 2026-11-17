/* Дуа «для чтения»: на весь экран, крупный арабский (Amiri), размер меняется кнопками «Мельче / Крупнее»,
   ночная подсветка для чтения в темноте. Транскрипция и смысл скрыты и раскрываются по касанию —
   глаза остаются на арабском. Размер и подсветка хранятся на телефоне, экран не гаснет, пока читаете.
   Открывается из карточки дуа (guide.tsx) и из окна шага «Рядом» (nearby.tsx) — тогда после чтения шаг открывается снова. */
import { useEffect, useRef, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import type { DuaItem } from '../lib/content'
import { ls } from '../lib/store'
import { t } from '../lib/i18n'
import { useDialog } from './ui'
import { keepAwake } from '../lib/wake'
import { afterOverlayClosed } from '../lib/overlay'

export interface Reading {
  title: string
  items: DuaItem[]
  /** что сделать, когда окно чтения закроется и снимет свою запись истории (вернуть окно шага) */
  after?: () => void
}
/** Что открыто в режиме чтения (или null) */
export const reading = signal<Reading | null>(null)

const SIZE_KEY = 'jurt.read.size'
const NIGHT_KEY = 'jurt.read.night'
/** Размеры арабского, rem: от «удобно в руке» до «видно на вытянутой руке» */
const SIZES = [1.9, 2.3, 2.8, 3.4, 4.1] as const
const DEFAULT_SIZE = 2

const readSize = () => {
  const v = Number(ls.get(SIZE_KEY))
  return Number.isInteger(v) && v >= 0 && v < SIZES.length && ls.get(SIZE_KEY) !== '' ? v : DEFAULT_SIZE
}

/** Скрытый текст под кнопкой «показать». После касания кнопка исчезает — фокус переходит на открытый текст
    (а не падает в body), чтец сразу его читает */
function Reveal({ label, text, cls }: { label: string; text: string; cls: string }) {
  const [shown, setShown] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { if (shown) box.current?.focus({ preventScroll: true }) }, [shown])
  if (shown) return <div class={'rd-' + cls} ref={box} tabIndex={-1}><span class="sr-only">{label}: </span>{text}</div>
  return (
    <button class="rd-reveal" onClick={() => setShown(true)}>
      <b>{label}</b><small>{t('read.show')}</small><i aria-hidden="true">▾</i>
    </button>
  )
}

export function Reader() {
  const r = reading.value
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(readSize)
  const [night, setNight] = useState(ls.get(NIGHT_KEY) === '1')
  const close = () => {
    const after = reading.value?.after
    reading.value = null
    if (after) afterOverlayClosed(after)
  }
  useDialog(box, !!r, close)
  useEffect(() => (r ? keepAwake() : undefined), [!!r])
  if (!r) return null

  const resize = (d: number) => {
    const v = Math.min(SIZES.length - 1, Math.max(0, size + d))
    setSize(v); ls.set(SIZE_KEY, String(v))
  }
  const toggleNight = () => { const v = !night; setNight(v); ls.set(NIGHT_KEY, v ? '1' : '') }

  return (
    <div class={'reader' + (night ? ' night' : '')} ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="rd-h"
      style={{ '--ar-size': SIZES[size] + 'rem' }}>
      <div class="rd-top">
        <h1 id="rd-h">{r.title}</h1>
        <button class="btn ghost sm" onClick={close}>{t('step.close')} <span aria-hidden="true">✕</span></button>
      </div>
      <div class="rd-body">
        {r.items.map((d, i) => (
          <section class="rd-item" key={i}>
            {d.label && <div class="rd-lbl">{d.label}</div>}
            {d.ar && <div class="rd-ar" dir="rtl" lang="ar">{d.ar}</div>}
            {d.tr && <Reveal label={t('read.tr')} text={d.tr} cls="tr" />}
            {d.ru && <Reveal label={t('read.mean')} text={d.ru} cls="ru" />}
            {d.src && <div class="rd-src">{d.src}</div>}
          </section>
        ))}
      </div>
      <div class="rd-bar">
        <button class="btn ghost" onClick={() => resize(-1)} disabled={size === 0} aria-label={t('read.smaller')}>
          <span class="rd-a sm" aria-hidden="true">A</span><span>{t('read.smaller')}</span>
        </button>
        <button class="btn ghost" onClick={() => resize(1)} disabled={size === SIZES.length - 1} aria-label={t('read.bigger')}>
          <span class="rd-a" aria-hidden="true">A</span><span>{t('read.bigger')}</span>
        </button>
        <button class={'btn ghost' + (night ? ' sel' : '')} aria-pressed={night} onClick={toggleNight}>{t('read.night')}</button>
      </div>
    </div>
  )
}
