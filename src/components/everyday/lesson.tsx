/* 2.0 этап 1: «Урок дня» — карточка для «Сегодня» и окно чтения на весь экран (как Reader).
   Уроки — lib/lessons.ts (fetch lessons.json, не в первом файле JS). Пока урок не проверен знатоком, вместо текста —
   честная строка «урок готовится». «Проверь себя» — без баллов, похвал и сохранения результатов:
   после ответа спокойно показан верный вариант и пояснение, «Ещё раз» — заново. */
import { useEffect, useRef, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import { LESSON_COUNT, LESSON_MINUTES, lessonAt, lessonOfDay, lessonTitle, lessons, lessonsError, loadLessons, type Lesson, type LessonCheck } from '../../lib/lessons'
import { lang } from '../../lib/store'
import { kzToday } from '../../lib/today-day'
import { t, tf } from '../../lib/i18n'
import { useDialog } from '../ui'

/** Номер открытого урока (1…N) или null — окно чтения закрыто */
export const lessonOpen = signal<number | null>(null)

/** Уроки на языке интерфейса; при смене языка — перезагрузка */
function useLessonsLoaded() {
  const l = lang.value
  useEffect(() => { void loadLessons(l) }, [l])
}

/** «Урок 6. Вуду…» или «Урок 16», если названия ещё нет */
function heading(n: number, x: Lesson | null): string {
  const num = tf('ls.n', { n })
  return x?.title ? `${num}. ${x.title}` : num
}

/** Карточка «Урок дня» на экране «Сегодня»: одна кнопка «Читать» (аудио — позже) */
export function LessonCard(_: { go: (h: string) => void }) {
  useLessonsLoaded()
  // номер — на каждой отрисовке (приложение открыто через полночь — урок сменится с минутным тиком «Сегодня»);
  // первый показ карточки ставит дату старта, повторные — не трогают (запись идемпотентна). Дата — по Казахстану
  const n = lessonOfDay(kzToday(), true)
  const x = lessonAt(n)
  return (
    <section class="card ls-card" aria-labelledby="ls-card-h">
      <p class="kicker">{tf('ls.kicker', { m: x?.minutes ?? LESSON_MINUTES })}</p>
      <h2 id="ls-card-h">{heading(n, x)}</h2>
      {x?.status === 'preparing' && <p class="ls-wait">{t('ls.prep.card')}</p>}
      <p class="muted"><small>{tf('ls.of', { n, all: LESSON_COUNT })}</small></p>
      <div class="btns"><button class="btn" onClick={() => { lessonOpen.value = n }}>{t('ls.read')}</button></div>
    </section>
  )
}

/** «Проверь себя»: варианты-кнопки; после ответа — верный вариант и пояснение, без оценок */
function Check({ c }: { c: LessonCheck }) {
  const [picked, setPicked] = useState<number | null>(null)
  const res = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (picked !== null) res.current?.focus({ preventScroll: false }) }, [picked])
  const shown = picked !== null
  return (
    <section class="ls-check" aria-labelledby="ls-check-h">
      <h2 id="ls-check-h">{t('ls.check')}</h2>
      <p class="ls-q">{c.q}</p>
      <div class="ls-opts">
        {c.options.map((o, k) => (
          <button key={k} class={'ls-opt' + (shown && k === c.answer ? ' ok' : '')} aria-pressed={picked === k} onClick={() => setPicked(k)}>{o}</button>
        ))}
      </div>
      {shown && (
        // одна озвучка: фокус на заголовке ответа (без живой области — иначе ответ прочитается дважды)
        <div class="ls-res">
          <h3 class="ls-res-h" ref={res} tabIndex={-1}>{tf('ls.answer', { a: c.options[c.answer] })}</h3>
          <p>{c.explain}</p>
          <button class="btn ghost" onClick={() => setPicked(null)}>{t('ls.again')}</button>
        </div>
      )}
    </section>
  )
}

/** Текст урока: готовый — абзацы, источники, вопрос; готовящийся — честная строка */
function Body({ x }: { x: Lesson | null }) {
  if (!x) return lessonsError.value ? <p class="err" role="alert">{t('ls.err')}</p> : <div class="sk" />
  if (x.status !== 'ready') return <p class="ls-wait big">{t('ls.prep.text')}</p>
  return (
    <>
      {x.paragraphs?.map((p, k) => <p key={k} class="ls-p">{p}</p>)}
      {!!x.sources?.length && (
        <section class="ls-src" aria-labelledby="ls-src-h">
          <h2 id="ls-src-h">{t('ls.sources')}</h2>
          <ul>{x.sources.map((s, k) => <li key={k}>{s}</li>)}</ul>
        </section>
      )}
      {x.check && <Check key={x.n} c={x.check} />}
    </>
  )
}

/** Список всех 30 уроков: открыть любой */
function AllLessons({ cur, open }: { cur: number; open: (n: number) => void }) {
  const list = lessons.value?.list
  const nums = Array.from({ length: LESSON_COUNT }, (_, k) => k + 1)
  return (
    <section class="ls-all" aria-labelledby="ls-all-h">
      <h2 id="ls-all-h">{t('ls.all')}</h2>
      <ul class="ls-list">
        {nums.map(n => {
          const x = list?.find(l => l.n === n) ?? null
          return (
            <li key={n}>
              <button class={n === cur ? 'on' : ''} aria-current={n === cur ? 'true' : undefined} onClick={() => open(n)}>
                <b>{n}</b>
                <span>{x ? lessonTitle(x) : tf('ls.n', { n })}</span>
                {x?.status === 'preparing' && <small>{t('ls.preparing')}</small>}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Окно чтения урока (поверх экрана, как Reader): ловушка фокуса, Escape и «Назад» закрывают */
export function LessonReader() {
  const n = lessonOpen.value
  const open = n !== null
  const box = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLHeadingElement>(null)
  useLessonsLoaded()
  useDialog(box, open, () => { lessonOpen.value = null })
  if (n === null) return null
  const x = lessonAt(n)
  const openOther = (k: number) => {
    lessonOpen.value = k
    body.current?.scrollTo?.(0, 0)
    head.current?.focus({ preventScroll: true })
  }
  return (
    <div class="reader ls-reader" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ls-h">
      <div class="rd-top">
        <h1 id="ls-h" ref={head} tabIndex={-1}>{heading(n, x)}</h1>
        <button class="btn ghost sm" onClick={() => { lessonOpen.value = null }}>{t('step.close')} <span aria-hidden="true">✕</span></button>
      </div>
      <div class="rd-body ls-body" ref={body}>
        <div class="ls-text"><Body x={x} /></div>
        <AllLessons cur={n} open={openOther} />
      </div>
    </div>
  )
}
