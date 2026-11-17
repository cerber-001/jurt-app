/* Счётчик кругов тавафа и отрезков саи для режима «Рядом»: одна огромная цифра и семь делений.
   Счёт хранится на телефоне под тем же ключом, что у колец из гида v2 (jurt.cnt-<id>). */
import { useEffect, useRef, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
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
  // в обработчиках счёт берём из хранилища заново, а не из отрисовки: быстрое двойное касание до перерисовки
  // засчитывается дважды, а седьмой круг (вибрация, звук) срабатывает ровно один раз
  return {
    n,
    add: () => {
      const next = read(id) + 1
      if (next > ROUNDS) return
      navigator.vibrate?.(next === ROUNDS ? BUZZ_FINISH : BUZZ_ROUND)
      chime(next === ROUNDS)
      put(next)
    },
    undo: () => put(read(id) - 1),
    reset: () => put(0),
  }
}

/** Подсказки кругов из контента шага: data-hint-1 … data-hint-7 */
export function hintsOf(html: string): string[] {
  return Array.from({ length: ROUNDS }, (_, k) => html.match(new RegExp(`data-hint-${k + 1}="([^"]*)"`))?.[1] ?? '')
}

const R = 52
const CIRC = 2 * Math.PI * R
const TURN = 360 / ROUNDS
/** Сколько длится перелистывание цифры (как в .dial-n .was в wow.css) */
const FLIP_MS = 520

/** Точка на окружности циферблата: угол от «12 часов» по часовой стрелке */
const at = (deg: number, r = R) => {
  const a = ((deg - 90) * Math.PI) / 180
  return { x: 60 + r * Math.cos(a), y: 60 + r * Math.sin(a) }
}

/** Тихий звук на каждый круг — по желанию (вибрация в Safari на iPhone не работает). Хранится на телефоне */
const SOUND_KEY = 'jurt.snd'
export const sound = signal(ls.get(SOUND_KEY) === '1')
/** Включить или выключить звук. При включении сразу звучит пробный тон: человек слышит, что звук есть, а Safari разрешает его по нажатию */
export function toggleSound(): void {
  sound.value = !sound.value
  ls.set(SOUND_KEY, sound.value ? '1' : '')
  if (sound.value) chime(false)
}

let audio: AudioContext | null = null

/** Сыграть тоны сейчас (контекст уже работает) */
function tones(ctx: AudioContext, final: boolean) {
  const notes = final ? [523.25, 659.25] : [659.25]
  notes.forEach((f, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + i * 0.18
    o.type = 'sine'; o.frequency.value = f
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(0.06, t0 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45)
    o.connect(g).connect(ctx.destination)
    o.start(t0); o.stop(t0 + 0.5)
  })
}

/** Короткий мягкий тон; на седьмом круге — два тона. Звук включается только нажатием, поэтому Safari его разрешает */
export function chime(final: boolean) {
  if (!sound.value) return
  try {
    const ctx = audio ??= new AudioContext()
    // Safari держит звук «на паузе» (suspended), а после звонка или блокировки экрана на iPhone — «прерванным»
    // (interrupted). Тогда сначала будим контекст и играем, только когда он проснулся; не проснулся — тишина
    if (ctx.state === 'running') { tones(ctx, final); return }
    ctx.resume().then(() => { try { tones(ctx, final) } catch { /* без звука */ } }).catch(() => undefined)
  } catch { /* браузер без Web Audio — молча без звука */ }
}

/** Цифра, которая перелистывается: новая въезжает снизу, прежняя уходит вверх */
function FlipNumber({ n }: { n: number }) {
  const prev = useRef(n)
  const [was, setWas] = useState<number | null>(null)
  useEffect(() => {
    if (prev.current === n) return
    setWas(prev.current)
    prev.current = n
    const id = setTimeout(() => setWas(null), FLIP_MS)
    return () => clearTimeout(id)
  }, [n])
  return (
    <span class="flip">
      <b key={'n' + n} class={was === null ? '' : 'in'}>{n}</b>
      {was !== null && <b key={'w' + was} class="was" aria-hidden="true">{was}</b>}
    </span>
  )
}

interface DialProps { id: RoundsId; n: number; hints: string[] }

/** Циферблат «как часы»: дуга заполняется плавно, по кругу семь меток, бегущая точка — где вы сейчас */
export function RoundsDial({ id, n, hints }: DialProps) {
  const fin = n >= ROUNDS
  // подсказки в контенте пока только на русском; на других языках — «Круг 4»
  const hint = (lang.value === 'ru' && hints[n]) || `${t(`rnd.${id}.unit`)} ${n + 1}`
  const head = at(TURN * n)
  return (
    <div class={'dial' + (fin ? ' fin' : '')}>
      <div class="dial-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="track" cx="60" cy="60" r={R} />
          <circle class="arc" cx="60" cy="60" r={R} transform="rotate(-90 60 60)"
            stroke-dasharray={CIRC} style={{ strokeDashoffset: CIRC * (1 - n / ROUNDS) }} />
          {Array.from({ length: ROUNDS }, (_, k) => {
            const p = at(TURN * (k + 1))
            return <circle key={k} class={'tick' + (k < n ? ' on' : k === n ? ' cur' : '')} cx={p.x} cy={p.y} r="2.4" />
          })}
          {!fin && <circle class="head" cx={head.x} cy={head.y} r="5" />}
        </svg>
        <div class="dial-n" aria-live="polite" aria-atomic="true"><FlipNumber n={n} /><span>{t('step.of')} {ROUNDS}</span></div>
      </div>
      {/* после седьмого круга итог показывает «Рядом» (Таваф завершён → дальше …), здесь — только круг */}
      {!fin && <div class="kicker">{t('rnd.going')}</div>}
      {!fin && <p class="dial-hint">{hint}</p>}
    </div>
  )
}
