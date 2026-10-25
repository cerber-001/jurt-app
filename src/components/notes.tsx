/* Заметки устаза под блоком гида. Паломник видит текст без имени автора; устаз/организатор с ключом
   видит редактор. Заметка — дополнение к тексту гида, не «последняя инстанция». */
import { useState } from 'preact/hooks'
import { t } from '../lib/i18n'
import { editMode, notesFor, notesTrip, removeNote, saveNote } from '../lib/notes'
import type { UstazNote } from '../lib/v3'

export function Notes({ id }: { id: string }) {
  const list = notesFor(id)
  const edit = editMode.value
  if (!list.length && !edit) return null
  return (
    <div class="unotes">
      {list.map(n => <Note key={n.id} n={n} id={id} edit={edit} />)}
      {edit && <Editor id={id} />}
    </div>
  )
}

function Note({ n, id, edit }: { n: UstazNote; id: string; edit: boolean }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <Editor id={id} n={n} onDone={() => setEditing(false)} />
  return (
    <div class="unote">
      <div class="lbl">{t('note.title')}{n.trip_code ? <span class="pill">{n.trip_code}</span> : null}</div>
      <p>{n.body}</p>
      {n.src && <div class="src">{t('note.src')}: {n.src}</div>}
      {edit && (
        <div class="btns">
          <button class="btn ghost sm" onClick={() => setEditing(true)}>{t('note.edit')}</button>
          <button class="btn ghost sm" onClick={async () => { if (confirm(t('note.delq'))) await removeNote(n.id) }}>{t('note.del')}</button>
        </div>
      )}
    </div>
  )
}

function Editor({ id, n, onDone }: { id: string; n?: UstazNote; onDone?: () => void }) {
  const [open, setOpen] = useState(!!n)
  const [body, setBody] = useState(n?.body || '')
  const [src, setSrc] = useState(n?.src || '')
  const [forTrip, setForTrip] = useState(n ? !!n.trip_code : !!notesTrip.value)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  if (!open) return <div class="btns"><button class="btn ghost sm" onClick={() => setOpen(true)}>{t('note.add')}</button></div>
  async function save(e: Event) {
    e.preventDefault()
    const b = body.trim()
    if (b.length < 2) return
    setBusy(true); setErr('')
    try {
      await saveNote({ id: n?.id, block_id: id, body: b, src: src.trim(), trip_code: forTrip && notesTrip.value ? notesTrip.value : null })
      setBody(''); setSrc(''); setOpen(false); onDone?.()
    } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  return (
    <form class="unote edit" onSubmit={save}>
      <div class="lbl">{n ? t('note.edit') : t('note.add')}</div>
      <textarea rows={4} maxLength={1500} value={body} onInput={e => setBody((e.target as HTMLTextAreaElement).value)} placeholder={t('note.ph')} required />
      <input value={src} maxLength={200} onInput={e => setSrc((e.target as HTMLInputElement).value)} placeholder={t('note.srcph')} />
      {notesTrip.value && (
        <label class="chkl"><input type="checkbox" checked={forTrip} onChange={e => setForTrip((e.target as HTMLInputElement).checked)} /> {t('note.onlytrip')} {notesTrip.value}</label>
      )}
      {err && <p class="err">{err}</p>}
      <div class="btns">
        <button class="btn sm" type="submit" disabled={busy}>{t('note.save')}</button>
        <button class="btn ghost sm" type="button" onClick={() => { setOpen(false); onDone?.() }}>{t('note.cancel')}</button>
      </div>
    </form>
  )
}
