-- v3, этап 2: ЭКСПОРТ Supabase → Main_v2 (сухой прогон).
-- Функции только СОБИРАЮТ строки в том же виде, в каком их читает Code.gs (заголовки листов Main_v2),
-- и ничего в Google Sheets не пишут. Запись в таблицу — отдельный шаг, только по «да» и не раньше 07.11.2026.
-- Паспортные колонки листа «Участники» (D–I, O–X) в экспорт не входят: в базе их нет и не будет.
-- Вызов: select public.v3_export('<adminKey>', 'Программа', 'UMRA-0009');  select public.v3_export_all('<adminKey>', 'UMRA-0009');

-- Строка листа «Группы» (GROUP_COLS в Code.gs) --------------------------------------------------
create or replace function private.v3_x_groups(trip text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_array(
      t.code, coalesce(nullif(t.name, ''), t.title), coalesce(p.sheet, ''), coalesce(p.chat, ''),
      private.v3_dmy(t.dep), private.v3_dmy(t.ret), t.hotel_medina, t.hotel_mecca, t.flights,
      case when t.show then 'да' else 'нет' end)
    order by t.sort, t.dep desc nulls last, t.code), '[]'::jsonb)
  from public.trips t left join public.trip_private p on p.trip_code = t.code
  where trip = '' or t.code = trip $$;

-- Лист «Участники» группы: только рабочие колонки A–C, J–N (ID, Фамилия, Имя, Роль, Статус, Телефон, комнаты)
create or replace function private.v3_x_members(trip text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_array(
      m.local_id, m.last, m.first, m.role, m.status, m.tel, m.room_medina, m.room_mecca)
    order by m.ord, m.local_id), '[]'::jsonb)
  from public.participations m where m.trip_code = trip $$;

-- Лист «Программа» (9 колонок + «В гиде»)
create or replace function private.v3_x_program(trip text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_array(
      r.date, r.day, r.time, r.city, r.place, r.what, r.transport, r.who, r.note,
      case when r.in_guide then 'да' else 'нет' end)
    order by r.ord), '[]'::jsonb)
  from public.program_rows r where r.trip_code = trip $$;

-- Лист «Объявления» хаба: Дата, Группа («все» = для всех), Текст, Показывать
create or replace function private.v3_x_ann(trip text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_array(
      private.v3_fmt(a.at, 'Asia/Almaty', 'DD.MM.YYYY HH24:MI'), coalesce(a.trip_code, 'все'), a.text,
      case when a.show then 'да' else 'нет' end)
    order by a.at, a.created_at), '[]'::jsonb)
  from public.announcements a where trip = '' or a.trip_code = trip or a.trip_code is null $$;

-- Лист «Голосования» (POLL_HEAD): варианты через перевод строки, дедлайн по Алматы
create or replace function private.v3_x_polls(trip text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_array(
      p.id, p.trip_code, p.q, array_to_string(p.opts, E'\n'),
      private.v3_fmt(p.ends, 'Asia/Almaty', 'DD.MM.YYYY HH24:MI'), p.quorum,
      case when p.after then 'после дедлайна' else 'сразу' end, p.status,
      private.v3_fmt(p.created, 'Asia/Almaty', 'DD.MM.YYYY HH24:MI'))
    order by p.created, p.id), '[]'::jsonb)
  from public.polls p where trip = '' or p.trip_code = trip $$;

-- Лист «Голоса» (VOTE_HEAD): вариант — текстом, как пишет vote_ в Code.gs
create or replace function private.v3_x_votes(trip text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_array(
      private.v3_fmt(v.at, 'Asia/Almaty', 'DD.MM.YYYY HH24:MI:SS'), v.trip_code, v.poll_id, v.local_id, v.name,
      coalesce(p.opts[v.choice + 1], v.choice::text))
    order by v.at), '[]'::jsonb)
  from public.votes v join public.polls p on p.id = v.poll_id
  where trip = '' or v.trip_code = trip $$;

-- Лист «Точки сбора» группы
create or replace function private.v3_x_points(trip text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_array(m.city, m.name, m.how, m.map) order by m.ord, m.name), '[]'::jsonb)
  from public.meet_points m where m.trip_code = trip $$;

-- Лист «Доп. дуа» (общие + группы): Проверено = 'да' только у verified
create or replace function private.v3_x_dua(trip text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_array(
      d.when_, d.title, d.ar, d.tr, d.ru, d.src, case when d.verified then 'да' else '' end)
    order by d.ord, d.title), '[]'::jsonb)
  from public.extra_dua d where trip = '' or d.trip_code = trip or d.trip_code is null $$;

-- Заголовки листов — буква в букву как в Main_v2 / Code.gs
create or replace function private.v3_x_head(sheet text) returns jsonb
language sql immutable set search_path = '' as $$
  select case sheet
    when 'Группы'      then '["Код","Название","Таблица","Чат WhatsApp","Вылет","Возврат","Отель Медина","Отель Мекка","Рейсы","Показывать"]'
    when 'Участники'   then '["ID","Фамилия","Имя","Роль","Статус","Телефон / WhatsApp","Комната Медина","Комната Мекка"]'
    when 'Программа'   then '["Дата","День","Время (местное)","Город","Место","Что делаем","Транспорт","Ответственный","Статус / уточнить","В гиде"]'
    when 'Объявления'  then '["Дата","Группа","Текст","Показывать"]'
    when 'Голосования' then '["ID","Группа","Вопрос","Варианты","Дедлайн","Кворум","Итоги","Статус","Создано"]'
    when 'Голоса'      then '["Дата","Группа","Голосование","ID участника","Имя","Вариант"]'
    when 'Точки сбора' then '["Город","Название","Как найти","Ссылка на карту"]'
    when 'Доп. дуа'    then '["Когда","Название","Арабский","Транскрипция","Перевод","Источник","Проверено"]'
  end::jsonb $$;

-- Один лист. trip обязателен для листов группы (Участники, Программа, Точки сбора); для хаба '' = все группы
create or replace function public.v3_export(k text, sheet text, trip text default '') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare rows jsonb; head jsonb; code text := upper(trim(coalesce(trip, '')));
begin
  if not private.v3_key_ok(k) then raise exception 'key'; end if;
  head := private.v3_x_head(sheet);
  if head is null then raise exception 'Нет такого листа: %', sheet; end if;
  if sheet in ('Участники', 'Программа', 'Точки сбора') then
    if code = '' then raise exception 'Для листа «%» нужен код группы', sheet; end if;
    perform private.v3_need_group(code);
  elsif code <> '' then
    perform private.v3_need_group(code);
  end if;
  rows := case sheet
    when 'Группы'      then private.v3_x_groups(code)
    when 'Участники'   then private.v3_x_members(code)
    when 'Программа'   then private.v3_x_program(code)
    when 'Объявления'  then private.v3_x_ann(code)
    when 'Голосования' then private.v3_x_polls(code)
    when 'Голоса'      then private.v3_x_votes(code)
    when 'Точки сбора' then private.v3_x_points(code)
    when 'Доп. дуа'    then private.v3_x_dua(code)
  end;
  return jsonb_build_object('ok', true, 'sheet', sheet, 'trip', code, 'head', head, 'rows', rows,
                            'n', jsonb_array_length(rows), 'dry_run', true,
                            'at', private.v3_fmt(now(), 'Asia/Almaty', 'DD.MM.YYYY HH24:MI'));
exception when others then return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;

-- Все листы разом: хаб (все группы, если trip = '') + листы группы (если trip задан)
create or replace function public.v3_export_all(k text, trip text default '') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare out_ jsonb := '{}'::jsonb; s text; r jsonb; code text := upper(trim(coalesce(trip, '')));
begin
  if not private.v3_key_ok(k) then raise exception 'key'; end if;
  foreach s in array array['Группы', 'Объявления', 'Голосования', 'Голоса', 'Доп. дуа'] ||
                    case when code <> '' then array['Участники', 'Программа', 'Точки сбора'] else '{}'::text[] end loop
    r := public.v3_export(k, s, code);
    if not (r->>'ok')::boolean then return r; end if;
    out_ := out_ || jsonb_build_object(s, jsonb_build_object('head', r->'head', 'rows', r->'rows', 'n', r->'n'));
  end loop;
  return jsonb_build_object('ok', true, 'trip', code, 'dry_run', true, 'sheets', out_,
                            'at', private.v3_fmt(now(), 'Asia/Almaty', 'DD.MM.YYYY HH24:MI'));
exception when others then return jsonb_build_object('ok', false, 'error', sqlerrm);
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.v3_export(text,text,text)', 'public.v3_export_all(text,text)'] loop
    execute 'revoke all on function ' || f || ' from public';
    execute 'grant execute on function ' || f || ' to anon, authenticated, service_role';
  end loop;
end $$;
