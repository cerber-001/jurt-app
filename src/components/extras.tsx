/* «Ещё»: чек-лист сборов (pack.json) и геоистории (stories.json) — на выбранном языке, без перевода — по-русски */
import { useEffect, useState } from 'preact/hooks'
import { fetchLocalized } from '../lib/content'
import { lang, ls, type Lang } from '../lib/store'
import { t, tf } from '../lib/i18n'
import { Card } from './ui'

type Got<T> = { data: T; lang: Lang } | null | 'err'

/** JSON из content/ на текущем языке; при смене языка перезагружается, прежний ответ виден до прихода нового */
function useJson<T>(name: string): Got<T> {
  const l = lang.value
  const [v, setV] = useState<Got<T>>(null)
  useEffect(() => {
    let live = true
    fetchLocalized<T>(name, l).then(x => { if (live) setV(x) }, () => { if (live) setV('err') })
    return () => { live = false }
  }, [name, l])
  return v
}
/** Текст пришёл не на языке интерфейса (нет перевода — запасной русский): язык для атрибута lang, иначе undefined */
const fallbackLang = (got: Lang) => (got !== lang.value ? got : undefined)
const Wait = ({ v }: { v: unknown }) => v === 'err' ? <p class="err" role="alert">{t('err.load')}</p> : <Card><div class="sk" /></Card>

interface Pack { note: string; groups: { t: string; i: [string, string][] }[] }

const PACK_KEY = 'jurt.pack'
function readPack(): Record<string, 1> {
  try { return JSON.parse(ls.get(PACK_KEY) || '{}') as Record<string, 1> } catch { return {} }
}

export function PackList() {
  const got = useJson<Pack>('pack.json')
  const [on, setOn] = useState<Record<string, 1>>(readPack)
  if (!got || got === 'err') return <Wait v={got} />
  const p = got.data
  const fb = fallbackLang(got.lang)
  const flip = (id: string) => {
    const { [id]: was, ...rest } = on
    const n: Record<string, 1> = was ? rest : { ...on, [id]: 1 }
    setOn(n); ls.set(PACK_KEY, JSON.stringify(n))
  }
  const items = p.groups.flatMap(g => g.i)
  const all = items.length, have = items.filter(([id]) => on[id]).length
  return (
    <>
      <Card><h1>{t('pack.h')}</h1><p class="muted" lang={fb}>{p.note}</p><p role="status"><b>{tf('pack.got', { n: have, m: all })}</b></p></Card>
      {p.groups.map(g => (
        <Card key={g.t} lang={fb}>
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

const VOICE: Record<Lang, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' }
const GEO_TIMEOUT_MS = 15_000

function dist(a: number, b: number, c: number, d: number) {
  const R = 6371e3, r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2)
  return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y))
}

export function Stories() {
  const got = useJson<Story[]>('stories.json')
  const [near, setNear] = useState('')
  const [say, setSay] = useState('')
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window
  useEffect(() => () => { if (canSpeak) speechSynthesis.cancel() }, [])
  useEffect(() => { if (canSpeak) speechSynthesis.cancel(); setSay('') }, [got && got !== 'err' ? got.lang : ''])
  if (!got || got === 'err') return <Wait v={got} />
  const list = got.data
  const fb = fallbackLang(got.lang)
  function check() {
    if (!navigator.geolocation) { setNear(t('st.nogeo')); return }
    setNear(t('st.seek'))
    navigator.geolocation.getCurrentPosition(
      ({ coords: c }) => {
        const s = list.find(x => dist(c.latitude, c.longitude, x.lat, x.lng) <= x.radius)
        setNear(s ? tf('st.near', { p: s.place }) : t('st.none'))
      },
      () => setNear(t('st.denied')),
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS },
    )
  }
  function listen(s: Story) {
    if (!canSpeak) return
    if (say === s.id) { speechSynthesis.cancel(); setSay(''); return }
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(s.title + '. ' + s.parts.map(p => p.h + '. ' + p.p).join(' '))
    // голос — по языку, на котором реально пришёл текст (нет перевода — читаем по-русски)
    u.lang = VOICE[got && got !== 'err' ? got.lang : 'ru']; u.rate = 0.95; u.onend = () => setSay('')
    speechSynthesis.speak(u); setSay(s.id)
  }
  return (
    <>
      <Card><h1>{t('st.h')}</h1><p class="muted">{t('st.lead')}</p>
        <div class="btns"><button class="btn ghost" onClick={check}><span aria-hidden="true">📍</span> {t('st.here')}</button></div>
        {near && <p role="status"><b>{near}</b></p>}</Card>
      {list.map(s => (
        <Card key={s.id} cls="story" lang={fb}>
          <h2>{s.title}</h2>
          <p class="muted"><small>{s.place}</small></p>
          {canSpeak && (
            <div class="btns" lang={fb && lang.value}>
              <button class="btn or" onClick={() => listen(s)}>
                <span aria-hidden="true">{say === s.id ? '■' : '▶'}</span> {say === s.id ? t('st.stop') : t('st.listen')}
              </button>
            </div>
          )}
          {s.parts.map(p => <div key={p.h}><h3>{p.h}</h3><p>{p.p}</p></div>)}
          {s.quran.map(q => (
            <blockquote key={q.ref}>«{q.t}»<br /><small><a href={q.url} target="_blank" rel="noopener noreferrer">{q.ref}</a> · {q.tr}</small></blockquote>
          ))}
          <p class="src">{s.hadith}</p>
          <p class="muted"><small>{s.check}</small></p>
        </Card>
      ))}
    </>
  )
}
