-- IIMK Campus Hub, update 4: section timetables filled from students' calendars.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run twice.
--
-- IIMK class invites ("Session No: 15 - EE(C)-LME-(CR B1)") are the same for a whole section.
-- When a student syncs their Google Calendar, the app shares just those class sessions for their own
-- year and section (course, session number, faculty initials, room, time; never other events), so
-- everyone in the section sees the real schedule, even without syncing.

create table if not exists public.section_sessions (
  id         bigint generated always as identity primary key,
  year       text not null check (year in ('1', '2')),
  section    text not null references public.sections (code) on update cascade on delete cascade,
  day        date not null,
  starts     text not null check (starts ~ '^[0-2][0-9]:[0-5][0-9]$'),
  ends       text not null check (ends ~ '^[0-2][0-9]:[0-5][0-9]$'),
  code       text not null check (char_length(code) between 1 and 20),
  session    int,
  faculty    text check (faculty is null or char_length(faculty) <= 20),
  room       text check (room is null or char_length(room) <= 20),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (ends > starts),
  unique (year, section, day, starts, code)
);
create index if not exists section_sessions_lookup_idx on public.section_sessions (year, section, day);

alter table public.section_sessions enable row level security;
drop policy if exists "campus users read section_sessions" on public.section_sessions;
drop policy if exists "admins delete section_sessions" on public.section_sessions;
create policy "campus users read section_sessions" on public.section_sessions
  for select to authenticated using (public.is_campus_user());
create policy "admins delete section_sessions" on public.section_sessions
  for delete to authenticated using (public.is_admin());
-- No insert/update policies: students write only through sync_section_sessions() below.

grant select, delete on public.section_sessions to authenticated;
grant all on public.section_sessions to service_role;

-- Replaces the caller's own section's sessions between p_from and p_to with p_rows.
-- Year and section come from the caller's profile, never from the request.
create or replace function public.sync_section_sessions(p_from date, p_to date, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  me public.profiles;
  n int;
begin
  if not public.is_campus_user() then
    raise exception 'Sign in with a campus account.';
  end if;
  select * into me from public.profiles where id = auth.uid();
  if not found then
    raise exception 'Set up your profile first.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Bad request.';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 120
     or p_from < public.ist_today() - 30 or p_to > public.ist_today() + 150 then
    raise exception 'Bad date range.';
  end if;
  if jsonb_array_length(p_rows) > 800 then
    raise exception 'Too many sessions.';
  end if;
  -- A near-empty calendar (wrong link, wrong filter) must not wipe the section's timetable.
  if jsonb_array_length(p_rows) < 3 then
    return 0;
  end if;

  -- One sync at a time per section.
  perform pg_advisory_xact_lock(hashtext('section_sessions'), hashtext(me.year || me.section));

  delete from public.section_sessions
  where year = me.year and section = me.section and day between p_from and p_to;

  insert into public.section_sessions (year, section, day, starts, ends, code, session, faculty, room, updated_by)
  select me.year, me.section, (r ->> 'day')::date, r ->> 'starts', r ->> 'ends',
         left(trim(r ->> 'code'), 20),
         case when (r ->> 'session') ~ '^\d{1,4}$' then (r ->> 'session')::int end,
         nullif(left(trim(coalesce(r ->> 'faculty', '')), 20), ''),
         nullif(left(trim(coalesce(r ->> 'room', '')), 20), ''),
         auth.uid()
  from jsonb_array_elements(p_rows) r
  where (r ->> 'day') ~ '^\d{4}-\d{2}-\d{2}$'
    and (r ->> 'day')::date between p_from and p_to
    and (r ->> 'starts') ~ '^[0-2][0-9]:[0-5][0-9]$'
    and (r ->> 'ends') ~ '^[0-2][0-9]:[0-5][0-9]$'
    and (r ->> 'ends') > (r ->> 'starts')
    and length(trim(coalesce(r ->> 'code', ''))) between 1 and 20
  on conflict (year, section, day, starts, code) do update
    set ends = excluded.ends, session = excluded.session, faculty = excluded.faculty,
        room = excluded.room, updated_by = excluded.updated_by, updated_at = now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.sync_section_sessions(date, date, jsonb) from public, anon;
grant execute on function public.sync_section_sessions(date, date, jsonb) to authenticated;
