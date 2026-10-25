/* Заметки устаза к блокам гида (Supabase ustaz_notes). Обезличены: подпись всегда «заметка устаза группы».
   block_id с префиксом вида step:niyya / dua:niyya / zikr:tasbih — шаги и дуа делят одни id. */
import { computed, signal } from '@preact/signals'
import { lang, v3Key } from './store'
import { listNotes, noteDelete, noteSet, onNotes, whoami, type UstazNote, type V3Role } from './v3'

export const notes = signal<UstazNote[]>([])
export const notesTrip = signal('')          // код поездки, для которой загружены заметки ('' = только общие)
export const notesErr = signal('')
export const editMode = signal(false)        // включается на экране устаза/организатора после проверки ключа
export const v3Role = signal<V3Role>(null)

let unsub: (() => void) | null = null
let loadedFor: string | null = null

export async function loadNotes(trip?: string) {
  const code = (trip || '').toUpperCase()
  try {
    notes.value = await listNotes(code || undefined)
    notesTrip.value = code; notesErr.value = ''; loadedFor = code
  } catch (e) { notesErr.value = (e as Error).message }
}
/** Загрузить и подписаться на живые изменения; вернуть функцию отписки */
export function watchNotes(trip?: string) {
  const code = (trip || '').toUpperCase()
  if (loadedFor !== code) loadNotes(code)
  if (!unsub) unsub = onNotes(() => loadNotes(loadedFor || undefined))
  return () => { if (unsub) { unsub(); unsub = null } }
}

/** Заметки блока на текущем языке; если на нём нет — русские */
export function notesFor(blockId: string): UstazNote[] {
  const all = notes.value.filter(n => n.block_id === blockId)
  const cur = all.filter(n => n.lang === lang.value)
  return cur.length ? cur : all.filter(n => n.lang === 'ru')
}
export const notesCount = computed(() => notes.value.length)

export async function checkKey(k: string): Promise<V3Role> {
  const role = k ? await whoami(k) : null
  v3Role.value = role
  if (role) v3Key.value = k
  editMode.value = !!role
  return role
}
export function dropKey() { v3Key.value = ''; v3Role.value = null; editMode.value = false }

export async function saveNote(n: { id?: string; block_id: string; body: string; src?: string; trip_code: string | null }) {
  await noteSet(v3Key.value, { ...n, lang: lang.value, src: n.src || null })
  await loadNotes(loadedFor || undefined)
}
export async function removeNote(id: string) {
  await noteDelete(v3Key.value, id)
  await loadNotes(loadedFor || undefined)
}
