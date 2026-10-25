-- v3, этап 2: полная схема данных гида (контракт Apps Script Code.gs переносится в Postgres).
-- Личные данные (телефоны, PIL) — только в базе; в репозитории их нет.
-- Паспорта, ИИН, оплаты — не хранятся принципиально.

-- ---------- trips: поля карточки группы из листа «Группы» ----------
alter table public.trips
  add column if not exists name text not null default '',            -- название в гиде (group.name); пусто → title
  add column if not exists hotel_medina text not null default '',
  add column if not exists hotel_mecca  text not null default '',
  add column if not exists flights      text not null default '',
  add column if not exists show         boolean not null default true, -- «Показывать» (нет → группа по умолчанию не выбирается)
  add column if not exists people_count integer;
alter table public.trips drop constraint if exists trips_code_check;
alter table public.trips add constraint trips_code_check check (code ~ '^[A-Z0-9][A-Z0-9-]{2,19}$');

-- Служебное по группе, что не должно уходить анонимам (ссылка на чат — только участникам по личной ссылке)
create table if not exists public.trip_private (
  trip_code  text primary key references public.trips(code) on update cascade on delete cascade,
  chat       text not null default '',
  sheet      text not null default '',   -- id таблицы группы (если есть отдельная)
  folder     text not null default '',   -- папка Диска (служебное)
  updated_at timestamptz not null default now()
);
alter table public.trip_private enable row level security;
revoke all on public.trip_private from anon, authenticated;
drop trigger if exists trip_private_touch on public.trip_private;
create trigger trip_private_touch before update on public.trip_private for each row execute function public.v3_touch();

-- ---------- people: «Люди» (PIL) — только имя; телефон служебный ----------
create table if not exists public.people (
  pil_id     text primary key check (pil_id ~ '^PIL-[0-9]{5}$'),
  first      text not null default '',
  last       text not null default '',
  tel        text not null default '',
  note       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.people enable row level security;
revoke all on public.people from anon, authenticated;
drop trigger if exists people_touch on public.people;
create trigger people_touch before update on public.people for each row execute function public.v3_touch();

-- ---------- participations: «Участники» группы (+ «Участия» прошлых поездок) ----------
create table if not exists public.participations (
  id          uuid primary key default gen_random_uuid(),
  trip_code   text not null references public.trips(code) on update cascade on delete cascade,
  local_id    text not null check (local_id ~ '^[A-Za-z0-9_-]{1,12}$'),  -- ID в листе: P01…
  pil_id      text references public.people(pil_id) on update cascade on delete set null,
  first       text not null,
  last        text not null default '',
  tel         text not null default '',
  role        text not null default 'Паломник',
  status      text not null default 'Летит',
  room_medina text not null default '' check (length(room_medina) <= 20),
  room_mecca  text not null default '' check (length(room_mecca) <= 20),
  ord         integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (trip_code, local_id)
);
alter table public.participations enable row level security;
revoke all on public.participations from anon, authenticated;
create index if not exists participations_trip_idx on public.participations (trip_code, ord);
drop trigger if exists participations_touch on public.participations;
create trigger participations_touch before update on public.participations for each row execute function public.v3_touch();

-- ---------- program_rows: «Программа» ----------
create table if not exists public.program_rows (
  id         uuid primary key default gen_random_uuid(),
  trip_code  text not null references public.trips(code) on update cascade on delete cascade,
  ord        integer not null default 0,
  date       text not null default '',   -- как в листе: 'DD.MM.YYYY' (текст — контракт v2)
  day        text not null default '',
  time       text not null default '',
  city       text not null default '',
  place      text not null default '',
  what       text not null default '',
  transport  text not null default '',
  who        text not null default '',
  note       text not null default '',   -- «Статус / уточнить» — служебное
  in_guide   boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.program_rows enable row level security;
revoke all on public.program_rows from anon, authenticated;
grant select (id, trip_code, ord, date, day, time, city, place, what, transport, who, in_guide, updated_at) on public.program_rows to anon, authenticated;
drop policy if exists program_public_read on public.program_rows;
create policy program_public_read on public.program_rows for select to anon, authenticated
  using (in_guide and exists (select 1 from public.trips t where t.code = trip_code and t.show));
create index if not exists program_rows_trip_idx on public.program_rows (trip_code, ord);
drop trigger if exists program_rows_touch on public.program_rows;
create trigger program_rows_touch before update on public.program_rows for each row execute function public.v3_touch();

-- ---------- announcements: «Объявления» ----------
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  trip_code  text references public.trips(code) on update cascade on delete cascade,  -- null = «все»
  at         timestamptz not null default now(),
  text       text not null check (length(text) <= 1500),
  show       boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to anon, authenticated;
drop policy if exists announcements_public_read on public.announcements;
create policy announcements_public_read on public.announcements for select to anon, authenticated using (show);
create index if not exists announcements_trip_idx on public.announcements (trip_code, at);

-- ---------- polls / votes: «Голосования» и «Голоса» ----------
create table if not exists public.polls (
  id         text primary key check (id ~ '^V[A-Z0-9]{4,12}$'),
  trip_code  text not null references public.trips(code) on update cascade on delete cascade,
  q          text not null check (length(q) between 3 and 300),
  opts       text[] not null check (cardinality(opts) between 2 and 8),
  ends       timestamptz not null,
  quorum     integer not null default 0,
  after      boolean not null default false,      -- итоги: после дедлайна (true) или сразу
  status     text not null default 'идёт' check (status in ('идёт','закрыт','скрыт')),
  created    timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.polls enable row level security;
revoke all on public.polls from anon, authenticated;
grant select on public.polls to anon, authenticated;
drop policy if exists polls_public_read on public.polls;
create policy polls_public_read on public.polls for select to anon, authenticated using (status <> 'скрыт');
create index if not exists polls_trip_idx on public.polls (trip_code, created);
drop trigger if exists polls_touch on public.polls;
create trigger polls_touch before update on public.polls for each row execute function public.v3_touch();

create table if not exists public.votes (
  id         uuid primary key default gen_random_uuid(),
  poll_id    text not null references public.polls(id) on update cascade on delete cascade,
  trip_code  text not null,
  local_id   text not null,
  name       text not null default '',
  choice     integer not null check (choice >= 0),
  at         timestamptz not null default now(),
  unique (poll_id, local_id)
);
alter table public.votes enable row level security;
revoke all on public.votes from anon, authenticated;

-- ---------- meet_points: «Точки сбора» (только по личной ссылке) ----------
create table if not exists public.meet_points (
  id        uuid primary key default gen_random_uuid(),
  trip_code text not null references public.trips(code) on update cascade on delete cascade,
  city      text not null default '',
  name      text not null,
  how       text not null default '',
  map       text not null default '',
  ord       integer not null default 0
);
alter table public.meet_points enable row level security;
revoke all on public.meet_points from anon, authenticated;

-- ---------- extra_dua: «Доп. дуа» (в гид попадают только проверенные) ----------
create table if not exists public.extra_dua (
  id        uuid primary key default gen_random_uuid(),
  trip_code text references public.trips(code) on update cascade on delete cascade,  -- null = для всех групп
  when_     text not null default '',
  title     text not null,
  ar        text not null default '',
  tr        text not null default '',
  ru        text not null default '',
  src       text not null default '',
  verified  boolean not null default false,
  ord       integer not null default 0
);
alter table public.extra_dua enable row level security;
revoke all on public.extra_dua from anon, authenticated;
grant select on public.extra_dua to anon, authenticated;
drop policy if exists extra_dua_public_read on public.extra_dua;
create policy extra_dua_public_read on public.extra_dua for select to anon, authenticated using (verified);

-- Реалтайм для живых экранов
do $$ begin
  perform 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='program_rows';
  if not found then alter publication supabase_realtime add table public.program_rows; end if;
  perform 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='announcements';
  if not found then alter publication supabase_realtime add table public.announcements; end if;
  perform 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='polls';
  if not found then alter publication supabase_realtime add table public.polls; end if;
end $$;

-- ---------- секреты: APP_SECRET (личные коды), ADMIN_KEY_HASH, HUB_ID ----------
create table if not exists private.v3_secrets (
  name       text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table private.v3_secrets enable row level security;
alter table private.v3_keys enable row level security;   -- замечание advisor'а по этапу 1
-- Временный секрет: пока Чингис не передаст APP_SECRET из Apps Script, коды v3 и v2 различаются
insert into private.v3_secrets(name, value) values ('APP_SECRET', encode(extensions.gen_random_bytes(32), 'hex')) on conflict do nothing;
insert into private.v3_secrets(name, value) values ('HUB_ID', '1Eh-kwbmsfRkq5RgNAtAXY2XvcnleM8P2epgi8jZ9ePw') on conflict do nothing;

create or replace function private.v3_secret(n text) returns text
language sql stable security definer set search_path = '' as $$
  select value from private.v3_secrets where name = n $$;

-- Смена секрета/ключа — только с ключом admin v3 (через SQL-редактор или RPC ниже)
create or replace function public.v3_secret_set(k text, n text, v text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if private.v3_role(k) is distinct from 'admin' then raise exception 'key'; end if;
  if n not in ('APP_SECRET','ADMIN_KEY_HASH','HUB_ID') then raise exception 'Неизвестный секрет'; end if;
  insert into private.v3_secrets(name, value, updated_at) values (n, v, now())
    on conflict (name) do update set value = excluded.value, updated_at = now();
  return true;
end $$;
revoke all on function public.v3_secret_set(text, text, text) from public;
grant execute on function public.v3_secret_set(text, text, text) to anon, authenticated;

-- ---------- вспомогательные функции (контракт Code.gs) ----------
-- Ключ штаба: роль admin v3 или ADMIN_KEY Apps Script (сравнение по sha256)
create or replace function private.v3_key_ok(k text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.v3_role(k) = 'admin', false)
      or coalesce(k is not null and k <> '' and encode(extensions.digest(convert_to(k, 'UTF8'), 'sha256'), 'hex')
          = (select value from private.v3_secrets where name = 'ADMIN_KEY_HASH'), false) $$;

-- off: статус отказа (как в Code.gs: /отказ|не летит|отмен/i)
create or replace function private.v3_off(s text) returns boolean
language sql immutable set search_path = '' as $$ select coalesce(s, '') ~* 'отказ|не летит|отмен' $$;

-- cap_: нижний регистр, первая буква каждого слова (разделители — пробел и дефис) — заглавная
create or replace function private.v3_cap(s text) returns text
language sql immutable set search_path = '' as $$
  select coalesce((select string_agg(m[1] || upper(m[2]) || m[3], '' order by n)
                   from regexp_matches(lower(coalesce(s, '')), '([\s-]*)(.?)([^\s-]*)', 'g') with ordinality as r(m, n)), '') $$;

-- telDigits_: только цифры; 11 цифр с ведущей 8 → 7…
create or replace function private.v3_tel(t text) returns text
language sql immutable set search_path = '' as $$
  select case when d ~ '^8[0-9]{10}$' then '7' || substr(d, 2) else d end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) x $$;

-- encodeURIComponent
create or replace function private.v3_uri(s text) returns text
language sql immutable set search_path = '' as $$
  select coalesce((select string_agg(
      case when ch ~ '^[A-Za-z0-9_.!~*''()-]$' then ch
           else (select string_agg('%' || lpad(upper(to_hex(get_byte(b, i))), 2, '0'), '' order by i)
                 from (select convert_to(ch, 'UTF8') b) t, generate_series(0, length(convert_to(ch, 'UTF8')) - 1) i) end, '' order by n)
    from regexp_split_to_table(coalesce(s, ''), '') with ordinality as r(ch, n)), '') $$;

create or replace function private.v3_fmt(ts timestamptz, tz text, f text) returns text
language sql stable set search_path = '' as $$ select to_char(ts at time zone tz, f) $$;

create or replace function private.v3_ms(ts timestamptz) returns bigint
language sql immutable set search_path = '' as $$ select (extract(epoch from ts) * 1000)::bigint $$;

create or replace function private.v3_ts(ms bigint) returns timestamptz
language sql immutable set search_path = '' as $$ select to_timestamp(ms / 1000.0) $$;

-- when_: «dd.MM, HH:mm по Мекке (dd.MM, HH:mm по Алматы)»
create or replace function private.v3_when(ts timestamptz) returns text
language sql stable set search_path = '' as $$
  select private.v3_fmt(ts, 'Asia/Riyadh', 'DD.MM') || ', ' || private.v3_fmt(ts, 'Asia/Riyadh', 'HH24:MI') || ' по Мекке ('
      || case when private.v3_fmt(ts, 'Asia/Almaty', 'DD.MM') <> private.v3_fmt(ts, 'Asia/Riyadh', 'DD.MM')
              then private.v3_fmt(ts, 'Asia/Almaty', 'DD.MM') || ', ' else '' end
      || private.v3_fmt(ts, 'Asia/Almaty', 'HH24:MI') || ' по Алматы)' $$;

-- Number.toString(36).toUpperCase()
create or replace function private.v3_b36(n bigint) returns text
language plpgsql immutable set search_path = '' as $$
declare s text := ''; d text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'; v bigint := n;
begin
  if v = 0 then return '0'; end if;
  while v > 0 loop s := substr(d, (v % 36)::int + 1, 1) || s; v := v / 36; end loop;
  return s;
end $$;

-- 'DD.MM.YYYY' → date (или ISO), иначе null
create or replace function private.v3_date(s text) returns date
language plpgsql immutable set search_path = '' as $$
declare m text[];
begin
  if s is null or trim(s) = '' then return null; end if;
  m := regexp_match(trim(s), '^(\d{1,2})\.(\d{1,2})\.(\d{4})');
  if m is not null then return make_date(m[3]::int, m[2]::int, m[1]::int); end if;
  return trim(s)::date;
exception when others then return null;
end $$;

create or replace function private.v3_dmy(d date) returns text
language sql immutable set search_path = '' as $$ select coalesce(to_char(d, 'DD.MM.YYYY'), '') $$;

-- codeFor_: HMAC-SHA256(group|id, APP_SECRET) → 8 знаков алфавита без похожих букв
create or replace function private.v3_code(trip text, lid text) returns text
language sql stable security definer set search_path = '' as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789',
           ((get_byte(sig, i) + case when get_byte(sig, i) < 128 then 256 else 0 end) % 31) + 1, 1), '' order by i)
  from (select extensions.hmac(convert_to(trip || '|' || lid, 'UTF8'),
                               convert_to(private.v3_secret('APP_SECRET'), 'UTF8'), 'sha256') sig) h,
       generate_series(0, 7) i $$;

-- findCode_: по всем группам (и скрытым), среди не-off участников
create or replace function private.v3_find_code(c text) returns table (trip_code text, local_id text)
language sql stable security definer set search_path = '' as $$
  select p.trip_code, p.local_id from public.participations p
  where not private.v3_off(p.status) and private.v3_code(p.trip_code, p.local_id) = lower(trim(c))
  limit 1 $$;

-- group_: точное совпадение; код задан, но не найден → null; иначе первая «Показывать», иначе первая вообще
create or replace function private.v3_group(code text) returns public.trips
language plpgsql stable security definer set search_path = '' as $$
declare c text := upper(trim(coalesce(code, ''))); t public.trips;
begin
  if c <> '' then
    select * into t from public.trips where public.trips.code = c;
    return t;  -- null, если не найдена
  end if;
  select * into t from public.trips where show order by sort, dep desc nulls last, created_at limit 1;
  if not found then select * into t from public.trips order by sort, created_at limit 1; end if;
  return t;
end $$;

-- Карточка группы для гида: {code,name,dep,ret,medina,mecca,flights}
create or replace function private.v3_group_json(t public.trips) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('code', t.code, 'name', coalesce(nullif(t.name, ''), t.title),
    'dep', private.v3_dmy(t.dep), 'ret', private.v3_dmy(t.ret),
    'medina', t.hotel_medina, 'mecca', t.hotel_mecca, 'flights', t.flights) $$;

-- Полная строка листа «Группы» для штаба: + sheet, chat, show ('да'/'нет'), on
create or replace function private.v3_group_admin_json(t public.trips) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.v3_group_json(t) || jsonb_build_object(
    'sheet', coalesce(p.sheet, ''), 'chat', coalesce(p.chat, ''),
    'show', case when t.show then 'да' else 'нет' end, 'on', t.show)
  from (select 1) x left join public.trip_private p on p.trip_code = t.code $$;

-- Лист «Участники» → people_(g, all)
create or replace function private.v3_people(trip text, all_ boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.local_id, 'name', trim(private.v3_cap(p.first) || ' ' || private.v3_cap(p.last)),
      'first', private.v3_cap(p.first), 'tel', p.tel, 'medina', p.room_medina, 'mecca', p.room_mecca,
      'role', p.role, 'status', p.status, 'off', private.v3_off(p.status)) order by p.ord, p.local_id), '[]'::jsonb)
  from public.participations p
  where p.trip_code = trip and p.first <> '' and (all_ or not private.v3_off(p.status)) $$;

-- person_(g, id): карточка «me» с соседями по комнатам
create or replace function private.v3_person(trip text, lid text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare me public.participations; r jsonb;
begin
  select * into me from public.participations p where p.trip_code = trip and p.local_id = lid and not private.v3_off(p.status) and p.first <> '';
  if not found then return null; end if;
  select jsonb_build_object(
    'name', trim(private.v3_cap(me.first) || ' ' || private.v3_cap(me.last)), 'first', private.v3_cap(me.first),
    'medina', me.room_medina, 'mecca', me.room_mecca,
    'matesMedina', coalesce((select jsonb_agg(jsonb_build_object('name', trim(private.v3_cap(q.first) || ' ' || private.v3_cap(q.last)), 'tel', q.tel) order by q.ord)
        from public.participations q where q.trip_code = trip and q.local_id <> me.local_id and not private.v3_off(q.status) and q.first <> ''
          and me.room_medina <> '' and q.room_medina = me.room_medina), '[]'::jsonb),
    'matesMecca', coalesce((select jsonb_agg(jsonb_build_object('name', trim(private.v3_cap(q.first) || ' ' || private.v3_cap(q.last)), 'tel', q.tel) order by q.ord)
        from public.participations q where q.trip_code = trip and q.local_id <> me.local_id and not private.v3_off(q.status) and q.first <> ''
          and me.room_mecca <> '' and q.room_mecca = me.room_mecca), '[]'::jsonb)) into r;
  return r;
end $$;

-- program_: строки в гид (без «Онлайн» и без «в гиде = нет»)
create or replace function private.v3_program(trip text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('date', r.date, 'day', r.day, 'time', r.time, 'city', r.city,
      'place', r.place, 'what', r.what, 'transport', r.transport, 'who', r.who) order by r.ord), '[]'::jsonb)
  from public.program_rows r
  where r.trip_code = trip and r.in_guide and (r.date <> '' or r.what <> '')
    and not (trim(r.city) ~* '^онлайн$' or trim(r.place) ~* '^онлайн$') $$;

-- extra_: проверенные дуа (общие + этой группы)
create or replace function private.v3_extra(trip text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('when', e.when_, 'title', e.title, 'ar', e.ar, 'tr', e.tr, 'ru', e.ru, 'src', e.src) order by e.ord), '[]'::jsonb)
  from public.extra_dua e where e.verified and e.title <> '' and (e.trip_code is null or e.trip_code = trip) $$;

-- points_: точки сбора (ссылка только если https://…)
create or replace function private.v3_points(trip text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('city', m.city, 'name', m.name, 'how', m.how,
      'map', case when m.map ~* '^https://\S+$' then m.map else '' end) order by m.ord), '[]'::jsonb)
  from public.meet_points m where m.trip_code = trip and m.name <> '' $$;

-- announcement_: последнее показываемое объявление группы или «все»; at = 'dd.MM HH:mm'
create or replace function private.v3_announcement(trip text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('text', a.text, 'at', private.v3_fmt(a.at, 'Asia/Almaty', 'DD.MM HH24:MI'))
  from public.announcements a
  where (a.trip_code = trip or a.trip_code is null) and a.show and a.text <> ''
  order by a.at desc, a.created_at desc limit 1 $$;

-- Подсчёт голосов (только не-off участники), как tally_
create or replace function private.v3_tally(pid text, trip text, n int) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(c order by i), '[]'::jsonb) from (
    select i, (select count(*) from public.votes v join public.participations p
                 on p.trip_code = v.trip_code and p.local_id = v.local_id
               where v.poll_id = pid and v.trip_code = trip and v.choice = i - 1 and not private.v3_off(p.status)) c
    from generate_series(1, n) i) t $$;

-- appPolls_(g, myId): голосования для гида (видимые: не скрыт и дедлайн не старше 48 ч)
create or replace function private.v3_app_polls(trip text, my text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(j order by open desc, case when open then ends end asc, case when not open then ends end desc), '[]'::jsonb)
  from (
    select p.ends, (p.status = 'идёт' and p.ends > now()) as open,
      jsonb_build_object('id', p.id, 'q', p.q, 'opts', to_jsonb(p.opts), 'ends', private.v3_ms(p.ends), 'endsTxt', private.v3_when(p.ends),
        'open', (p.status = 'идёт' and p.ends > now()), 'status', case when p.status = 'идёт' and p.ends > now() then 'идёт' else 'закрыт' end,
        'quorum', p.quorum,
        'total', (select count(*) from public.participations q where q.trip_code = trip and q.first <> '' and not private.v3_off(q.status)),
        'voted', (select count(*) from public.votes v join public.participations q on q.trip_code = v.trip_code and q.local_id = v.local_id
                  where v.poll_id = p.id and not private.v3_off(q.status)),
        'after', p.after,
        'mine', coalesce((select v.choice from public.votes v where v.poll_id = p.id and v.local_id = my), -1),
        'counts', case when not (p.status = 'идёт' and p.ends > now())
                         or (not p.after and exists (select 1 from public.votes v where v.poll_id = p.id and v.local_id = my))
                       then private.v3_tally(p.id, trip, cardinality(p.opts)) else null end) j
    from public.polls p
    where p.trip_code = trip and p.status <> 'скрыт' and p.ends > now() - interval '48 hours') s $$;

-- adminPolls_(g): последние 20 для штаба, с именами по вариантам и списком не проголосовавших
create or replace function private.v3_admin_polls(trip text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(j order by created desc), '[]'::jsonb) from (
    select p.created, jsonb_build_object('id', p.id, 'q', p.q, 'opts', to_jsonb(p.opts), 'ends', private.v3_ms(p.ends), 'endsTxt', private.v3_when(p.ends),
      'open', (p.status = 'идёт' and p.ends > now()),
      'status', case when p.status = 'скрыт' then 'скрыт' when p.status = 'идёт' and p.ends > now() then 'идёт' else 'закрыт' end,
      'quorum', p.quorum, 'after', p.after, 'created', private.v3_ms(p.created),
      'total', (select count(*) from public.participations q where q.trip_code = trip and q.first <> '' and not private.v3_off(q.status)),
      'voted', (select count(*) from public.votes v join public.participations q on q.trip_code = v.trip_code and q.local_id = v.local_id
                where v.poll_id = p.id and not private.v3_off(q.status)),
      'counts', private.v3_tally(p.id, trip, cardinality(p.opts)),
      'voters', (select coalesce(jsonb_agg(coalesce((select jsonb_agg(trim(private.v3_cap(q.first) || ' ' || private.v3_cap(q.last)) order by q.ord)
                   from public.votes v join public.participations q on q.trip_code = v.trip_code and q.local_id = v.local_id
                   where v.poll_id = p.id and v.choice = i - 1 and not private.v3_off(q.status)), '[]'::jsonb) order by i), '[]'::jsonb)
                 from generate_series(1, cardinality(p.opts)) i),
      'waiting', (select coalesce(jsonb_agg(jsonb_build_object('id', q.local_id, 'name', trim(private.v3_cap(q.first) || ' ' || private.v3_cap(q.last)),
                   'wa', case when q.tel <> '' then 'https://wa.me/' || private.v3_tel(q.tel) || '?text=' || private.v3_uri(
                     'Ассаляму алейкум, ' || private.v3_cap(q.first) || '! В гиде группы идёт голосование: «' || p.q || '». Ответ займёт минуту, до '
                     || private.v3_when(p.ends) || ': https://umra.jurt.kz/?p=' || private.v3_code(trip, q.local_id) || '#vote') else '' end) order by q.ord), '[]'::jsonb)
                  from public.participations q where q.trip_code = trip and q.first <> '' and not private.v3_off(q.status)
                    and not exists (select 1 from public.votes v where v.poll_id = p.id and v.local_id = q.local_id))) j
    from public.polls p where p.trip_code = trip order by p.created desc limit 20) s $$;

-- state_(code): всё для штаба
create or replace function private.v3_state(code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare g public.trips; hub text := private.v3_secret('HUB_ID'); sid text;
begin
  g := private.v3_group(code);
  if g.code is null then select * into g from public.trips order by sort, created_at limit 1; end if;
  if g.code is null then raise exception 'Нет ни одной группы'; end if;
  sid := coalesce(nullif((select sheet from public.trip_private where trip_code = g.code), ''), hub);
  return jsonb_build_object('ok', true, 'g', g.code,
    'groups', (select coalesce(jsonb_agg(private.v3_group_admin_json(t) order by t.sort, t.created_at), '[]'::jsonb) from public.trips t),
    'people', (select coalesce(jsonb_agg(jsonb_build_object('id', p.local_id, 'name', trim(private.v3_cap(p.first) || ' ' || private.v3_cap(p.last)),
        'role', p.role, 'status', p.status, 'off', private.v3_off(p.status), 'tel', p.tel, 'medina', p.room_medina, 'mecca', p.room_mecca,
        'link', 'https://umra.jurt.kz/?p=' || private.v3_code(g.code, p.local_id),
        'wa', case when p.tel <> '' then 'https://wa.me/' || private.v3_tel(p.tel) || '?text=' || private.v3_uri(
          'Ассаляму алейкум, ' || private.v3_cap(p.first) || '! Ваш личный гид паломника JURT: https://umra.jurt.kz/?p=' || private.v3_code(g.code, p.local_id)
          || E'\n\n1) Откройте ссылку.\n2) Добавьте гид на экран «Домой» (iPhone: «Поделиться» → «На экран „Домой“»).\n3) Один раз откройте его с иконки при интернете — дальше гид работает и без интернета.') else '' end
        ) order by p.ord, p.local_id), '[]'::jsonb) from public.participations p where p.trip_code = g.code and p.first <> ''),
    'ann', private.v3_announcement(g.code),
    'history', (select coalesce(jsonb_agg(jsonb_build_object('at', private.v3_fmt(a.at, 'Asia/Almaty', 'DD.MM.YYYY HH24:MI'), 'text', a.text, 'on', a.show) order by a.at desc, a.created_at desc), '[]'::jsonb)
                from (select * from public.announcements a where a.trip_code = g.code and a.text <> '' order by a.at desc, a.created_at desc limit 15) a),
    'polls', private.v3_admin_polls(g.code),
    'total', (select count(*) from public.participations p where p.trip_code = g.code and p.first <> '' and not private.v3_off(p.status)),
    'sheetUrl', 'https://docs.google.com/spreadsheets/d/' || sid,
    'xlsx', 'https://docs.google.com/spreadsheets/d/' || sid || '/export?format=xlsx',
    'hubUrl', 'https://docs.google.com/spreadsheets/d/' || hub,
    'updated', private.v3_fmt(now(), 'Asia/Almaty', 'DD.MM.YYYY HH24:MI'));
end $$;
