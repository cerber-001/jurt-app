/* Финал умры: после 11-го шага — тихий тёплый экран «Пусть Аллах примет вашу умру» с дуа из Корана 2:127.
   Без наград, очков и конфетти: только мягкий свет и дуа. Свет — градиенты палитры бренда, без картинок.
   Арабский — по тексту Усмани (хафс), сверено 17.11.2026 через quran.ai; смысл — перевод Министерства вакуфов Египта
   (ru), M. A. S. Abdel Haleem (en); казахского перевода смыслов в источнике нет — показываем русский с lang="ru".
   Окно — useDialog (ui.tsx): «Назад» на телефоне и Escape закрывают, Tab не уходит наружу, фокус — на кнопке «Вернуться». */
import { useEffect, useRef } from 'preact/hooks'
import { signal } from '@preact/signals'
import { lang } from '../lib/store'
import { t } from '../lib/i18n'
import { afterOverlayClosed } from '../lib/overlay'
import { useDialog } from './ui'

/** Открыт ли финальный экран */
export const finale = signal(false)

/** Открыть финал, когда закрывающееся сейчас окно («Рядом») снимет свою запись истории браузера.
    Вызывать ДО закрытия того окна: иначе его запоздалый history.back() снял бы запись уже финала (lib/overlay.ts). */
export function openFinale(): void { afterOverlayClosed(() => { finale.value = true }) }

const AYAH = 'رَبَّنَا تَقَبَّلْ مِنَّآ ۖ إِنَّكَ أَنتَ ٱلسَّمِيعُ ٱلْعَلِيمُ'

export function Finale() {
  const open = finale.value
  const box = useRef<HTMLDivElement>(null)
  const goBtn = useRef<HTMLButtonElement>(null)
  const close = () => { finale.value = false }
  useDialog(box, open, close)
  // после useDialog (он ставит фокус на окно): фокус на единственное действие — чтец сразу читает заголовок окна и кнопку
  useEffect(() => { if (open) goBtn.current?.focus({ preventScroll: true }) }, [open])
  if (!open) return null
  const meanLang = lang.value === 'kk' ? 'ru' : undefined
  return (
    <div class="finale" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="fin-h">
      <div class="finale-light" aria-hidden="true"><i /><i /></div>
      <div class="finale-in">
        <div class="kicker">{t('umra.k')}</div>
        <h1 id="fin-h">{t('umra.h')}</h1>
        <div class="finale-dua">
          <div class="lbl">{t('umra.lbl')}</div>
          <div class="ar" dir="rtl" lang="ar">{AYAH}</div>
          <div class="tr">{t('umra.tr')}</div>
          <div class="ru" lang={meanLang}>{t('umra.mean')}</div>
          <div class="src">{t('umra.src')}</div>
        </div>
        <p class="finale-p">{t('umra.p')}</p>
        <button class="btn finale-go" ref={goBtn} onClick={close}>{t('umra.close')}</button>
      </div>
    </div>
  )
}
