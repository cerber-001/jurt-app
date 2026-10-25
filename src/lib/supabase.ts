/* Тот же проект Supabase, что у /where/ в v2. Этап 1: таблицы trips и ustaz_notes + RPC с ключом v3 (см. v3.ts, supabase/0001_v3_phase1.sql);
   «Где группа» — те же where_points/where_notes, что у v2. Полная схема (люди, участия, программа) — этап 2. */
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON as string,
  { auth: { persistSession: false } },
)
