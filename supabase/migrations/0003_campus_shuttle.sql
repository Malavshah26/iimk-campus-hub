-- IIMK Campus Hub, update 3: campus shuttle (PGP Auditorium, Phase V Campus, C&D Housing, Maingate).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run twice.
--
-- The first run also loads the students' bus timetable w.e.f. 09.06.2026 and removes the SAMPLE
-- campus-to-city bus times from seed.sql (they were placeholders). Later timetables are pasted in
-- Admin -> Bus, so running this file again never overwrites them.

create table if not exists public.shuttle_trips (
  id     bigint generated always as identity primary key,
  depart text   not null check (depart ~ '^[0-2][0-9]:[0-5][0-9]$'), -- '24:00' = midnight at the end of the day
  stops  text[] not null check (cardinality(stops) between 2 and 8),
  at     text[] not null default '{}',                                -- known times per stop ('' = not given)
  days   text   not null default 'all' check (days in ('all', 'weekday', 'weekend')),
  note   text   check (note is null or char_length(note) <= 80),
  check (cardinality(at) = 0 or cardinality(at) = cardinality(stops))
);
alter table public.shuttle_trips enable row level security;

drop policy if exists "campus users read shuttle_trips" on public.shuttle_trips;
drop policy if exists "admins insert shuttle_trips" on public.shuttle_trips;
drop policy if exists "admins update shuttle_trips" on public.shuttle_trips;
drop policy if exists "admins delete shuttle_trips" on public.shuttle_trips;
create policy "campus users read shuttle_trips" on public.shuttle_trips for select to authenticated using (public.is_campus_user());
create policy "admins insert shuttle_trips" on public.shuttle_trips for insert to authenticated with check (public.is_admin());
create policy "admins update shuttle_trips" on public.shuttle_trips for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete shuttle_trips" on public.shuttle_trips for delete to authenticated using (public.is_admin());

create index if not exists shuttle_trips_depart_idx on public.shuttle_trips (depart);

grant select, insert, update, delete on public.shuttle_trips to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- One-time load (skipped if this file has run before).
do $$
declare
  p  text := 'PGP Auditorium';
  v  text := 'Phase V Campus';
  cd text := 'C&D Housing';
  mg text := 'Maingate';
begin
  if exists (select 1 from public.settings where key = 'shuttle_loaded') then
    return;
  end if;

  delete from public.bus_times; -- sample campus-to-city times from seed.sql

  insert into public.shuttle_trips (depart, stops, at, note) values
    ('08:55', array[cd, v, p], '{}', null),
    ('09:05', array[p, v, cd], '{}', null),
    ('10:25', array[cd, v, p], '{}', null),
    ('10:35', array[p, v, cd], '{}', null),
    ('10:37', array[cd, v, p], '{}', null),
    ('11:00', array[p, v, cd, mg], '{}', null),
    ('11:45', array[mg, cd, v, p], array['', '', '11:55', ''], null),
    ('12:05', array[p, v, cd], '{}', null),
    ('12:07', array[cd, v, p], '{}', null),
    ('13:35', array[p, v, cd], '{}', null),
    ('13:38', array[cd, v, p], '{}', null),
    ('13:45', array[p, v, cd, mg], '{}', null),
    ('14:05', array[mg, cd, v, p], array['', '', '14:10', ''], null),
    ('14:15', array[p, v, cd], '{}', null),
    ('14:17', array[cd, v, p], '{}', null),
    ('15:00', array[p, v, cd, mg], '{}', null),
    ('15:30', array[mg, cd, v, p], array['', '', '15:40', ''], null),
    ('15:50', array[p, v, cd], '{}', null),
    ('15:52', array[cd, v, p], '{}', null),
    ('16:15', array[p, v, cd, mg], '{}', null),
    ('17:00', array[mg, cd, v, p], array['', '', '17:10', ''], null),
    ('17:20', array[p, v, cd], '{}', null),
    ('17:22', array[cd, v, p], '{}', null),
    ('18:00', array[p, v, cd, mg], '{}', null),
    ('18:20', array[mg, cd, v, p], array['', '', '18:30', ''], null),
    ('18:50', array[p, v, cd], '{}', null),
    ('18:52', array[cd, v, p], '{}', null),
    ('19:00', array[p, v, cd, mg], '{}', null),
    ('20:00', array[mg, cd, v, p], array['', '20:05', '', ''], null),
    ('20:10', array[p, v, cd], '{}', null),
    ('20:15', array[cd, v, p], array['', '20:20', ''], null),
    ('20:25', array[p, v, cd, mg], array['', '20:30', '', ''], null),
    ('21:00', array[mg, cd, v, p], array['', '', '21:10', ''], null),
    ('21:30', array[p, v, cd, p], '{}', 'Returns to PGP'),
    ('21:50', array[p, v, cd, mg], array['', '21:55', '', ''], null),
    ('22:20', array[mg, cd, v, p], array['', '', '22:30', ''], null),
    ('22:40', array[p, v, cd, mg], array['', '22:45', '', ''], null),
    ('23:00', array[mg, cd, v, p], '{}', null),
    ('23:20', array[p, v, cd, p], '{}', 'Returns to PGP'),
    ('23:40', array[p, v, cd, mg], '{}', null),
    ('24:00', array[mg, cd, v, p], '{}', 'Midnight');

  insert into public.settings (key, value) values ('shuttle_loaded', '2026-06-09');
end $$;
