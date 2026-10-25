-- v3, этап 2: публичные RPC — контракт Apps Script (doGet / doPost из Code.gs) в Postgres.
-- Edge Function `api` вызывает их через service_role; проверка ключа и все правила — здесь.
-- Ошибки возвращаются как {ok:false,error:'…'} с теми же текстами, что в Code.gs.

-- needGroup_: группа по коду или ошибка
create or replace function private.v3_need_group(code text) returns public.trips
language plpgsql stable security definer set search_path = '' as $$
declare t public.trips;
begin
  t := private.v3_group(code);
  if t.code is null then raise exception 'Группа % не найдена', upper(trim(coalesce(code, ''))); end if;
  return t;
end $$;
revoke all on function private.v3_need_group(text) from public, anon, authenticated;

-- ---------- doGet: ?p=личный код&g=код группы ----------
create or replace function public.api_app(p text default '', g text default '') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c text := lower(trim(coalesce(p, ''))); h_trip text; h_lid text; t public.trips; me jsonb; ch text := '';
begin
  if c ~ '^[a-z0-9]{6,12}$' then
    select f.trip_code, f.local_id into h_trip, h_lid from private.v3_find_code(c) f;
  end if;
  t := private.v3_group(coalesce(h_trip, g));
  if t.code is null then t := private.v3_group(''); end if;
  if t.code is null then raise exception 'Нет ни одной группы'; end if;
  if h_lid is not null then
    me := private.v3_person(t.code, h_lid);
    ch := coalesce((select tp.chat from public.trip_private tp where tp.trip_code = t.code), '');
  end if;
  return jsonb_build_object('ok', true,
    'updated', private.v3_fmt(now(), 'Asia/Almaty', 'DD.MM.YYYY HH24:MI'),
    'group', private.v3_group_json(t),
    'announcement', private.v3_announcement(t.code),
    'program', private.v3_program(t.code),
    'extra', private.v3_extra(t.code),
    'me', coalesce(me, 'null'::jsonb),
    'points', case when me is not null then private.v3_points(t.code) else '[]'::jsonb end,
    'chat', case when me is not null then ch else '' end,
    'polls', private.v3_app_polls(t.code, h_lid));
exception when others then return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;

-- ---------- vote: единственная запись без ключа, только по личному коду ----------
create or replace function public.api_vote(p text, pid text, v integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c text := lower(trim(coalesce(p, ''))); h_trip text; h_lid text; pl public.polls; nm text;
begin
  if c !~ '^[a-z0-9]{6,12}$' then return jsonb_build_object('ok', false, 'error', 'Голосовать можно только по личной ссылке'); end if;
  select f.trip_code, f.local_id into h_trip, h_lid from private.v3_find_code(c) f;
  if h_trip is null then return jsonb_build_object('ok', false, 'error', 'Личная ссылка больше не действует'); end if;
  select * into pl from public.polls x where x.id = upper(trim(coalesce(pid, ''))) and x.trip_code = h_trip;
  if pl.id is null or pl.status = 'скрыт' then return jsonb_build_object('ok', false, 'error', 'Голосование не найдено'); end if;
  if not (pl.status = 'идёт' and pl.ends > now()) then
    return jsonb_build_object('ok', false, 'error', 'Голосование уже закрыто', 'polls', private.v3_app_polls(h_trip, h_lid));
  end if;
  if v is null or v < 0 or v >= cardinality(pl.opts) then return jsonb_build_object('ok', false, 'error', 'Нет такого варианта'); end if;
  perform pg_advisory_xact_lock(hashtext(h_trip));
  select trim(private.v3_cap(q.first) || ' ' || private.v3_cap(q.last)) into nm
    from public.participations q where q.trip_code = h_trip and q.local_id = h_lid;
  insert into public.votes (poll_id, trip_code, local_id, name, choice) values (pl.id, h_trip, h_lid, coalesce(nm, ''), v)
    on conflict (poll_id, local_id) do update set choice = excluded.choice, name = excluded.name, at = now();
  return jsonb_build_object('ok', true, 'polls', private.v3_app_polls(h_trip, h_lid));
exception when others then return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;

-- ---------- штаб: всё с ключом ----------
create or replace function public.api_state(k text, g text default '') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.v3_key_ok(k) then raise exception 'key'; end if;
  return private.v3_state(g);
exception when others then return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;

-- ann: новое объявление (пустой текст = снять текущее)
create or replace function public.api_ann(k text, g text, txt text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.trips; s text := left(trim(coalesce(txt, '')), 1500);
begin
  if not private.v3_key_ok(k) then raise exception 'key'; end if;
  t := private.v3_need_group(g);
  update public.announcements a set show = false where a.trip_code = t.code and a.show;
  if s <> '' then insert into public.announcements (trip_code, text, show) values (t.code, s, true); end if;
  return private.v3_state(t.code);
exception when others then return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;

-- rooms: номера комнат; меняем только изменившиеся, поле без ключа в строке — остаётся как было
create or replace function public.api_rooms(k text, g text, rws jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.trips; r jsonb; n integer := 0; m integer; lid text; med text; mec text;
begin
  if not private.v3_key_ok(k) then raise exception 'key'; end if;
  t := private.v3_need_group(g);
  for r in select * from jsonb_array_elements(case when jsonb_typeof(rws) = 'array' then rws else '[]'::jsonb end) loop
    lid := trim(coalesce(r->>'id', ''));
    if lid = '' then continue; end if;
    select case when r ? 'medina' then left(trim(coalesce(r->>'medina', '')), 20) else q.room_medina end,
           case when r ? 'mecca'  then left(trim(coalesce(r->>'mecca',  '')), 20) else q.room_mecca  end
      into med, mec from public.participations q where q.trip_code = t.code and q.local_id = lid;
    if not found then continue; end if;
    update public.participations q set room_medina = med, room_mecca = mec
      where q.trip_code = t.code and q.local_id = lid and (q.room_medina <> med or q.room_mecca <> mec);
    get diagnostics m = row_count; n := n + m;
  end loop;
  return private.v3_state(t.code) || jsonb_build_object('changed', n);
exception when others then return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;

-- group: карточка группы; поля, которых нет в data, не трогаем; is_new — создать
create or replace function public.api_group(k text, g text, data jsonb, is_new boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare cd text; ch text; t public.trips; d jsonb := coalesce(data, '{}'::jsonb); nw boolean := coalesce(is_new, false);
begin
  if not private.v3_key_ok(k) then raise exception 'key'; end if;
  cd := upper(trim(coalesce(d->>'code', g, '')));
  if cd !~ '^[A-Z0-9][A-Z0-9-]{2,19}$' then raise exception 'Код группы: латиница, цифры и дефис, например UMRA-0010'; end if;
  if d ? 'chat' then
    ch := trim(coalesce(d->>'chat', ''));
    if ch <> '' and ch !~ '^https://\S+$' then raise exception 'Ссылка на чат должна начинаться с https://'; end if;
    if ch ~ '^https://chat\.whatsapp\.com/' then ch := regexp_replace(ch, '[?#].*$', ''); end if;
    ch := left(ch, 300);
  end if;
  select * into t from public.trips x where x.code = cd;
  if t.code is null and not nw then raise exception 'Группа % не найдена', cd; end if;
  if t.code is not null and nw then raise exception 'Группа % уже есть', cd; end if;
  if t.code is null then
    insert into public.trips (code, title, status, is_public, show) values (cd, cd, 'план', false, true);
  end if;
  update public.trips x set
    name         = case when d ? 'name'    then left(trim(coalesce(d->>'name', '')), 300) else x.name end,
    title        = case when d ? 'name' and trim(coalesce(d->>'name', '')) <> '' then left(trim(d->>'name'), 120) else x.title end,
    dep          = case when d ? 'dep'     then private.v3_date(d->>'dep') else x.dep end,
    ret          = case when d ? 'ret'     then private.v3_date(d->>'ret') else x.ret end,
    hotel_medina = case when d ? 'medina'  then left(trim(coalesce(d->>'medina', '')), 300) else x.hotel_medina end,
    hotel_mecca  = case when d ? 'mecca'   then left(trim(coalesce(d->>'mecca', '')), 300) else x.hotel_mecca end,
    flights      = case when d ? 'flights' then left(trim(coalesce(d->>'flights', '')), 300) else x.flights end,
    show         = case when d ? 'show'    then not (lower(trim(coalesce(d->>'show', ''))) in ('нет', 'false', '0', 'no')) else x.show end
  where x.code = cd;
  insert into public.trip_private (trip_code, chat, sheet) values (cd, coalesce(ch, ''), left(trim(coalesce(d->>'sheet', '')), 300))
    on conflict (trip_code) do update set
      chat  = case when d ? 'chat'  then excluded.chat  else public.trip_private.chat  end,
      sheet = case when d ? 'sheet' then excluded.sheet else public.trip_private.sheet end;
  return private.v3_state(cd);
exception when others then return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;

-- poll: новое голосование
create or replace function public.api_poll(k text, g text, q text, opts jsonb, ends bigint, quorum integer default 0, after boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.trips; qq text := left(trim(coalesce(q, '')), 300); o text[]; e timestamptz; tot integer; qm integer; pid text; ms bigint;
begin
  if not private.v3_key_ok(k) then raise exception 'key'; end if;
  t := private.v3_need_group(g);
  if length(qq) < 3 then raise exception 'Напишите вопрос'; end if;
  select coalesce(array_agg(x order by n), '{}'::text[]) into o from (
    select distinct on (x) x, n from (
      select left(trim(a.v), 120) as x, a.n
      from jsonb_array_elements_text(case when jsonb_typeof(opts) = 'array' then opts else '[]'::jsonb end) with ordinality a(v, n)) s
    where x <> '' order by x, n) dd;
  if cardinality(o) < 2 or cardinality(o) > 8 then raise exception 'Нужно от 2 до 8 разных вариантов'; end if;
  e := private.v3_ts(coalesce(ends, 0));
  if e is null or e <= now() + interval '5 minutes' then raise exception 'Дедлайн должен быть хотя бы через 5 минут'; end if;
  if e > now() + interval '30 days' then raise exception 'Дедлайн — не дальше 30 дней'; end if;
  select count(*) into tot from public.participations pp where pp.trip_code = t.code and pp.first <> '' and not private.v3_off(pp.status);
  qm := least(greatest(coalesce(quorum, 0), 0), tot);
  ms := private.v3_ms(now());
  loop
    pid := 'V' || private.v3_b36(ms);
    exit when not exists (select 1 from public.polls x where x.id = pid);
    ms := ms + 1;
  end loop;
  insert into public.polls (id, trip_code, q, opts, ends, quorum, after, status)
    values (pid, t.code, qq, o, e, qm, coalesce(after, false), 'идёт');
  return private.v3_state(t.code) || jsonb_build_object('made', pid);
exception when others then return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;

-- pollSet: статус голосования (идёт / закрыт / скрыт), при «идёт» — новый дедлайн
create or replace function public.api_poll_set(k text, g text, pid text, status text, ends bigint default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.trips; pl public.polls; st text := trim(coalesce(status, '')); e timestamptz;
begin
  if not private.v3_key_ok(k) then raise exception 'key'; end if;
  t := private.v3_need_group(g);
  select * into pl from public.polls x where x.id = upper(trim(coalesce(pid, ''))) and x.trip_code = t.code;
  if pl.id is null then raise exception 'Голосование не найдено'; end if;
  if st not in ('идёт', 'закрыт', 'скрыт') then raise exception 'Неизвестный статус'; end if;
  e := pl.ends;
  if st = 'идёт' then
    if coalesce(ends, 0) > 0 then e := private.v3_ts(ends); end if;
    if e is null or e <= now() + interval '60 seconds' then raise exception 'Чтобы открыть снова, поставьте новый дедлайн'; end if;
  end if;
  update public.polls x set status = st, ends = e where x.id = pl.id;
  return private.v3_state(t.code);
exception when others then return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;

-- Права: вызывать можно анониму (ключ/личный код проверяются внутри) и Edge Function (service_role)
do $$
declare f text;
begin
  foreach f in array array[
    'public.api_app(text,text)', 'public.api_vote(text,text,integer)', 'public.api_state(text,text)',
    'public.api_ann(text,text,text)', 'public.api_rooms(text,text,jsonb)', 'public.api_group(text,text,jsonb,boolean)',
    'public.api_poll(text,text,text,jsonb,bigint,integer,boolean)', 'public.api_poll_set(text,text,text,text,bigint)'] loop
    execute 'revoke all on function ' || f || ' from public';
    execute 'grant execute on function ' || f || ' to anon, authenticated, service_role';
  end loop;
end $$;
