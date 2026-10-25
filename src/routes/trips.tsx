/* Витрина поездок (Supabase public.trips): только публичные карточки, без персональных данных.
   /trips — список, /trip/:code — карточка с кнопкой «Открыть в гиде» (общий вид группы, ?g=CODE). */
import { useEffect, useState } from 'preact/hooks'
import { useRoute } from 'preact-iso'
import { getTrip, listTrips, type Trip } from '../lib/v3'
import { fmtDate, t } from '../lib/i18n'
import { Card, Foot, Top } from '../components/ui'

function Status({ s }: { s: Trip['status'] }) {
  return <span class={'pill ' + (s === 'идёт' ? 'gr' : s === 'завершена' ? '' : '')}>{t('st.' + s)}</span>
}
function Dates({ tr }: { tr: Trip }) {
  if (!tr.dep) return null
  return <>{fmtDate(tr.dep)}{tr.ret ? ' — ' + fmtDate(tr.ret) : ''} · {tr.dep.slice(0, 4)}</>
}

export function Trips() {
  const [list, setList] = useState<Trip[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { listTrips().then(setList).catch(e => setErr(e.message)) }, [])
  return (
    <>
      <Top title={t('trips.title')} sub={t('trips.sub')} role="JURT" />
      <main class="wrap">
        {err && <p class="err">{t('trips.err')}: {err}</p>}
        {!list && !err && <Card><div class="sk" /></Card>}
        {list && list.length === 0 && <Card><p class="muted">{t('trips.none')}</p></Card>}
        {list?.map(tr => (
          <a class="card trip" href={'/trip/' + tr.code} key={tr.id}>
            <div class="kicker">{tr.code} · <Status s={tr.status} /></div>
            <h2>{tr.title}</h2>
            <p class="muted"><Dates tr={tr} />{tr.cities.length ? <> · {tr.cities.join(' → ')}</> : null}</p>
          </a>
        ))}
        <Foot />
      </main>
    </>
  )
}

export function TripPage() {
  const { params } = useRoute()
  const code = (params.code || '').toUpperCase()
  const [tr, setTr] = useState<Trip | null | undefined>(undefined)
  const [err, setErr] = useState('')
  useEffect(() => { getTrip(code).then(setTr).catch(e => setErr(e.message)) }, [code])
  return (
    <>
      <Top title={tr?.title || code} sub={t('trips.sub')} role="JURT" />
      <main class="wrap">
        {err && <p class="err">{t('trips.err')}: {err}</p>}
        {tr === undefined && !err && <Card><div class="sk" /></Card>}
        {tr === null && <Card><p>{t('trips.notfound')}</p></Card>}
        {tr && (
          <>
            <Card>
              <div class="kicker">{tr.code} · <Status s={tr.status} /></div>
              <h1>{tr.title}</h1>
              <div class="kv"><span>{t('trips.dates')}</span><span><Dates tr={tr} /></span></div>
              {tr.cities.length > 0 && <div class="kv"><span>{t('trips.route')}</span><span>{tr.cities.join(' → ')}</span></div>}
              {tr.summary && <p>{tr.summary}</p>}
              <div class="btns"><a class="btn" href={'/p?g=' + tr.code}>{t('trips.open')}</a></div>
            </Card>
            <p><a href="/trips">← {t('trips.all')}</a></p>
          </>
        )}
        <Foot />
      </main>
    </>
  )
}
