/* 2.0 этап 1 «Каждый день»: экран «Сегодня» (бриф 2.0 §7 A, без уведомлений).
   Сверху вниз: герой (дата, хиджра, следующий намаз) → «Намаз сегодня · <город>» → азкары утра/вечера →
   мысль дня → тасбих → «Урок дня» (карточка сборщика B, lesson.tsx).
   Время — «стенное» Казахстана (UTC+5). Намаз: сначала то, что уже на телефоне (копия ДУМК или расчёт),
   сеть к ДУМК первый показ не задерживает — год скачивается в простое после первой отрисовки, и экран тихо обновляется.
   Не скачалось: нет сети — повтор, когда сеть появится; API ответил ошибкой — повтор при возврате в приложение
   или по «online», но не чаще раза в 10 минут. */
import { useEffect, useState } from 'preact/hooks'
import { demo, useNow, wall } from '../../lib/clock'
import { floorMinute, useMinuteTick } from '../../lib/tick'
import { ensureYear, timesForDay, wantedYears, type DayResult } from '../../lib/dumk'
import { cityById, readCityId, saveCityId, type KzCity } from '../../lib/today-cities'
import { KZ_TZ, addDays, isMorning, nextPrayer } from '../../lib/today-day'
import { PrayerCard, TodayHero, type PrayerStatus } from './today-prayer'
import { AzkarCard, ThoughtCard } from './today-read'
import { TasbihCard } from './today-tasbih'
import { countdown, ownProgram, readTrip, savedProgram, tripOf } from '../../lib/journey'
import { data, groupCode } from '../../lib/store'
import { program } from '../today'
import { LessonCard } from './lesson'
import { InstallHint } from '../install'
import { t } from '../../lib/i18n'

/** Текущее время с точностью до минуты; экран сам перерисуется на следующей минуте */
function useMinuteNow(): Date {
  const raw = useNow(null)
  useMinuteTick(raw)
  return floorMinute(raw)
}

/** Повтор после ответа API с ошибкой — не чаще раза в 10 минут */
const RETRY_MS = 10 * 60_000
/** Первая загрузка года — в простое, но не позже чем через 4 с; без requestIdleCallback — через 1,5 с */
const IDLE_TIMEOUT_MS = 4000
const IDLE_FALLBACK_MS = 1500

/** Выполнить fn, когда браузер свободен (после первой отрисовки); возвращает отмену */
function whenIdle(fn: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(fn, { timeout: IDLE_TIMEOUT_MS })
    return () => { if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id) }
  }
  const id = setTimeout(fn, IDLE_FALLBACK_MS)
  return () => clearTimeout(id)
}

/** Скачать расписание ДУМК на нужные годы (в декабре — и на следующий), если его ещё нет на телефоне.
    Возвращает, для какого города и годов загрузка уже закончилась (удачно или нет) */
function useDumkYears(city: KzCity, iso: string): string {
  const key = city.id + ':' + wantedYears(iso).join(',')
  const [done, setDone] = useState('')
  useEffect(() => {
    let live = true
    let last = 0                // когда пробовали в последний раз
    let failed = false          // последняя попытка не удалась
    let offline = false         // …и при этом не было сети: «online» повторяет сразу
    let runs = 0                // номер попытки: каждая законченная попытка перерисовывает экран
    const run = async () => {
      last = Date.now()
      let ok = true
      for (const y of wantedYears(iso)) ok = (await ensureYear(city, y)) && ok
      failed = !ok
      offline = !ok && navigator.onLine === false
      if (live) setDone(key + ':' + ++runs)
    }
    const retry = (now: boolean) => { if (live && failed && (now || Date.now() - last >= RETRY_MS)) void run() }
    const cancel = whenIdle(() => { if (live) void run() })
    const onOnline = () => retry(offline)
    const onShow = () => { if (document.visibilityState === 'visible') retry(false) }
    addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onShow)
    return () => {
      live = false; cancel()
      removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [key])
  return done.startsWith(key + ':') ? key : ''
}

/** Поездка задана (вручную в «Мой путь» или программой своей группы) и ещё не закончилась */
function useTripAhead(today: string): boolean {
  const [saved] = useState(savedProgram)
  const p = ownProgram(program.value ?? saved, data.value?.group?.code || groupCode.value)
  const trip = tripOf(p, !!data.value || demo, readTrip(), today)
  return !!trip && countdown(trip.start, trip.end, today).kind !== 'after'
}

const statusOf = (r: DayResult, loaded: boolean): PrayerStatus => (r.src === 'dumk' ? 'dumk' : loaded ? 'calc' : 'loading')

export function TodayScreen({ go }: { go: (h: string) => void }) {
  const now = useMinuteNow()
  const w = wall(now, KZ_TZ)
  const tomorrowIso = addDays(w.iso, 1)
  const [cityId, setCityId] = useState(readCityId)
  const city = cityById(cityId)
  const loaded = useDumkYears(city, w.iso) !== ''
  const road = useTripAhead(w.iso)

  const today = timesForDay(city, w.iso)
  const tomorrow = timesForDay(city, tomorrowIso)
  const next = nextPrayer(w.min, today.times, tomorrow.times)
  const shown = next.tomorrow ? tomorrow : today

  const changeCity = (id: string) => { saveCityId(id); setCityId(cityById(id).id) }

  return (
    <div class="td">
      <h1 class="sr-only">{t('nav.today')}</h1>
      <TodayHero iso={w.iso} next={next} />
      <PrayerCard city={city} iso={next.tomorrow ? tomorrowIso : w.iso} times={shown.times} status={statusOf(shown, loaded)}
        next={next} nowMin={w.min} onCity={changeCity} />
      <AzkarCard morningNow={isMorning(w.min, today.times)} />
      <ThoughtCard iso={w.iso} road={road} />
      <TasbihCard iso={w.iso} />
      <LessonCard go={go} />
      {/* без экрана «Домой» iPhone может стереть офлайн-копию — подсказка та же, что на «Сейчас» */}
      <InstallHint go={go} />
    </div>
  )
}
