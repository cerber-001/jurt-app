/* «Ещё»: чек-лист сборов (pack.json) и геоистории (stories.json) */
import { useEffect, useState } from 'preact/hooks'
import { ls } from '../lib/store'
import { Card } from './ui'

const BASE = import.meta.env.BASE_URL + 'content/'
function useJson<T>(name: string): T | null | 'err' {
  const [v, setV] = useState<T | null | 'err'>(null)
  useEffect(() => { fetch(BASE + name).then(r => (r.ok ? r.json() : Promise.reject())).then(setV, () => setV('err')) }, [name])
  return v
}
const Wait = ({ v }: { v: unknown }) => v === 'err' ? <p class="err">Не удалось загрузить. Проверьте интернет.</p> : <Card><div class="sk" /></Card>

interface Pack { note: string; groups: { t: string; i: [string, string][] }[] }

export function PackList() {
  const p = useJson<Pack>('pack.json')
  const [on, setOn] = useState<Record<string, 1>>(() => { try { return JSON.parse(ls.get('jurt.pack') || '{}') } catch { return {} } })
  if (!p || p === 'err') return <Wait v={p} />
  const flip = (id: string) => { const n = { ...on }; n[id] ? delete n[id] : (n[id] = 1); setOn(n); ls.set('jurt.pack', JSON.stringify(n)) }
  const all = p.groups.flatMap(g => g.i).length, got = p.groups.flatMap(g => g.i).filter(([id]) => on[id]).length
  return (
    <>
      <Card><h1>Сборы</h1><p class="muted">{p.note}</p><p><b>Отмечено {got} из {all}</b></p></Card>
      {p.groups.map(g => (
        <Card key={g.t}>
          <h2>{g.t}</h2>
          {g.i.map(([id, txt]) => (
            <label key={id} class="pk"><input type="checkbox" checked={!!on[id]} onChange={() => flip(id)} /><span>{txt}</span></label>
          ))}
        </Card>
      ))}
    </>
  )
}

interface Story {
  id: string; title: string; place: string; lat: number; lng: number; radius: number
  parts: { h: string; p: string }[]; quran: { ref: string; url: string; tr: string; t: string }[]; hadith: string; check: string
}

function dist(a: number, b: number, c: number, d: number) {
  const R = 6371e3, r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2)
  return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y))
}

export function Stories() {
  const list = useJson<Story[]>('stories.json')
  const [near, setNear] = useState('')
  const [say, setSay] = useState('')
  useEffect(() => () => speechSynthesis?.cancel(), [])
  if (!list || list === 'err') return <Wait v={list} />
  function check() {
    if (!navigator.geolocation) { setNear('Телефон не даёт местоположение.'); return }
    setNear('Ищу, где вы…')
    navigator.geolocation.getCurrentPosition(
      ({ coords: c }) => {
        const s = (list as Story[]).find(s => dist(c.latitude, c.longitude, s.lat, s.lng) <= s.radius)
        setNear(s ? 'Вы рядом: ' + s.place + '. Хотите послушать историю?' : 'Рядом пока нет мест с историей. На месте нажмите ещё раз.')
      },
      () => setNear('Нет доступа к местоположению — историю можно читать и слушать и так.'),
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }
  function listen(s: Story) {
    if (!('speechSynthesis' in window)) return
    if (say === s.id) { speechSynthesis.cancel(); setSay(''); return }
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(s.title + '. ' + s.parts.map(p => p.h + '. ' + p.p).join(' '))
    u.lang = 'ru-RU'; u.rate = 0.95; u.onend = () => setSay('')
    speechSynthesis.speak(u); setSay(s.id)
  }
  return (
    <>
      <Card><h1>Истории мест</h1><p class="muted">Короткие рассказы там, где это было. Можно читать или слушать.</p>
        <div class="btns"><button class="btn ghost" onClick={check}>📍 Я на месте?</button></div>{near && <p><b>{near}</b></p>}</Card>
      {list.map(s => (
        <Card key={s.id} cls="story">
          <h2>{s.title}</h2>
          <p class="muted"><small>{s.place}</small></p>
          {'speechSynthesis' in window && <div class="btns"><button class="btn or" onClick={() => listen(s)}>{say === s.id ? '■ Остановить' : '▶ Послушать'}</button></div>}
          {s.parts.map(p => <div key={p.h}><h3>{p.h}</h3><p>{p.p}</p></div>)}
          {s.quran.map(q => (
            <blockquote key={q.ref}>«{q.t}»<br /><small><a href={q.url} target="_blank" rel="noopener">{q.ref}</a> · {q.tr}</small></blockquote>
          ))}
          <p class="src">{s.hadith}</p>
          <p class="muted"><small>{s.check}</small></p>
        </Card>
      ))}
    </>
  )
}
