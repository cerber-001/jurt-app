/* Тот же проект Supabase, что у /where/ в v2. Этап 1: таблицы trips и ustaz_notes + RPC с ключом v3 (см. v3.ts, supabase/0001_v3_phase1.sql);
   «Где группа» — те же where_points/where_notes, что у v2. Полная схема (люди, участия, программа) — этап 2.
   1.1: библиотека Supabase (~55 КБ gzip) грузится только когда нужна и когда страница уже нарисована —
   первый экран «Сейчас» её не ждёт и не делит с ней сеть. Файл чанка лежит в precache PWA,
   поэтому и в режиме полёта он берётся с телефона. */
import type { SupabaseClient } from '@supabase/supabase-js'

/** Дольше этого простоя не ждём: заметки устаза и «Где группа» не должны висеть */
const IDLE_TIMEOUT_MS = 3_000

let client: Promise<SupabaseClient> | null = null

/** Дождаться, пока страница загрузилась и браузер свободен; вне браузера (тесты) — сразу.
    В Safari нет requestIdleCallback — там ждём только событие load. */
function whenIdle(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve()
  const loaded = document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise<void>(res => addEventListener('load', () => res(), { once: true }))
  if (typeof requestIdleCallback !== 'function') return loaded
  return loaded.then(() => new Promise<void>(res => { requestIdleCallback(() => res(), { timeout: IDLE_TIMEOUT_MS }) }))
}

/** Один клиент на всё приложение; первая загрузка — по первому вызову. После сбоя следующий вызов пробует снова. */
export function getSupabase(): Promise<SupabaseClient> {
  if (!client) {
    client = whenIdle()
      .then(() => import('@supabase/supabase-js'))
      .then(({ createClient }) => createClient(
        import.meta.env.VITE_SUPABASE_URL as string,
        import.meta.env.VITE_SUPABASE_ANON as string,
        { auth: { persistSession: false } },
      ))
      .catch((e: unknown) => { client = null; throw e })
  }
  return client
}
