/* «Сегодня»: тасбих без очков. Большая круглая кнопка «+1», три фразы по 33 по кругу (зикр tasbih из
   content/zikr.json, источник — Муслим № 597). Ни итогов, ни рекордов, ни похвалы: только счёт внутри фразы.
   Счёт — в памяти (хранилище закрыто — всё равно считает), копия на телефоне до конца дня, на следующий день — с нуля.
   Озвучка: счёт — в названии кнопки («Плюс один, 5 из 33, …»), живая область говорит только о смене фразы. */
import { useState } from 'preact/hooks'
import type { Zikr } from '../../lib/content'
import { t, tf } from '../../lib/i18n'
import { BLOCK, PHRASES, setTasbihCount, tasbihCount, tasbihView } from '../../lib/today-tasbih'
import { useLocalized } from './today-read'

const BUZZ_TAP = 15
const BUZZ_BLOCK = [60, 40, 60]

export function TasbihCard({ iso }: { iso: string }) {
  const z = useLocalized<Zikr[]>('zikr.json')
  // счёт читаем в каждой отрисовке: новый день — сразу ноль, без отдельного таймера
  const [, bump] = useState(0)
  const n = tasbihCount(iso)
  const v = tasbihView(n)
  const ph = z.data?.find(x => x.id === 'tasbih')?.ph?.slice(0, PHRASES) ?? []
  const cur = ph[v.phrase], nxt = ph[v.next]
  const put = (x: number) => { setTasbihCount(iso, x); bump(k => k + 1) }
  const add = () => {
    // счёт берём заново: быстрое двойное касание до перерисовки засчитывается дважды
    const next = tasbihCount(iso) + 1
    navigator.vibrate?.(next % BLOCK === 0 ? BUZZ_BLOCK : BUZZ_TAP)
    put(next)
  }
  return (
    <section class="card td-tas" aria-labelledby="td-tas-h">
      <h2 id="td-tas-h" class="td-k">{t('today.tasH')}</h2>
      <div class="td-tas-in">
        <button class="td-tas-btn" onClick={add}
          aria-label={tf('today.tasAria', { n: v.count, all: BLOCK, x: cur?.tr ?? '' }).replace(/, $/, '')}>
          <b aria-hidden="true">{v.count}</b><small>{t('today.tasTap')}</small>
        </button>
        <div class="td-tas-txt" lang={z.lang ?? undefined}>
          {cur ? <>
            <p class="td-ar" lang="ar" dir="rtl">{cur.ar}</p>
            <p class="td-tas-tr">{cur.tr}</p>
            {nxt && <p class="td-tas-next">{tf('today.tasNext', { x: nxt.tr })}</p>}
          </> : <p class="muted">{z.failed ? t('err.content') : t('c.loading')}</p>}
          <button class="linkbtn td-tas-reset" onClick={() => put(0)} disabled={n === 0}>{t('today.tasReset')}</button>
        </div>
      </div>
      <p class="sr-only" aria-live="polite" aria-atomic="true">{cur?.tr ?? ''}</p>
      <p class="td-note">{t('today.tasHint')}</p>
    </section>
  )
}
