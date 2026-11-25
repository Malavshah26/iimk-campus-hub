-- IIMK Campus Hub: database schema, access rules and storage.
-- Run this whole file once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Then run supabase/seed.sql and supabase/seed_timetable.sql for starting data.

-------------------------------------------------------------------------------
-- Settings and access helpers
-------------------------------------------------------------------------------

create table if not exists public.settings (
  key   text primary key,
  value text not null
);
alter table public.settings enable row level security;
-- No policies: only the SQL editor (service role) can read or change settings.

insert into public.settings (key, value)
values ('allowed_email_domain', 'iimk.ac.in')
on conflict (key) do nothing;

-- True when the signed-in user's email belongs to the allowed domain
-- (name@iimk.ac.in, or a subdomain such as name@pgp.iimk.ac.in).
create or replace function public.is_campus_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.settings s
    where s.key = 'allowed_email_domain'
      and (
        lower(coalesce(auth.jwt() ->> 'email', '')) like '%@' || lower(s.value)
        or lower(coalesce(auth.jwt() ->> 'email', '')) like '%.' || lower(s.value)
      )
  );
$$;

-- Council admins. Add one with:
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'someone@iimk.ac.in';
create table if not exists public.admins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins a where a.user_id = auth.uid());
$$;

create policy "admins can see the admin list"
  on public.admins for select to authenticated
  using (public.is_admin() or user_id = auth.uid());

-------------------------------------------------------------------------------
-- Profiles
-------------------------------------------------------------------------------

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  phone      text check (phone is null or char_length(phone) <= 20),
  year       text not null default '1' check (year in ('1', '2')),
  section    text not null default 'A',
  hostel     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "campus users read profiles"
  on public.profiles for select to authenticated
  using (public.is_campus_user());
create policy "users create their own profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid() and public.is_campus_user());
create policy "users update their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-------------------------------------------------------------------------------
-- Reference data (edited by council admins from the Admin page)
-------------------------------------------------------------------------------

create table if not exists public.sections (
  code  text primary key,
  label text not null,
  sort  int  not null default 0
);

create table if not exists public.hostels (
  code     text primary key,
  machines int  not null default 3 check (machines between 0 and 30),
  sort     int  not null default 0
);

create table if not exists public.class_slots (
  slot   int  primary key check (slot between 1 and 12),
  starts text not null check (starts ~ '^[0-2][0-9]:[0-5][0-9]$'),
  ends   text not null check (ends ~ '^[0-2][0-9]:[0-5][0-9]$')
);

create table if not exists public.timetable (
  id          bigint generated always as identity primary key,
  year        text not null check (year in ('1', '2')),
  section     text not null references public.sections (code) on update cascade on delete cascade,
  weekday     int  not null check (weekday between 1 and 6), -- 1 = Monday ... 6 = Saturday
  slot        int  not null references public.class_slots (slot) on update cascade,
  course_code text not null check (char_length(course_code) <= 12),
  course_name text not null check (char_length(course_name) <= 80),
  room        text check (room is null or char_length(room) <= 20),
  unique (year, section, weekday, slot)
);

create table if not exists public.bus_times (
  id        bigint generated always as identity primary key,
  day_type  text not null check (day_type in ('weekday', 'weekend')),
  direction text not null check (direction in ('out', 'in')), -- out = campus to city
  time      text not null check (time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  note      text
);

create table if not exists public.meal_times (
  meal   text primary key check (meal in ('b', 'l', 's', 'd')),
  label  text not null,
  starts text not null,
  ends   text not null,
  sort   int  not null default 0
);

create table if not exists public.mess_menu (
  day   text not null check (day in ('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun')),
  meal  text not null references public.meal_times (meal) on delete cascade,
  items text not null default '',
  primary key (day, meal)
);

create table if not exists public.contacts (
  id        bigint generated always as identity primary key,
  grp       text not null,
  name      text not null,
  number    text not null,
  note      text,
  emergency boolean not null default false,
  sort      int not null default 0
);

do $$
declare t text;
begin
  foreach t in array array['sections','hostels','class_slots','timetable','bus_times','meal_times','mess_menu','contacts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "campus users read %1$s" on public.%1$I for select to authenticated using (public.is_campus_user())', t);
    execute format('create policy "admins insert %1$s" on public.%1$I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy "admins update %1$s" on public.%1$I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy "admins delete %1$s" on public.%1$I for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

-------------------------------------------------------------------------------
-- Student posts: carpool, lost & found, buy & sell
-------------------------------------------------------------------------------

create table if not exists public.rides (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  dest       text not null check (char_length(dest) <= 20),
  dest_text  text check (dest_text is null or char_length(dest_text) <= 80),
  ride_date  date not null,
  ride_time  text not null check (ride_time ~ '^[0-2][0-9]:[0-5][0-9]$'),
  seats      int  not null default 4 check (seats between 2 and 8),
  note       text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

create table if not exists public.ride_members (
  ride_id    uuid not null references public.rides (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ride_id, user_id)
);

create table if not exists public.lost_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('lost', 'found')),
  item        text not null check (char_length(item) between 1 and 80),
  place       text check (place is null or char_length(place) <= 80),
  item_date   date not null default current_date,
  description text check (description is null or char_length(description) <= 400),
  photo_path  text,
  status      text not null default 'open' check (status in ('open', 'done')),
  created_at  timestamptz not null default now()
);

create table if not exists public.listings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind        text not null check (kind in ('sell', 'rent', 'want')),
  title       text not null check (char_length(title) between 1 and 80),
  price       int  not null default 0 check (price between 0 and 10000000),
  unit        text check (unit is null or unit in ('day', 'week', 'month', 'term')),
  category    text not null default 'Other',
  condition   text,
  hostel      text,
  description text check (description is null or char_length(description) <= 400),
  photo_path  text,
  status      text not null default 'open' check (status in ('open', 'done')),
  created_at  timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['rides','lost_items','listings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "campus users read %1$s" on public.%1$I for select to authenticated using (public.is_campus_user())', t);
    execute format('create policy "users add their own %1$s" on public.%1$I for insert to authenticated with check (user_id = auth.uid() and public.is_campus_user())', t);
    execute format('create policy "owners or admins update %1$s" on public.%1$I for update to authenticated using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin())', t);
    execute format('create policy "owners or admins delete %1$s" on public.%1$I for delete to authenticated using (user_id = auth.uid() or public.is_admin())', t);
  end loop;
end $$;

alter table public.ride_members enable row level security;
create policy "campus users read ride members"
  on public.ride_members for select to authenticated
  using (public.is_campus_user());
create policy "users join rides themselves"
  on public.ride_members for insert to authenticated
  with check (user_id = auth.uid() and public.is_campus_user());
create policy "members, ride owners or admins remove members"
  on public.ride_members for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.rides r where r.id = ride_id and r.user_id = auth.uid())
  );

-------------------------------------------------------------------------------
-- Laundry
-------------------------------------------------------------------------------

create table if not exists public.washers (
  id         text primary key check (id ~ '^[A-Za-z0-9]+-[0-9]+$'), -- e.g. K1-2
  hostel     text not null references public.hostels (code) on update cascade on delete cascade,
  status     text not null default 'ok' check (status in ('ok', 'broken')),
  started_at timestamptz,
  ends_at    timestamptz,
  user_id    uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.washer_queue (
  washer_id  text not null references public.washers (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (washer_id, user_id)
);

alter table public.washers enable row level security;
create policy "campus users read washers"
  on public.washers for select to authenticated using (public.is_campus_user());
create policy "campus users add washer state"
  on public.washers for insert to authenticated with check (public.is_campus_user());
create policy "campus users update washer state"
  on public.washers for update to authenticated
  using (public.is_campus_user()) with check (public.is_campus_user());
create policy "admins delete washers"
  on public.washers for delete to authenticated using (public.is_admin());

alter table public.washer_queue enable row level security;
create policy "campus users read the queue"
  on public.washer_queue for select to authenticated using (public.is_campus_user());
create policy "users queue themselves"
  on public.washer_queue for insert to authenticated
  with check (user_id = auth.uid() and public.is_campus_user());
create policy "users or admins leave the queue"
  on public.washer_queue for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-------------------------------------------------------------------------------
-- Attendance: private to each student
-------------------------------------------------------------------------------

create table if not exists public.attendance (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key         text not null check (char_length(key) <= 60), -- year+section|date|slot
  course_code text not null,
  status      text not null check (status in ('y', 'n')),
  updated_at  timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.attendance enable row level security;
create policy "users read their own attendance"
  on public.attendance for select to authenticated using (user_id = auth.uid());
create policy "users add their own attendance"
  on public.attendance for insert to authenticated with check (user_id = auth.uid());
create policy "users change their own attendance"
  on public.attendance for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users delete their own attendance"
  on public.attendance for delete to authenticated using (user_id = auth.uid());

-------------------------------------------------------------------------------
-- Indexes
-------------------------------------------------------------------------------

create index if not exists rides_date_idx on public.rides (ride_date);
create index if not exists lost_items_created_idx on public.lost_items (created_at desc);
create index if not exists listings_created_idx on public.listings (created_at desc);
create index if not exists timetable_lookup_idx on public.timetable (year, section, weekday);

-------------------------------------------------------------------------------
-- Photos (private bucket, campus users only)
-------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "campus users view photos"
  on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_campus_user());
create policy "campus users upload into their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and public.is_campus_user()
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "owners or admins delete photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-------------------------------------------------------------------------------
-- Live updates
-------------------------------------------------------------------------------

alter publication supabase_realtime
  add table public.rides, public.ride_members, public.lost_items,
            public.listings, public.washers, public.washer_queue;
