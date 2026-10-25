-- v3 этап 1 (25.10.2026): публичные карточки поездок + обезличенные заметки устаза.
-- Записи — только через RPC с ключом v3 (хеш ключа в private.v3_keys, anon его не видит).
-- Ключи ролей: admin (организатор: поездки + заметки), ustaz (только заметки).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.v3_keys (
  role text primary key check (role in ('admin','ustaz')),
  hash text not null,
  updated_at timestamptz not null default now()
);

create or replace function private.v3_role(k text) returns text
language sql stable security definer set search_path = '' as $$
  select role from private.v3_keys
  where k is not null and length(k) between 16 and 128
    and hash = encode(extensions.digest(k, 'sha256'), 'hex')
  limit 1
$$;
revoke all on function private.v3_role(text) from public, anon, authenticated;

-- Поездки (витрина): без персональных данных.
create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z]{2,10}-[0-9]{3,6}$'),
  title text not null check (length(title) between 2 and 120),
  dep date,
  ret date,
  cities text[] not null default '{}',
  status text not null default 'план' check (status in ('план','набор','идёт','завершена','скрыта')),
  summary text check (summary is null or length(summary) <= 1200),
  is_public boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ret is null or dep is null or ret >= dep)
);
alter table public.trips enable row level security;
drop policy if exists trips_public_read on public.trips;
create policy trips_public_read on public.trips for select to anon, authenticated
  using (is_public and status <> 'скрыта');
create index if not exists trips_sort_idx on public.trips (sort, dep desc);

-- Заметки устаза к блокам контента (по id блока: шаг/дуа/зикр). Обезличены — автора нет.
create table if not exists public.ustaz_notes (
  id uuid primary key default gen_random_uuid(),
  trip_code text references public.trips(code) on delete cascade,  -- null = для всех поездок
  block_id text not null check (block_id ~ '^[a-z0-9_.:-]{2,60}$'),
  lang text not null default 'ru' check (lang in ('ru','kk','en')),
  body text not null check (length(body) between 1 and 1500),
  src text check (src is null or length(src) <= 200),  -- источник (ханафи/ДУМК), по желанию
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ustaz_notes enable row level security;
drop policy if exists ustaz_notes_read on public.ustaz_notes;
create policy ustaz_notes_read on public.ustaz_notes for select to anon, authenticated using (true);
create index if not exists ustaz_notes_block_idx on public.ustaz_notes (block_id, trip_code);

create or replace function public.v3_touch() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists trips_touch on public.trips;
create trigger trips_touch before update on public.trips for each row execute function public.v3_touch();
drop trigger if exists ustaz_notes_touch on public.ustaz_notes;
create trigger ustaz_notes_touch before update on public.ustaz_notes for each row execute function public.v3_touch();

-- RPC: проверка ключа (для входа в кабинет — возвращает роль или null)
create or replace function public.v3_whoami(k text) returns text
language sql stable security definer set search_path = '' as $$
  select private.v3_role(k)
$$;

-- RPC: создать/обновить поездку (только admin)
create or replace function public.v3_trip_upsert(k text, t jsonb) returns public.trips
language plpgsql security definer set search_path = '' as $$
declare r public.trips;
begin
  if private.v3_role(k) is distinct from 'admin' then raise exception 'нет доступа' using errcode = '42501'; end if;
  insert into public.trips (code, title, dep, ret, cities, status, summary, is_public, sort)
  values (
    t->>'code', t->>'title',
    nullif(t->>'dep','')::date, nullif(t->>'ret','')::date,
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(t->'cities','[]'::jsonb)) x), '{}'),
    coalesce(t->>'status','план'), nullif(t->>'summary',''),
    coalesce((t->>'is_public')::boolean, false), coalesce((t->>'sort')::int, 0))
  on conflict (code) do update set
    title = excluded.title, dep = excluded.dep, ret = excluded.ret, cities = excluded.cities,
    status = excluded.status, summary = excluded.summary, is_public = excluded.is_public, sort = excluded.sort
  returning * into r;
  return r;
end $$;

-- RPC: заметка устаза — создать (id null) или изменить (admin или ustaz)
create or replace function public.v3_note_set(k text, n jsonb) returns public.ustaz_notes
language plpgsql security definer set search_path = '' as $$
declare r public.ustaz_notes;
begin
  if private.v3_role(k) not in ('admin','ustaz') then raise exception 'нет доступа' using errcode = '42501'; end if;
  if nullif(n->>'id','') is null then
    insert into public.ustaz_notes (trip_code, block_id, lang, body, src)
    values (nullif(n->>'trip_code',''), n->>'block_id', coalesce(n->>'lang','ru'), n->>'body', nullif(n->>'src',''))
    returning * into r;
  else
    update public.ustaz_notes set
      trip_code = nullif(n->>'trip_code',''), block_id = coalesce(n->>'block_id', block_id),
      lang = coalesce(n->>'lang', lang), body = coalesce(n->>'body', body), src = nullif(n->>'src','')
    where id = (n->>'id')::uuid returning * into r;
    if r.id is null then raise exception 'заметка не найдена' using errcode = 'P0002'; end if;
  end if;
  return r;
end $$;

-- RPC: удалить заметку (admin или ustaz)
create or replace function public.v3_note_delete(k text, note_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if private.v3_role(k) not in ('admin','ustaz') then raise exception 'нет доступа' using errcode = '42501'; end if;
  delete from public.ustaz_notes where id = note_id; get diagnostics n = row_count;
  return n > 0;
end $$;

revoke all on function public.v3_whoami(text), public.v3_trip_upsert(text, jsonb),
  public.v3_note_set(text, jsonb), public.v3_note_delete(text, uuid) from public;
grant execute on function public.v3_whoami(text), public.v3_trip_upsert(text, jsonb),
  public.v3_note_set(text, jsonb), public.v3_note_delete(text, uuid) to anon, authenticated;

-- Realtime: заметки устаза и поездки видны сразу
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='trips') then
    alter publication supabase_realtime add table public.trips; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='ustaz_notes') then
    alter publication supabase_realtime add table public.ustaz_notes; end if;
end $$;

-- Кейс UMRA-0009 (из program.json v2, 22.10.2026). Прошлые поездки — импорт из Main_v2 на этапе 2.
insert into public.trips (code, title, dep, ret, cities, status, summary, is_public, sort) values
  ('UMRA-0009', 'Умра · октябрь 2026', '2026-10-28', '2026-11-06',
   array['Стамбул','Медина','Мекка','Дубай'], 'план',
   'Группа 12 человек. Маршрут Алматы — Стамбул — Медина — Мекка — Дубай — Алматы. В стоимости: перелёты, отели в Медине и Мекке с завтраками и ужинами, трансферы и зияраты, сопровождение. Не входит: дни в Стамбуле и Дубае, обеды, SIM-карта, покупки.',
   true, 10)
on conflict (code) do nothing;

-- (миграция v3_phase1_trips_all_admin, 25.10.2026) все поездки организатору — включая скрытые и непубличные
create or replace function public.v3_trips_all(k text) returns setof public.trips
language plpgsql security definer set search_path = '' as $$
begin
  if private.v3_role(k) is distinct from 'admin' then raise exception 'нет доступа' using errcode = '42501'; end if;
  return query select * from public.trips order by sort, dep desc nulls last;
end $$;
revoke all on function public.v3_trips_all(text) from public;
grant execute on function public.v3_trips_all(text) to anon, authenticated;
