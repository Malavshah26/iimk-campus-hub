-- IIMK Campus Hub, update 2: notices, events, complaints, mess feedback, facility booking,
-- in-app admin tools and a keep-alive ping.
--
-- Run this whole file once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Run it AFTER 0001_init.sql. It is safe on a project that already has data, and safe to run twice.

-------------------------------------------------------------------------------
-- Helpers
-------------------------------------------------------------------------------

-- Today's date on campus (the database clock runs on UTC).
create or replace function public.ist_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- 'HH:MM' -> minutes since midnight.
create or replace function public.hm(t text)
returns int
language sql
immutable
as $$ select split_part(t, ':', 1)::int * 60 + split_part(t, ':', 2)::int $$;

-- Called once a day by the Vercel cron (api/keepalive.js) so a free Supabase project
-- doesn't pause during vacations. Needs no sign-in and reveals nothing.
create or replace function public.ping()
returns text
language sql
stable
as $$ select 'ok'::text $$;

-------------------------------------------------------------------------------
-- Admin tools (so council members never need the SQL editor after setup)
-------------------------------------------------------------------------------

create or replace function public.admin_list()
returns table (user_id uuid, email text, name text, added_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.user_id, u.email::text, p.name, a.added_at
  from public.admins a
  join auth.users u on u.id = a.user_id
  left join public.profiles p on p.id = a.user_id
  where public.is_admin()
  order by a.added_at;
$$;

create or replace function public.admin_add(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  if not public.is_admin() then
    raise exception 'Only council admins can add admins.';
  end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if uid is null then
    raise exception 'No account with that email yet. Ask them to sign in to the app once, then try again.';
  end if;
  insert into public.admins (user_id) values (uid) on conflict (user_id) do nothing;
end;
$$;

create or replace function public.admin_remove(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only council admins can remove admins.';
  end if;
  if (select count(*) from public.admins) <= 1 then
    raise exception 'You can''t remove the last admin.';
  end if;
  delete from public.admins where user_id = p_user;
end;
$$;

-------------------------------------------------------------------------------
-- Notices (posted by council admins)
-------------------------------------------------------------------------------

create table if not exists public.notices (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 120),
  body       text check (body is null or char_length(body) <= 2000),
  link       text check (link is null or (char_length(link) <= 300 and link ~* '^https?://')),
  pinned     boolean not null default false,
  expires_on date,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.notices enable row level security;

drop policy if exists "campus users read notices" on public.notices;
drop policy if exists "admins add notices" on public.notices;
drop policy if exists "admins change notices" on public.notices;
drop policy if exists "admins delete notices" on public.notices;
create policy "campus users read notices" on public.notices
  for select to authenticated using (public.is_campus_user());
create policy "admins add notices" on public.notices
  for insert to authenticated with check (public.is_admin());
create policy "admins change notices" on public.notices
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete notices" on public.notices
  for delete to authenticated using (public.is_admin());

-------------------------------------------------------------------------------
-- Events (anyone can post; the app flags clashes with other events and with classes)
-------------------------------------------------------------------------------

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 100),
  organiser   text check (organiser is null or char_length(organiser) <= 60),
  venue       text check (venue is null or char_length(venue) <= 80),
  event_date  date not null,
  starts      text not null check (starts ~ '^[0-2][0-9]:[0-5][0-9]$'),
  ends        text not null check (ends ~ '^[0-2][0-9]:[0-5][0-9]$'),
  description text check (description is null or char_length(description) <= 600),
  link        text check (link is null or (char_length(link) <= 300 and link ~* '^https?://')),
  created_at  timestamptz not null default now(),
  check (ends > starts)
);

create table if not exists public.event_rsvps (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-------------------------------------------------------------------------------
-- Complaints tracker (hostel, Wi-Fi, mess ...). Admins set status and reply.
-------------------------------------------------------------------------------

create table if not exists public.complaints (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  category   text not null check (category in ('Hostel', 'Wi-Fi', 'Mess', 'Laundry', 'Classrooms', 'Transport', 'Other')),
  hostel     text,
  title      text not null check (char_length(title) between 1 and 100),
  details    text check (details is null or char_length(details) <= 800),
  photo_path text,
  status     text not null default 'open' check (status in ('open', 'progress', 'fixed')),
  response   text check (response is null or char_length(response) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.complaint_votes (
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (complaint_id, user_id)
);

-- Students can only open complaints and close their own; status changes and replies are for admins.
create or replace function public.complaints_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() then
      new.status := 'open';
      new.response := null;
    end if;
  else
    if not public.is_admin() then
      new.response := old.response;
      new.user_id := old.user_id;
      if new.status is distinct from old.status and new.status <> 'fixed' then
        new.status := old.status;
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists complaints_guard on public.complaints;
create trigger complaints_guard before insert or update on public.complaints
  for each row execute function public.complaints_guard();

-------------------------------------------------------------------------------
-- Facility booking (discussion rooms, courts). Admins manage the list.
-------------------------------------------------------------------------------

create table if not exists public.facilities (
  id          bigint generated always as identity primary key,
  name        text not null unique check (char_length(name) between 1 and 60),
  kind        text not null default 'Room' check (char_length(kind) <= 30),
  location    text check (location is null or char_length(location) <= 80),
  opens       text not null default '07:00' check (opens ~ '^[0-2][0-9]:[0-5][0-9]$'),
  closes      text not null default '23:00' check (closes ~ '^[0-2][0-9]:[0-5][0-9]$'),
  max_minutes int  not null default 120 check (max_minutes between 15 and 480),
  active      boolean not null default true,
  sort        int  not null default 0
);

create table if not exists public.bookings (
  id          uuid primary key default gen_random_uuid(),
  facility_id bigint not null references public.facilities (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day         date not null,
  starts      text not null check (starts ~ '^[0-2][0-9]:[0-5][0-9]$'),
  ends        text not null check (ends ~ '^[0-2][0-9]:[0-5][0-9]$'),
  purpose     text check (purpose is null or char_length(purpose) <= 80),
  created_at  timestamptz not null default now(),
  check (ends > starts)
);

-- No double bookings, opening hours, max length, and fair-use limits for students.
create or replace function public.bookings_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.facilities;
  upcoming int;
begin
  select * into f from public.facilities where id = new.facility_id;
  if not found or not f.active then
    raise exception 'That facility can''t be booked right now.';
  end if;
  if new.starts < f.opens or new.ends > f.closes then
    raise exception '% can be booked between % and %.', f.name, f.opens, f.closes;
  end if;
  if public.hm(new.ends) - public.hm(new.starts) > f.max_minutes then
    raise exception '% can be booked for at most % minutes at a time.', f.name, f.max_minutes;
  end if;
  if not public.is_admin() then
    if new.day < public.ist_today() or new.day > public.ist_today() + 14 then
      raise exception 'You can book from today up to 14 days ahead.';
    end if;
    select count(*) into upcoming from public.bookings
      where user_id = new.user_id and day >= public.ist_today();
    if upcoming >= 4 then
      raise exception 'You already have 4 upcoming bookings. Cancel one to book another.';
    end if;
  end if;
  -- Serialise bookings for the same facility and day so two people can't grab the same slot.
  perform pg_advisory_xact_lock(new.facility_id::int, (new.day - date '2000-01-01'));
  if exists (
    select 1 from public.bookings b
    where b.facility_id = new.facility_id and b.day = new.day and b.id <> new.id
      and b.starts < new.ends and new.starts < b.ends
  ) then
    raise exception 'Someone has already booked % at that time.', f.name;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_check on public.bookings;
create trigger bookings_check before insert on public.bookings
  for each row execute function public.bookings_check();

-------------------------------------------------------------------------------
-- Mess feedback: one thumbs up/down per person per meal per day.
-- Individual votes are private; everyone sees totals, admins also see comments.
-------------------------------------------------------------------------------

create table if not exists public.meal_ratings (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day        date not null,
  meal       text not null references public.meal_times (meal) on delete cascade,
  vote       smallint not null check (vote in (-1, 1)),
  comment    text check (comment is null or char_length(comment) <= 200),
  created_at timestamptz not null default now(),
  primary key (user_id, day, meal)
);
alter table public.meal_ratings enable row level security;

drop policy if exists "users read their own ratings" on public.meal_ratings;
drop policy if exists "users rate today's meals" on public.meal_ratings;
drop policy if exists "users change today's ratings" on public.meal_ratings;
drop policy if exists "users remove their ratings" on public.meal_ratings;
create policy "users read their own ratings" on public.meal_ratings
  for select to authenticated using (user_id = auth.uid());
create policy "users rate today's meals" on public.meal_ratings
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_campus_user() and day between public.ist_today() - 1 and public.ist_today());
create policy "users change today's ratings" on public.meal_ratings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and day between public.ist_today() - 1 and public.ist_today());
create policy "users remove their ratings" on public.meal_ratings
  for delete to authenticated using (user_id = auth.uid());

create or replace function public.meal_summary(p_from date, p_to date)
returns table (day date, meal text, up int, down int, comments text[])
language sql
stable
security definer
set search_path = public
as $$
  select r.day, r.meal,
         count(*) filter (where r.vote = 1)::int,
         count(*) filter (where r.vote = -1)::int,
         case when public.is_admin()
              then array_remove(array_agg(r.comment order by r.created_at desc), null)
              else null end
  from public.meal_ratings r
  where public.is_campus_user() and r.day between p_from and p_to
  group by r.day, r.meal
  order by r.day, r.meal;
$$;

-------------------------------------------------------------------------------
-- Access rules for the new student tables
-------------------------------------------------------------------------------

do $$
declare t text;
begin
  -- Posts owned by one student: everyone on campus reads, owners (or admins) change and delete.
  foreach t in array array['events', 'complaints', 'bookings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "campus users read %1$s" on public.%1$I', t);
    execute format('drop policy if exists "users add their own %1$s" on public.%1$I', t);
    execute format('drop policy if exists "owners or admins update %1$s" on public.%1$I', t);
    execute format('drop policy if exists "owners or admins delete %1$s" on public.%1$I', t);
    execute format('create policy "campus users read %1$s" on public.%1$I for select to authenticated using (public.is_campus_user())', t);
    execute format('create policy "users add their own %1$s" on public.%1$I for insert to authenticated with check (user_id = auth.uid() and public.is_campus_user())', t);
    execute format('create policy "owners or admins update %1$s" on public.%1$I for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin())', t);
    execute format('create policy "owners or admins delete %1$s" on public.%1$I for delete to authenticated using (user_id = auth.uid() or public.is_admin())', t);
  end loop;

  -- "Going" and "me too" marks: everyone reads, people add and remove only their own.
  foreach t in array array['event_rsvps', 'complaint_votes']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "campus users read %1$s" on public.%1$I', t);
    execute format('drop policy if exists "users add their own %1$s" on public.%1$I', t);
    execute format('drop policy if exists "users remove their own %1$s" on public.%1$I', t);
    execute format('create policy "campus users read %1$s" on public.%1$I for select to authenticated using (public.is_campus_user())', t);
    execute format('create policy "users add their own %1$s" on public.%1$I for insert to authenticated with check (user_id = auth.uid() and public.is_campus_user())', t);
    execute format('create policy "users remove their own %1$s" on public.%1$I for delete to authenticated using (user_id = auth.uid() or public.is_admin())', t);
  end loop;

  -- Facilities are reference data, like hostels.
  alter table public.facilities enable row level security;
  drop policy if exists "campus users read facilities" on public.facilities;
  drop policy if exists "admins insert facilities" on public.facilities;
  drop policy if exists "admins update facilities" on public.facilities;
  drop policy if exists "admins delete facilities" on public.facilities;
  create policy "campus users read facilities" on public.facilities for select to authenticated using (public.is_campus_user());
  create policy "admins insert facilities" on public.facilities for insert to authenticated with check (public.is_admin());
  create policy "admins update facilities" on public.facilities for update to authenticated using (public.is_admin()) with check (public.is_admin());
  create policy "admins delete facilities" on public.facilities for delete to authenticated using (public.is_admin());
end $$;

-------------------------------------------------------------------------------
-- Admin: usage and clean-up (keeps the free plan's 500 MB database / 1 GB photos in check)
-------------------------------------------------------------------------------

create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only council admins can see usage.';
  end if;
  return jsonb_build_object(
    'people',      (select count(*) from public.profiles),
    'rides',       (select count(*) from public.rides),
    'lost',        (select count(*) from public.lost_items),
    'listings',    (select count(*) from public.listings),
    'events',      (select count(*) from public.events),
    'complaints',  (select count(*) from public.complaints),
    'open_complaints', (select count(*) from public.complaints where status <> 'fixed'),
    'bookings',    (select count(*) from public.bookings),
    'ratings',     (select count(*) from public.meal_ratings),
    'photos',      (select count(*) from storage.objects where bucket_id = 'photos'),
    'photo_bytes', (select coalesce(sum((metadata ->> 'size')::bigint), 0) from storage.objects where bucket_id = 'photos'),
    'db_bytes',    pg_database_size(current_database())
  );
end;
$$;

-- Deletes old finished posts and returns their photo paths; the Admin page then removes
-- those photos through the Storage API (Supabase doesn't allow deleting files from SQL).
create or replace function public.admin_cleanup(p_days int default 60)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  keep_days int := greatest(coalesce(p_days, 60), 7);
  cutoff timestamptz := now() - make_interval(days => greatest(coalesce(p_days, 60), 7));
  cutoff_day date := public.ist_today() - greatest(coalesce(p_days, 60), 7);
  photos text[] := '{}';
  p text[];
  n_lost int; n_listings int; n_complaints int; n_rides int; n_events int; n_bookings int; n_ratings int;
begin
  if not public.is_admin() then
    raise exception 'Only council admins can clean up.';
  end if;

  with d as (delete from public.lost_items where status = 'done' and created_at < cutoff returning photo_path)
  select coalesce(array_agg(photo_path) filter (where photo_path is not null), '{}'), count(*) into p, n_lost from d;
  photos := photos || p;

  with d as (delete from public.listings where status = 'done' and created_at < cutoff returning photo_path)
  select coalesce(array_agg(photo_path) filter (where photo_path is not null), '{}'), count(*) into p, n_listings from d;
  photos := photos || p;

  with d as (delete from public.complaints where status = 'fixed' and updated_at < cutoff returning photo_path)
  select coalesce(array_agg(photo_path) filter (where photo_path is not null), '{}'), count(*) into p, n_complaints from d;
  photos := photos || p;

  with d as (delete from public.rides where ride_date < cutoff_day returning 1) select count(*) into n_rides from d;
  with d as (delete from public.events where event_date < cutoff_day returning 1) select count(*) into n_events from d;
  with d as (delete from public.bookings where day < cutoff_day returning 1) select count(*) into n_bookings from d;
  with d as (delete from public.meal_ratings where day < public.ist_today() - greatest(keep_days, 180) returning 1)
  select count(*) into n_ratings from d;

  return jsonb_build_object(
    'lost', n_lost, 'listings', n_listings, 'complaints', n_complaints, 'rides', n_rides,
    'events', n_events, 'bookings', n_bookings, 'ratings', n_ratings, 'photos', to_jsonb(photos)
  );
end;
$$;

-------------------------------------------------------------------------------
-- Indexes
-------------------------------------------------------------------------------

create index if not exists notices_created_idx on public.notices (created_at desc);
create index if not exists events_date_idx on public.events (event_date, starts);
create index if not exists complaints_created_idx on public.complaints (created_at desc);
create index if not exists bookings_lookup_idx on public.bookings (facility_id, day, starts);
create index if not exists bookings_user_idx on public.bookings (user_id, day);
create index if not exists meal_ratings_day_idx on public.meal_ratings (day, meal);

-------------------------------------------------------------------------------
-- SAMPLE facilities (only added if the list is empty). Edit them in Admin -> Facilities.
-------------------------------------------------------------------------------

insert into public.facilities (name, kind, location, opens, closes, max_minutes, sort)
select * from (values
  ('Discussion room 1', 'Discussion room', 'Library, ground floor', '08:00', '23:59', 120, 1),
  ('Discussion room 2', 'Discussion room', 'Library, ground floor', '08:00', '23:59', 120, 2),
  ('Discussion room 3', 'Discussion room', 'Library, first floor', '08:00', '23:59', 120, 3),
  ('Badminton court 1', 'Court', 'Sports complex', '06:00', '22:00', 60, 4),
  ('Badminton court 2', 'Court', 'Sports complex', '06:00', '22:00', 60, 5),
  ('Tennis court', 'Court', 'Sports complex', '06:00', '21:00', 60, 6)
) as v(name, kind, location, opens, closes, max_minutes, sort)
where not exists (select 1 from public.facilities);

-------------------------------------------------------------------------------
-- Live updates for the new tables
-------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['notices', 'events', 'event_rsvps', 'complaints', 'complaint_votes', 'bookings']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-------------------------------------------------------------------------------
-- API access. Supabase usually grants this automatically, but only if
-- "Grant API access to new tables automatically" was ticked when the project was created.
-- Granting explicitly makes the app work either way. Row-level security still decides
-- which rows each person can see or change.
-------------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;

revoke execute on function public.admin_list() from public, anon;
revoke execute on function public.admin_add(text) from public, anon;
revoke execute on function public.admin_remove(uuid) from public, anon;
revoke execute on function public.admin_stats() from public, anon;
revoke execute on function public.admin_cleanup(int) from public, anon;
revoke execute on function public.meal_summary(date, date) from public, anon;
grant execute on function public.ping() to anon;
