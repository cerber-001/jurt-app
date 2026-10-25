/* «Где группа» — карта Leaflet (OSM) + Supabase Realtime, тот же канал, что у v2 (/where/): положение людей
   живёт только в Presence и не сохраняется; точка сбора и заметки — таблицы where_points / where_notes.
   Включается вручную, выключается в любой момент; после даты окончания поездки обмен выключен. */
import { useEffect, useRef, useState } from 'preact/hooks'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { groupCode, me } from '../lib/store'
import { t } from '../lib/i18n'
import { Card } from './ui'
import { isoAt, pickDay, program, loadProgram, useCity } from './today'

const TRIP_END: Record<string, string> = { 'UMRA-0009': '2026-11-07' }
function tripEnded(g: string) {
  const k = Object.keys(TRIP_END).find(k => g.startsWith(k))
  return k ? Date.now() > new Date(TRIP_END[k] + 'T23:59:59+03:00').getTime() : false
}
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k) || '' } catch { return '' } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* приватный режим */ } },
}
function rid(n = 8) { return Array.from(crypto.getRandomValues(new Uint8Array(n)), b => (b % 36).toString(36)).join('') }
function myId() { let id = ls.get('jurt.whereId'); if (!id) { id = rid(); ls.set('jurt.whereId', id) } return id }

interface Peer { id: string; name: string; ll: [number, number] | null; acc?: number; t: number; lost?: boolean; sos?: boolean; lead?: boolean }
interface Point { id: string; grp: string; name: string; lat: number; lon: number; meet_at: string | null; by_id: string | null; created_at: string }
interface Note { id: string; grp: string; body: string; by_name: string | null; created_at: string }

function dist(a: [number, number], b: [number, number]) {
  const R = 6371000, dLat = (b[0] - a[0]) * Math.PI / 180, dLon = (b[1] - a[1]) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
function fmtDist(m: number) { return m < 1000 ? `${Math.round(m)} м` : `${(m / 1000).toFixed(1)} км` }
function ago(ts: number) { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? t('where.now') : `${m} ${t('where.ago')}` }

export function Where() {
  const grp = groupCode.value
  if (!grp) return <Card cls="sand"><p>{t('where.nocode')}</p></Card>
  return <WhereMap grp={grp} key={grp} />
}

function WhereMap({ grp }: { grp: string }) {
  const id = myId()
  const ended = tripEnded(grp)
  const [name, setName] = useState(ls.get('jurt.whereName') || me.value?.first || me.value?.name || '')
  const [sharing, setSharing] = useState(false)
  const [lost, setLost] = useState(false)
  const [pos, setPos] = useState<{ ll: [number, number]; acc: number } | null>(null)
  const [gpsErr, setGpsErr] = useState('')
  const [peers, setPeers] = useState<Peer[]>([])
  const [points, setPoints] = useState<Point[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [noteText, setNoteText] = useState('')
  const [online, setOnline] = useState(false)
  const mapEl = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const ch = useRef<RealtimeChannel | null>(null)
  const last = useRef<{ ll: [number, number] | null; at: number }>({ ll: null, at: 0 })
  const payloadRef = useRef<Record<string, unknown> | null>(null)

  useEffect(() => { loadProgram() }, [])
  const now = new Date()
  const picked = pickDay(program.value, isoAt(now, -now.getTimezoneOffset() / 60))
  const city = useCity(picked?.day)

  /* карта */
  useEffect(() => {
    if (!mapEl.current || map.current) return
    const m = L.map(mapEl.current, { zoomControl: true, attributionControl: true }).setView([city.lat, city.lon], 14)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    return () => { m.remove(); map.current = null }
  }, [])

  /* данные: точки и заметки */
  async function loadPoints() {
    const { data } = await supabase.from('where_points').select('*').eq('grp', grp)
    setPoints((data || []) as Point[])
  }
  async function loadNotes() {
    const { data } = await supabase.from('where_notes').select('*').eq('grp', grp).order('created_at', { ascending: false }).limit(20)
    setNotes((data || []) as Note[])
  }

  /* канал Realtime */
  useEffect(() => {
    loadPoints(); loadNotes()
    const c = supabase.channel('where:' + grp, { config: { presence: { key: id }, broadcast: { self: false } } })
    c.on('presence', { event: 'sync' }, () => {
      const st = c.presenceState<Peer>()
      const list: Peer[] = []
      for (const k of Object.keys(st)) {
        if (k === id) continue
        const arr = st[k]; const p = arr[arr.length - 1]
        if (p) list.push({ ...p, id: k })
      }
      setPeers(list.sort((a, b) => Number(!!b.lost) - Number(!!a.lost) || a.name.localeCompare(b.name)))
    })
    c.on('postgres_changes', { event: '*', schema: 'public', table: 'where_points', filter: 'grp=eq.' + grp }, loadPoints)
    c.on('postgres_changes', { event: '*', schema: 'public', table: 'where_notes', filter: 'grp=eq.' + grp }, loadNotes)
    c.subscribe(s => setOnline(s === 'SUBSCRIBED'))
    ch.current = c
    const hide = () => { c.untrack() }
    addEventListener('pagehide', hide)
    return () => { removeEventListener('pagehide', hide); supabase.removeChannel(c); ch.current = null }
  }, [grp])

  /* публикация своего положения */
  function publish(force = false) {
    const c = ch.current
    if (!c || !sharing || ended) return
    const p = pos
    const nowT = Date.now()
    if (!force && nowT - last.current.at < 3000) return
    const moved = !p || !last.current.ll || dist(p.ll, last.current.ll) > 10
    if (!force && !moved && nowT - last.current.at < 20000) return
    const payload = { id, name: name || t('where.me'), ll: p?.ll || null, acc: p?.acc, t: nowT, lost, city: city.id }
    payloadRef.current = payload
    last.current = { ll: p?.ll || null, at: nowT }
    c.track(payload)
  }
  useEffect(() => { publish() }, [pos, sharing, lost, name])
  useEffect(() => {
    if (!sharing) return
    const hb = setInterval(() => publish(true), 60000)
    return () => clearInterval(hb)
  }, [sharing])
  useEffect(() => {
    if (!sharing) { ch.current?.untrack(); return }
    if (!navigator.geolocation) { setGpsErr(t('where.gps')); return }
    const w = navigator.geolocation.watchPosition(
      g => { setGpsErr(''); setPos({ ll: [g.coords.latitude, g.coords.longitude], acc: Math.round(g.coords.accuracy) }) },
      () => setGpsErr(t('where.gps')),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 })
    return () => navigator.geolocation.clearWatch(w)
  }, [sharing])
  useEffect(() => { ls.set('jurt.whereName', name) }, [name])

  /* маркеры */
  useEffect(() => {
    const lg = layer.current; if (!lg) return
    lg.clearLayers()
    const mk = (ll: [number, number], cls: string, label: string) =>
      L.marker(ll, { icon: L.divIcon({ className: '', html: `<div class="pdot ${cls}"></div><div class="pname">${esc(label)}</div>`, iconSize: [14, 14], iconAnchor: [7, 7] }) })
    for (const p of peers) if (p.ll) mk(p.ll, p.lost || p.sos ? 'lost' : '', p.name).addTo(lg)
    if (pos && sharing) { L.circle(pos.ll, { radius: pos.acc, color: '#F07A1E', weight: 1, fillOpacity: .08 }).addTo(lg); mk(pos.ll, 'me', t('where.me')).addTo(lg) }
    for (const pt of points) L.marker([pt.lat, pt.lon], { icon: L.divIcon({ className: '', html: `<span class="pin">📍</span><div class="pname">${esc(pt.name)}</div>`, iconSize: [0, 0] }) }).addTo(lg)
  }, [peers, points, pos, sharing])

  function fitAll() {
    const m = map.current; if (!m) return
    const pts: [number, number][] = [...peers.filter(p => p.ll).map(p => p.ll as [number, number]), ...points.map(p => [p.lat, p.lon] as [number, number])]
    if (pos && sharing) pts.push(pos.ll)
    if (pts.length) m.fitBounds(L.latLngBounds(pts).pad(.3), { maxZoom: 17 })
  }
  function toMe() { if (pos && map.current) map.current.setView(pos.ll, 17) }

  async function setMeet() {
    if (!pos) return
    const pid = rid(6)
    await supabase.from('where_points').update({ meet_at: null }).eq('grp', grp).neq('id', pid)
    await supabase.from('where_points').upsert({ id: pid, grp, name: t('where.meet') + (name ? ' · ' + name : ''), lat: pos.ll[0], lon: pos.ll[1], meet_at: new Date().toISOString(), by_id: id })
    loadPoints()
  }
  async function clearMeet(pt: Point) { await supabase.from('where_points').delete().eq('id', pt.id).eq('grp', grp); loadPoints() }
  async function sendNote(e: Event) {
    e.preventDefault()
    const body = noteText.trim().slice(0, 280); if (!body) return
    await supabase.from('where_notes').insert({ id: rid(10), grp, body, by_name: (name || '').slice(0, 40) || null })
    setNoteText(''); loadNotes()
  }

  const meet = points.find(p => p.meet_at)
  return (
    <>
      <Card>
        <div class="kicker">{t('where.title')} · {grp} · <span class={'pill ' + (online ? 'gr' : '')}>{online ? t('where.online') : '…'}</span></div>
        <p class="muted"><small>{t('where.hint')}</small></p>
        {ended ? <p class="err">{t('where.ended')}</p> : (
          <>
            <label class="f">{t('where.name')}<input value={name} maxLength={40} onInput={e => setName((e.target as HTMLInputElement).value)} /></label>
            <div class="btns">
              <button class={'btn ' + (sharing ? '' : 'or')} onClick={() => setSharing(!sharing)}>{sharing ? t('where.off') : t('where.share')}</button>
              {sharing && <button class={'btn ghost ' + (lost ? 'sel' : '')} onClick={() => setLost(!lost)}>{lost ? t('where.found') : t('where.lost')}</button>}
            </div>
            {gpsErr && <p class="err">{gpsErr}</p>}
          </>
        )}
      </Card>

      <Card>
        <div ref={mapEl} class="map" />
        <div class="btns">
          <button class="btn ghost sm" onClick={fitAll}>{t('where.all')}</button>
          {pos && sharing && <button class="btn ghost sm" onClick={toMe}>{t('where.center')}</button>}
          {pos && sharing && !ended && <button class="btn ghost sm" onClick={setMeet}>{t('where.setmeet')}</button>}
        </div>
        {meet && (
          <p>📍 <b>{meet.name}</b>{pos && <small class="muted"> · {fmtDist(dist(pos.ll, [meet.lat, meet.lon]))}</small>}
            {' '}<a href={`https://maps.google.com/?q=${meet.lat},${meet.lon}`} target="_blank" rel="noopener">{t('where.open')}</a>
            {!ended && <> · <a href="#" onClick={e => { e.preventDefault(); clearMeet(meet) }}>{t('where.clearmeet')}</a></>}
          </p>
        )}
      </Card>

      <Card>
        <h2>{t('where.online')} · {peers.length}</h2>
        {peers.length === 0 && <p class="muted">{t('where.nobody')}</p>}
        {peers.map(p => (
          <div class={'peer' + (p.lost || p.sos ? ' lost' : '')} key={p.id}>
            <span class="dot" />
            <span><b>{p.name}</b>{p.lead ? <small> · {t('where.lead')}</small> : null}{p.lost ? <span class="pill red"> {t('where.lost')}</span> : null}</span>
            <small>{p.ll && pos ? fmtDist(dist(pos.ll, p.ll)) + ' · ' : ''}{ago(p.t)}</small>
          </div>
        ))}
      </Card>

      <Card cls="sand">
        <h2>{t('where.notes')}</h2>
        {!ended && (
          <form onSubmit={sendNote} class="xrow" style="gap:.4rem">
            <input value={noteText} maxLength={280} placeholder={t('where.noteph')} onInput={e => setNoteText((e.target as HTMLInputElement).value)} style="flex:1" />
            <button class="btn sm" type="submit">{t('where.send')}</button>
          </form>
        )}
        {notes.map(n => <div class="note" key={n.id}>{n.body}<small>{n.by_name || '—'} · {new Date(n.created_at).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</small></div>)}
      </Card>
    </>
  )
}

function esc(s: string) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)) }
