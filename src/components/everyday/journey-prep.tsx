/* «Мой путь» → «Подготовка по дням»: шесть дел с крайним сроком относительно даты поездки.
   Кружок слева — отметка дела (role="checkbox", 44px), остальная строка — переход к материалу (урок, дуа, шаг, сборы).
   Это отметки ДЕЛ подготовки, а не поклонения: ни похвал, ни звёзд, ни очков. Хранение — jurt.prep. */
import { useState } from 'preact/hooks'
import { PREP_DAYS, PREP_IDS, dueDate, fmtFull, readPrep, savePrep, togglePrep, type PrepId, type PrepState } from '../../lib/journey'
import { lessonOfDay } from '../../lib/lessons'
import { kzToday } from '../../lib/today-day'
import { fetchLocalized, type Dua } from '../../lib/content'
import { fmtDate, t, tf } from '../../lib/i18n'
import { lang } from '../../lib/store'
import { reading } from '../reader'
import { nearby } from '../nearby'
import { lessonOpen } from './lesson'

type Go = (h: string) => void

/** Открыть дуа «Тальбия» в окне чтения; без сети и копии — раздел «Дуа» */
async function openTalbiya(go: Go) {
  try {
    const { data } = await fetchLocalized<Dua[]>('dua.json', lang.value)
    const d = data.find(x => x.id === 'talbiya')
    if (!d?.items?.length) throw new Error('talbiya')
    reading.value = { title: d.title, items: d.items }
  } catch { go('more/dua') }
}

/** Что открывает строка дела (null — дело без перехода, только отметка) */
function actionOf(id: PrepId, go: Go, lesson: number): (() => void) | null {
  switch (id) {
    case 'lessons': return () => { lessonOpen.value = lesson }
    case 'talbiya': return () => { void openTalbiya(go) }
    case 'ihram': return () => { nearby.value = 'ihram' }
    case 'pack': return () => go('more/pack')
    default: return null
  }
}

/** Срок дела: «05.12» в этом году; в другом году — с годом («05.01.2027», «5 Jan 2027») */
function dueText(iso: string, today: string): string {
  return iso.slice(0, 4) === today.slice(0, 4) ? fmtDate(iso) : fmtFull(iso)
}

export function PrepList({ start, go }: { start: string | null; go: Go }) {
  const [marks, setMarks] = useState<PrepState>(readPrep)
  // номер урока только смотрим: дату старта уроков ставит карточка «Урок дня»
  const today = kzToday()
  const lesson = lessonOfDay(today, false)
  const flip = (id: PrepId) => { const v = togglePrep(marks, id); setMarks(v); savePrep(v) }
  const k = PREP_IDS.filter(id => marks[id]).length
  const n = PREP_IDS.length

  return (
    <section class="card jr-prep-card" aria-labelledby="jr-prep-h">
      <h2 id="jr-prep-h">{t('jr.prep')}</h2>
      <div class="pbar" role="progressbar" aria-labelledby="jr-prep-h" aria-valuemin={0} aria-valuemax={n} aria-valuenow={k}
        aria-valuetext={tf('jr.prep.got', { k, n })}><i style={{ width: (k / n) * 100 + '%' }} /></div>
      <p class="muted jr-got"><small>{tf('jr.prep.got', { k, n })}</small></p>
      <ul class="jr-prep">
        {PREP_IDS.map(id => {
          const on = !!marks[id]
          const act = actionOf(id, go, lesson)
          const sub = id === 'lessons' ? tf('jr.p.lessons.s', { n: lesson }) : t(`jr.p.${id}.s`)
          const due = start ? tf('jr.due', { d: dueText(dueDate(start, PREP_DAYS[id]), today) }) : ''
          const text = (
            <>
              <b id={'jr-p-' + id}>{t('jr.p.' + id)}</b>
              <small class={id === 'lessons' ? 'jr-cur' : ''}>{sub}</small>
              {due && <small class="jr-due">{due}</small>}
            </>
          )
          return (
            <li key={id} class={on ? 'done' : ''}>
              <button class="jr-chk" role="checkbox" aria-checked={on} aria-labelledby={'jr-p-' + id} onClick={() => flip(id)}>
                <span aria-hidden="true">✓</span>
              </button>
              {act
                ? <button class="jr-open" onClick={act}><span class="jr-t">{text}</span><i aria-hidden="true">›</i></button>
                : <span class="jr-t">{text}</span>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
