/* Счётчик кругов тавафа и отрезков саи для режима «Рядом»: одна огромная цифра и семь делений.
   Счёт хранится на телефоне под тем же ключом, что у колец из гида v2 (jurt.cnt-<id>). */
import { useState } from 'preact/hooks'
import { lang, ls } from '../lib/store'
import { t } from '../lib/i18n'

export const ROUNDS = 7
export type RoundsId = 'tawaf' | 'sai'
export const isRounds = (id: string): id is RoundsId => id === 'tawaf' || id === 'sai'

const BUZZ_ROUND = 40
const BUZZ_FINISH = [70, 50, 70, 50, 140]
const key = (id: string) => 'jurt.cnt-' + id
const clamp = (v: number) => Math.min(ROUNDS, Math.max(0, v))
const read = (id: string) => clamp(+ls.get(key(id)) || 0)

export interface Rounds { n: number; add: () => void; undo: () => void; reset: () => void }

/** Обнулить оба счётчика (сброс «Снять все отметки» на «Пути») — тем же способом, что put() */
export function clearRounds() {
  for (const id of ['tawaf', 'sai'] as const) ls.set(key(id), '')
}

export function useRounds(id: string): Rounds {
  // счёт читаем из хранилища в каждой отрисовке: при смене шага таваф → саи нет кадра с чужим числом
  const [, bump] = useState(0)
  const n = read(id)
  const put = (v: number) => { const c = clamp(v); ls.set(key(id), c ? String(c) : ''); bump(x => x + 1) }
  return {
    n,
    add: () => {
      if (n >= ROUNDS) return
      navigator.vibrate?.(n + 1 === ROUNDS ? BUZZ_FINISH : BUZZ_ROUND)
      put(n + 1)
    },
    undo: () => put(n - 1),
    reset: () => put(0),
  }
}

/** Подсказки кругов из контента шага: data-hint-1 … data-hint-7 */
export function hintsOf(html: string): string[] {
  return Array.from({ length: ROUNDS }, (_, k) => html.match(new RegExp(`data-hint-${k + 1}="([^"]*)"`))?.[1] ?? '')
}

const R = 54
const CIRC = 2 * Math.PI * R
const GAP = 13
const SEG = CIRC / ROUNDS - GAP
const TURN = 360 / ROUNDS
const GAP_DEG = (GAP / 2 / CIRC) * 360

interface DialProps { id: RoundsId; n: number; hints: string[] }

export function RoundsDial({ id, n, hints }: DialProps) {
  const fin = n >= ROUNDS
  // подсказки в контенте пока только на русском; на других языках — «Круг 4»
  const hint = fin ? t(`rnd.${id}.all`) : (lang.value === 'ru' && hints[n]) || `${t(`rnd.${id}.unit`)} ${n + 1}`
  return (
    <div class={'dial' + (fin ? ' fin' : '')}>
      <div class="dial-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          {Array.from({ length: ROUNDS }, (_, k) => (
            <circle key={k} cx="60" cy="60" r={R} class={k < n ? 'on' : k === n ? 'cur' : ''}
              stroke-dasharray={`${SEG} ${CIRC - SEG}`} transform={`rotate(${-90 + TURN * k + GAP_DEG} 60 60)`} />
          ))}
        </svg>
        <div class="dial-n" aria-live="polite" aria-atomic="true"><b key={n}>{n}</b><span>{t('step.of')} {ROUNDS}</span></div>
      </div>
      {!fin && <div class="kicker">{t('rnd.going')}</div>}
      <p class="dial-hint">{hint}</p>
    </div>
  )
}
