/* «Сегодня»: карточка-герой (дата, хиджра, следующий намаз) и «Намаз сегодня · <город>» с выбором города.
   Данные — из today.tsx: время ДУМК с телефона или запасной расчёт; здесь только показ. */
import { useEffect, useRef, useState } from 'preact/hooks'
import { hhmm } from '../../lib/prayer'
import { leftText } from '../../lib/clock'
import { t, tf } from '../../lib/i18n'
import { lang } from '../../lib/store'
import { KZ_CITIES, nearestCity, type KzCity } from '../../lib/today-cities'
import { dmy, hijriParts, weekday, type NextPrayer } from '../../lib/today-day'
import type { DayKey, DayTimes } from '../../lib/dumk'

/** Откуда сейчас время на экране: ДУМК с телефона, расчёт пока грузится, расчёт без сети */
export type PrayerStatus = 'dumk' | 'loading' | 'calc'

const cityName = (c: KzCity) => c.names[lang.value] || c.names.ru
export const leftLabel = (mins: number) => tf('today.left', { t: leftText(mins, t('today.h'), t('today.m')) })

function hijriLine(iso: string): string {
  const h = hijriParts(iso)
  return h ? tf('today.hijri', { d: h.d, m: t('today.hm.' + h.m), y: h.y }) : ''
}

export function TodayHero({ iso, next }: { iso: string; next: NextPrayer }) {
  const hijri = hijriLine(iso)
  const title = tf(next.tomorrow ? 'today.atTomorrow' : 'today.at', { p: t('p.' + next.key), t: hhmm(next.min) })
  return (
    <section class="hero td-hero" aria-labelledby="td-next">
      <div class="hero-k">{t('today.wd.' + weekday(iso))} · {dmy(iso)}</div>
      {hijri && <p class="td-hijri"><span class="td-hijri-d" title={t('today.hijriNote')}>{hijri}</span>
        <span class="sr-only"> ({t('today.hijriNote')})</span></p>}
      <div class="hero-t">{t('today.next')}</div>
      {/* строка меняется каждую минуту — это h2; h1 экрана — скрытый «Сегодня» (today.tsx) */}
      <h2 class="hero-h" id="td-next">{title}<small class="td-left">{leftLabel(next.left)}</small></h2>
    </section>
  )
}

interface Row { key: Exclude<DayKey, 'sunrise'>; sub?: string }

interface PrayerCardProps {
  city: KzCity
  /** день, который показан в таблице (сегодня или, после иша, завтра) */
  iso: string
  times: DayTimes
  status: PrayerStatus
  next: NextPrayer
  /** минута «сейчас»; для таблицы завтрашнего дня прошедших строк нет */
  nowMin: number
  onCity: (id: string) => void
}

export function PrayerCard({ city, iso, times, status, next, nowMin, onCity }: PrayerCardProps) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  /** Закрыть список и вернуть фокус на «Город» (после выбора, Escape) */
  const close = () => { setOpen(false); btn.current?.focus() }
  const rows: Row[] = [
    { key: 'fajr', sub: `${t('today.sunrise')} ${hhmm(times.sunrise)}` },
    { key: 'dhuhr' },
    { key: 'asr', sub: t('today.hanafi') },
    { key: 'maghrib' },
    { key: 'isha' },
  ]
  const src = { c: cityName(city), d: dmy(iso) }
  const srcText = status === 'dumk' ? tf('today.srcDumk', src) : status === 'calc' ? tf('today.srcCalc', src) : t('today.srcLoading')
  const pick = (id: string) => { onCity(id); close() }
  return (
    <section class="card td-pt" aria-labelledby="td-pt-h">
      <div class="td-pt-top">
        <h2 id="td-pt-h">{t(next.tomorrow ? 'today.ptTomorrow' : 'today.ptToday')} · {cityName(city)}</h2>
        <button ref={btn} class="btn ghost sm td-city-btn" aria-expanded={open} aria-controls="td-cities"
          aria-label={tf('today.cityChangeLong', { c: cityName(city) })} onClick={() => setOpen(!open)}>
          {t('today.cityChange')} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
      </div>
      {open && <CityPicker cur={city.id} onPick={pick} onClose={close} />}
      <ul class="td-rows">
        {rows.map(r => {
          const isNext = r.key === next.key
          const past = !next.tomorrow && !isNext && times[r.key] <= nowMin
          return (
            <li key={r.key} class={isNext ? 'next' : past ? 'past' : ''} aria-current={isNext ? 'true' : undefined}>
              <span>{t('p.' + r.key)}{isNext ? <small>{leftLabel(next.left)}</small> : r.sub && <small>{r.sub}</small>}</span>
              <b>{hhmm(times[r.key])}</b>
            </li>
          )
        })}
      </ul>
      <p class="td-src" aria-live="polite">{srcText}</p>
    </section>
  )
}

type GeoState = '' | 'seek' | 'denied' | 'nogeo'

interface CityPickerProps { cur: string; onPick: (id: string) => void; onClose: () => void }

/** Список городов и «Определить по геопозиции». Координаты телефона сравниваются со списком здесь же и никуда не уходят.
    Список закрыли до ответа геопозиции — поздний ответ ничего не меняет (флаг live снимается при закрытии) */
function CityPicker({ cur, onPick, onClose }: CityPickerProps) {
  const [geo, setGeo] = useState<GeoState>('')
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  const locate = () => {
    if (!navigator.geolocation) { setGeo('nogeo'); return }
    setGeo('seek')
    navigator.geolocation.getCurrentPosition(
      p => { if (live.current) onPick(nearestCity(p.coords.latitude, p.coords.longitude).id) },
      () => { if (live.current) setGeo('denied') },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 600_000 },
    )
  }
  const geoText = geo === 'seek' ? t('today.citySeek') : geo === 'denied' ? t('today.cityDenied')
    : geo === 'nogeo' ? t('today.cityNoGeo') : ''
  return (
    <div class="td-cities" id="td-cities" role="group" aria-label={t('today.cityPick')}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <button class="btn td-geo" onClick={locate}>{t('today.cityGeo')}</button>
      <p class="td-note">{t('today.cityGeoNote')}</p>
      {geoText && <p class="td-note" role="status">{geoText}</p>}
      <div class="td-city-grid">
        {KZ_CITIES.map(c => (
          <button key={c.id} data-city={c.id} class={'btn ghost' + (c.id === cur ? ' sel' : '')} aria-pressed={c.id === cur}
            onClick={() => onPick(c.id)}>{cityName(c)}</button>
        ))}
      </div>
    </div>
  )
}
