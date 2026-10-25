/* Данные v3 в Supabase (этап 1): витрина поездок и обезличенные заметки устаза к блокам гида.
   Чтение — анонимное (RLS: только публичные поездки). Запись — RPC с ключом v3; хеш ключа
   лежит в private.v3_keys, в браузере ключ хранится локально, как ключ штаба Apps Script. */
import { supabase } from './supabase'

export interface Trip {
  id: string; code: string; title: string; dep: string | null; ret: string | null
  cities: string[]; status: 'план' | 'набор' | 'идёт' | 'завершена' | 'скрыта'
  summary: string | null; is_public: boolean; sort: number; updated_at: string
}
export interface UstazNote {
  id: string; trip_code: string | null; block_id: string; lang: 'ru' | 'kk' | 'en'
  body: string; src: string | null; updated_at: string
}
export type V3Role = 'admin' | 'ustaz' | null

function fail(e: { message?: string } | null): never {
  const m = e?.message || 'Supabase: ошибка'
  // Postgres 42501 из RPC приходит текстом «нет доступа»
  throw new Error(/нет доступа|42501/.test(m) ? 'Ключ не подходит' : m)
}

export async function listTrips(): Promise<Trip[]> {
  const { data, error } = await supabase.from('trips').select('*').order('sort').order('dep', { ascending: false })
  if (error) fail(error)
  return (data || []) as Trip[]
}
export async function getTrip(code: string): Promise<Trip | null> {
  const { data, error } = await supabase.from('trips').select('*').eq('code', code.toUpperCase()).maybeSingle()
  if (error) fail(error)
  return (data as Trip) || null
}
/** Заметки устаза: общие (trip_code null) + для данной поездки */
export async function listNotes(trip?: string): Promise<UstazNote[]> {
  let q = supabase.from('ustaz_notes').select('*').order('updated_at', { ascending: false })
  q = trip ? q.or(`trip_code.is.null,trip_code.eq.${trip.toUpperCase()}`) : q.is('trip_code', null)
  const { data, error } = await q
  if (error) fail(error)
  return (data || []) as UstazNote[]
}

export async function whoami(k: string): Promise<V3Role> {
  const { data, error } = await supabase.rpc('v3_whoami', { k })
  if (error) fail(error)
  return (data as V3Role) || null
}
/** Все поездки, включая скрытые — только организатору (ключ v3 admin) */
export async function listTripsAll(k: string): Promise<Trip[]> {
  const { data, error } = await supabase.rpc('v3_trips_all', { k })
  if (error) fail(error)
  return (data || []) as Trip[]
}
export async function tripUpsert(k: string, t: Partial<Trip> & { code: string; title: string }): Promise<Trip> {
  const { data, error } = await supabase.rpc('v3_trip_upsert', { k, t })
  if (error) fail(error)
  return data as Trip
}
export async function noteSet(k: string, n: Partial<UstazNote> & { block_id: string; body: string }): Promise<UstazNote> {
  const { data, error } = await supabase.rpc('v3_note_set', { k, n })
  if (error) fail(error)
  return data as UstazNote
}
export async function noteDelete(k: string, id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('v3_note_delete', { k, note_id: id })
  if (error) fail(error)
  return !!data
}
/** Живое обновление заметок (Realtime) — вернуть функцию отписки */
export function onNotes(cb: () => void) {
  const ch = supabase.channel('ustaz_notes').on('postgres_changes', { event: '*', schema: 'public', table: 'ustaz_notes' }, cb).subscribe()
  return () => { supabase.removeChannel(ch) }
}
