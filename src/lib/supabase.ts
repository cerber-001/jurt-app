/* Тот же проект Supabase, что у /where/ в v2. В этапе 0 — только клиент;
   таблицы v3 (профили паломников, заметки устаза, чек-листы) появятся в этапе 1. */
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON as string,
  { auth: { persistSession: false } },
)
