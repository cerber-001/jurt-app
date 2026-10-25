/* Экран «Сегодня»: следующий намаз, таблица времени, погода, кибла и план дня из программы.
   Город — из программы по дате (или вручную). Намаз считается локально (prayer.ts), погода — Open-Meteo с кэшем. */
import { useEffect, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import { CITIES, METHOD_NAMES, ORDER, cityByName, hhmm, next, qibla, times, type City, type Next } from '../lib/prayer'
import { fetchProgram, type Program, type ProgramDay } from '../lib/program'
import { cityId, lang } from '../lib/store'
import { weather, wmo, type Wx } from '../lib/weather'
import { fmtDate, pick, t } from '../lib/i18n'
import { Card } from './ui'

/* Программа — одна на приложение, грузится один раз */
export const program = signal<Program | null>(null)
export const programError = signal('')
let busy = false
export async function loadProgram() {
  if (program.value || busy) return program.value
  busy = true
  try { program.value = await fetchProgram(); programError.value = '' }
  catch (e) { programError.value = (e as Error).message }
  finally { busy = false }
  return program.value
}

/** Дата YYYY-MM-DD в заданном смещении от UTC (часы) */
export function isoAt(now: Date, tzHours: number) {
  return new Date(now.getTime() + tzHours * 3600_000).toISOString().slice(0, 10)
}

/** Сегодняшний (или ближайший будущий) день программы */
export function pickDay(p: Program | null, todayIso: string): { day: ProgramDay; upcoming: boolean } | null {
  if (!p) return null
  const d = p.days.find(x => x.date === todayIso)
  if (d) return { day: d, upcoming: false }
  const u = p.days.find(x => x.date > todayIso)
  return u ? { day: u, upcoming: true } : null
}

const EMOJI: Record<string, string> = { sun: '☀️', cloud: '⛅', fog: '🌫️', rain: '🌧️', snow: '❄️', storm: '⛈️' }

export function useCity(day?: ProgramDay): City {
  const manual = cityId.value ? CITIES.find(c => c.id === cityId.value) : undefined
  return manual || cityByName(day?.city) || CITIES[0]
}

export function Today() {
  const [now, setNow] = useState(new Date())
  const [wx, setWx] = useState<Wx | null>(null)
  useEffect(() => { loadProgram() }, [])
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id) }, [])

  const local = isoAt(now, -now.getTimezoneOffset() / 60)
  const picked = pickDay(program.value, local)
  const city = useCity(picked?.day)
  const cityIso = isoAt(now, city.tz)
  const nx = next(now, city.lat, city.lon, city.tz, city.method)
  const tt = times(new Date(now.getTime() + city.tz * 3600_000), city.lat, city.lon, city.tz, city.method)
  const L = lang.value

  useEffect(() => { weather(city.id, city.lat, city.lon).then(setWx) }, [city.id])

  return (
    <>
      <Card cls="mint">
        <div class="kicker">{t('today.next')} · {pick(city.names)} · {fmtDate(cityIso)}</div>
        {nx ? <NextPrayer nx={nx} /> : <p class="muted">—</p>}
        <label class="f">{t('today.city')}
          <select value={cityId.value} onChange={e => (cityId.value = (e.target as HTMLSelectElement).value)}>
            <option value="">{t('today.auto')}{picked ? ` · ${picked.day.city}` : ''}</option>
            {CITIES.map(c => <option key={c.id} value={c.id}>{pick(c.names)}</option>)}
          </select>
        </label>
      </Card>

      <Card>
        <h2>{t('today.prayers')}</h2>
        <table class="tbl">
          <tbody>
            {ORDER.map(k => (
              <tr key={k} class={nx?.key === k ? 'mine' : ''}>
                <td>{t('p.' + k)}{k === 'dhuhr' && nx?.friday ? <small class="muted"> · {t('today.jumua')}</small> : null}</td>
                <td><b>{hhmm(tt[k])}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p class="muted"><small>{t('today.method')}: {METHOD_NAMES[city.method]?.[L] || METHOD_NAMES[city.method]?.ru || city.method} · {t('today.todaytz')} UTC{city.tz >= 0 ? '+' : ''}{city.tz}</small></p>
      </Card>

      <Qibla city={city} />

      <Card>
        <h2>{t('today.weather')} · {pick(city.names)}</h2>
        {wx ? <Weather wx={wx} todayIso={cityIso} /> : <div class="sk" />}
      </Card>

      <Card cls="sand">
        <h2>{picked?.upcoming ? t('today.nextday') : t('today.plan')}</h2>
        {picked ? <DayPlan day={picked.day} /> : <p class="muted">{programError.value || t('today.noplan')}</p>}
        <p><a href="#program" onClick={e => { e.preventDefault(); dispatchEvent(new CustomEvent('jurt:tab', { detail: 'program' })) }}>{t('tab.program')} →</a></p>
      </Card>
    </>
  )
}

function NextPrayer({ nx }: { nx: Next }) {
  const h = Math.floor(nx.left / 60), m = nx.left % 60
  return (
    <p class="now">
      <b>{t('p.' + nx.key)}</b> {hhmm(nx.min)} · {t('today.in')} {h > 0 ? `${h} ${t('today.h')} ` : ''}{m} {t('today.m')}
    </p>
  )
}

function Weather({ wx, todayIso }: { wx: Wx; todayIso: string }) {
  const i0 = Math.max(0, wx.daily.time.indexOf(todayIso))
  const L = lang.value
  const rows = [0, 1, 2, 3].map(k => i0 + k).filter(i => i < wx.daily.time.length)
  return (
    <>
      {rows.map((i, k) => {
        const w = wmo(wx.daily.weather_code[i], L)
        return (
          <div class={'kv' + (k === 0 ? ' now' : '')} key={i}>
            <span>{k === 0 ? t('tab.today') : fmtDate(wx.daily.time[i])}</span>
            <span>{EMOJI[w.icon] || ''} {w.label} · {Math.round(wx.daily.temperature_2m_min[i])}…{Math.round(wx.daily.temperature_2m_max[i])}°
              {k === 0 && <small class="muted"> · {t('today.rain')} {wx.daily.precipitation_probability_max[i]}% · {t('today.wind')} {Math.round(wx.daily.wind_speed_10m_max[i])} км/ч · {t('today.uv')} {Math.round(wx.daily.uv_index_max[i])}</small>}
            </span>
          </div>
        )
      })}
      <p class="muted"><small>{t('today.sunrise')} {wx.daily.sunrise[i0]?.slice(11, 16)} · {t('today.sunset')} {wx.daily.sunset[i0]?.slice(11, 16)}</small></p>
    </>
  )
}

function Qibla({ city }: { city: City }) {
  const q = Math.round(qibla(city.lat, city.lon))
  const [heading, setHeading] = useState<number | null>(null)
  const [state, setState] = useState<'idle' | 'on' | 'no'>('idle')
  async function start() {
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent
    try { if (DOE?.requestPermission) { const r = await DOE.requestPermission(); if (r !== 'granted') { setState('no'); return } } } catch { /* не iOS */ }
    const on = (e: DeviceOrientationEvent) => {
      const wk = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
      const h = typeof wk === 'number' ? wk : e.absolute && e.alpha != null ? 360 - e.alpha : null
      if (h != null) { setHeading(h); setState('on') }
    }
    addEventListener('deviceorientationabsolute' as 'deviceorientation', on)
    addEventListener('deviceorientation', on)
    setTimeout(() => setState(s => (s === 'idle' ? 'no' : s)), 3000)
  }
  const rot = heading == null ? 0 : q - heading
  return (
    <Card>
      <h2>{t('today.qibla')} · {q}°</h2>
      <div class="xrow" style="align-items:center;gap:1rem">
        <div style={`width:72px;height:72px;border-radius:50%;border:2px solid var(--line);display:grid;place-items:center;transition:transform .3s var(--ease);transform:rotate(${rot}deg)`}>
          <span style="font-size:2rem;line-height:1;color:var(--orange)">▲</span>
        </div>
        <div>
          {state !== 'on' && <button class="btn ghost sm" onClick={start} disabled={state === 'no'}>{t('today.compass')}</button>}
          <p class="muted"><small>{state === 'no' ? t('today.compassno') : t('today.compasshint')}</small></p>
        </div>
      </div>
    </Card>
  )
}

export function DayPlan({ day }: { day: ProgramDay }) {
  return (
    <>
      <div class="day-h"><b>{fmtDate(day.date)}</b><small>{day.city}{day.title ? ' · ' + day.title : ''}{day.tz ? ' · ' + day.tz : ''}</small></div>
      <div class="prog">
        {day.items.map((i, k) => (
          <>
            <span class="t" key={'t' + k}>{i.t}</span>
            <span key={'w' + k}>
              {i.w}{i.p ? <small class="muted"> · {i.p}</small> : null}{i.tr ? <small class="muted"> · {i.tr}</small> : null}
              {i.who ? <small class="muted"> · {i.who}</small> : null}{i.pay ? <span class="pay"> · {i.pay}</span> : null}
              {i.m ? <div class="muted"><small>{i.m}</small></div> : null}
            </span>
          </>
        ))}
      </div>
    </>
  )
}
