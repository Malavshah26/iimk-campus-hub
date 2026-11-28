-- IIMK Campus Hub, update 9: notices, events and polls for a batch, section or hostel; section and hostel
-- group chats; medicine requests; airport cabs; sample posts (Buy & sell, Events, Polls) to remove before launch.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run twice.
-- If Supabase warns about "destructive operations", click "Run this query" (it only re-creates access rules).
-- Needs 0002 (events, notices) and 0006 (polls) first.

-------------------------------------------------------------------------------
-- Who something is for: everyone, a year (batch), a section of a year, or a hostel.
-- True when the signed-in student is in that audience (null = no restriction).
-------------------------------------------------------------------------------

create or replace function public.in_audience(p_year text, p_section text, p_hostel text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_campus_user() and (
    (p_year is null and p_section is null and p_hostel is null)
    or exists (
      select 1 from public.profiles me
      where me.id = auth.uid()
        and (p_year is null or me.year = p_year)
        and (p_section is null or me.section = p_section)
        and (p_hostel is null or me.hostel = p_hostel)
    )
  );
$$;
revoke execute on function public.in_audience(text, text, text) from public, anon;
grant execute on function public.in_audience(text, text, text) to authenticated;

-- Notices (council): only the audience (and admins) see them; realtime follows the same rule.
alter table public.notices
  add column if not exists year    text check (year is null or year in ('1', '2')),
  add column if not exists section text references public.sections (code) on update cascade on delete cascade,
  add column if not exists hostel  text references public.hostels (code) on update cascade on delete cascade;
alter table public.notices drop constraint if exists notices_section_needs_year;
alter table public.notices add constraint notices_section_needs_year check (section is null or year is not null);
drop policy if exists "campus users read notices" on public.notices;
create policy "campus users read notices" on public.notices
  for select to authenticated using (public.is_admin() or public.in_audience(year, section, hostel));

-- Events (anyone posts): students may aim an event at everyone or at groups they're in; admins at anyone.
alter table public.events
  add column if not exists year    text check (year is null or year in ('1', '2')),
  add column if not exists section text references public.sections (code) on update cascade on delete cascade,
  add column if not exists hostel  text references public.hostels (code) on update cascade on delete cascade,
  add column if not exists sample  boolean not null default false;
alter table public.events drop constraint if exists events_section_needs_year;
alter table public.events add constraint events_section_needs_year check (section is null or year is not null);
drop policy if exists "campus users read events" on public.events;
drop policy if exists "users add their own events" on public.events;
drop policy if exists "owners or admins update events" on public.events;
create policy "campus users read events" on public.events
  for select to authenticated using (public.is_admin() or user_id = auth.uid() or public.in_audience(year, section, hostel));
create policy "users add their own events" on public.events
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_campus_user() and (public.is_admin() or public.in_audience(year, section, hostel)));
create policy "owners or admins update events" on public.events
  for update to authenticated
  using (user_id = auth.uid() or public.is_admin())
  with check (public.is_admin() or (user_id = auth.uid() and public.in_audience(year, section, hostel)));

-- Polls and elections: a hostel can be the audience too.
alter table public.polls
  add column if not exists hostel text references public.hostels (code) on update cascade on delete cascade,
  add column if not exists sample boolean not null default false;
drop policy if exists "students read their polls" on public.polls;
create policy "students read their polls" on public.polls
  for select to authenticated using (public.is_admin() or public.in_audience(year, section, hostel));

create or replace function public.polls_guard()
returns trigger
language plpgsql
as $$
begin
  if new.title is distinct from old.title or new.details is distinct from old.details
     or new.secret is distinct from old.secret or new.year is distinct from old.year
     or new.section is distinct from old.section or new.hostel is distinct from old.hostel
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'Only the closing time of a poll can be changed. Delete it and start a new one instead.';
  end if;
  if old.closes_at <= now() and new.closes_at is distinct from old.closes_at then
    raise exception 'This poll has closed and its results are out, so it can''t be reopened.';
  end if;
  return new;
end;
$$;

drop function if exists public.poll_create(text, text, boolean, text, text, timestamptz, text[]);
create or replace function public.poll_create(
  p_title text, p_details text, p_secret boolean, p_year text, p_section text,
  p_closes timestamptz, p_options text[], p_hostel text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
  opts text[];
begin
  if not public.is_admin() then
    raise exception 'Only council admins can start polls.';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 140 then
    raise exception 'Write the question (up to 140 characters).';
  end if;
  if p_closes is null or p_closes <= now() + interval '5 minutes' or p_closes > now() + interval '60 days' then
    raise exception 'Pick a closing time between a few minutes and 60 days from now.';
  end if;
  if nullif(p_section, '') is not null and nullif(p_year, '') is null then
    raise exception 'Pick the year for a section poll.';
  end if;
  select array_agg(o order by i) into opts
  from (
    select distinct on (lower(trim(o))) left(trim(o), 100) o, i
    from unnest(p_options) with ordinality as t(o, i)
    where trim(coalesce(o, '')) <> ''
    order by lower(trim(o)), i
  ) d;
  if coalesce(array_length(opts, 1), 0) not between 2 and 12 then
    raise exception 'Give between 2 and 12 different options.';
  end if;
  insert into public.polls (title, details, secret, year, section, hostel, closes_at)
  values (trim(p_title), nullif(left(trim(coalesce(p_details, '')), 1000), ''), coalesce(p_secret, false),
          nullif(p_year, ''), nullif(p_section, ''), nullif(p_hostel, ''), p_closes)
  returning id into pid;
  insert into public.poll_options (poll_id, label, sort)
  select pid, o, i from unnest(opts) with ordinality as t(o, i);
  return pid;
end;
$$;

create or replace function public.poll_vote(p_poll uuid, p_option bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.polls;
  me public.profiles;
begin
  if not public.is_campus_user() then
    raise exception 'Sign in with your campus email to vote.';
  end if;
  select * into me from public.profiles where id = auth.uid();
  if not found then
    raise exception 'Set up your profile first.';
  end if;
  select * into p from public.polls where id = p_poll;
  if not found then
    raise exception 'This poll no longer exists.';
  end if;
  if p.closes_at <= now() then
    raise exception 'Voting has closed.';
  end if;
  if (p.year is not null and p.year <> me.year) or (p.section is not null and p.section <> me.section) then
    raise exception 'This poll is only for Year %.', p.year || coalesce(', Section ' || p.section, '');
  end if;
  if p.hostel is not null and p.hostel is distinct from me.hostel then
    raise exception 'This poll is only for Hostel %.', p.hostel;
  end if;
  if not exists (select 1 from public.poll_options o where o.id = p_option and o.poll_id = p_poll) then
    raise exception 'Pick one of the options.';
  end if;
  if p.secret then
    begin
      insert into public.poll_votes (poll_id, user_id, option_id) values (p_poll, auth.uid(), null);
    exception when unique_violation then
      raise exception 'You have already voted. Election votes are final.';
    end;
    insert into public.poll_ballots (poll_id, option_id) values (p_poll, p_option);
  else
    insert into public.poll_votes (poll_id, user_id, option_id) values (p_poll, auth.uid(), p_option)
    on conflict (poll_id, user_id) do update set option_id = excluded.option_id;
  end if;
end;
$$;

create or replace function public.poll_tally(p_polls uuid[])
returns table (poll_id uuid, voters int, counts jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         (select count(*) from public.poll_votes v where v.poll_id = p.id)::int,
         case when p.closes_at <= now()
                or (not p.secret and (public.is_admin()
                    or exists (select 1 from public.poll_votes v where v.poll_id = p.id and v.user_id = auth.uid())))
           then (select coalesce(jsonb_object_agg(o.id::text,
                   case when p.secret then (select count(*) from public.poll_ballots b where b.option_id = o.id)
                        else (select count(*) from public.poll_votes v where v.option_id = o.id) end), '{}'::jsonb)
                 from public.poll_options o where o.poll_id = p.id)
         end
  from public.polls p
  where p.id = any(p_polls) and (public.is_admin() or public.in_audience(p.year, p.section, p.hostel));
$$;
revoke execute on function public.poll_create(text, text, boolean, text, text, timestamptz, text[], text) from public, anon;
grant execute on function public.poll_create(text, text, boolean, text, text, timestamptz, text[], text) to authenticated;

-------------------------------------------------------------------------------
-- Carpool: airport cabs (to or from Calicut airport, with the flight).
-------------------------------------------------------------------------------

alter table public.rides
  add column if not exists trip        text not null default 'city',
  add column if not exists flight      text,
  add column if not exists flight_time text;
alter table public.rides drop constraint if exists rides_trip_check;
alter table public.rides add constraint rides_trip_check check (trip in ('city', 'to_airport', 'from_airport'));
alter table public.rides drop constraint if exists rides_flight_check;
alter table public.rides add constraint rides_flight_check check (flight is null or char_length(flight) <= 20);
alter table public.rides drop constraint if exists rides_flight_time_check;
alter table public.rides add constraint rides_flight_time_check check (flight_time is null or flight_time ~ '^[0-2][0-9]:[0-5][0-9]$');

-------------------------------------------------------------------------------
-- Group chats: one for each section (of a year) and one for each hostel. Only members read and post.
-- Admins never read rooms; they only see messages someone reported (chat_reported()).
-------------------------------------------------------------------------------

create table if not exists public.chat_messages (
  id         bigint generated always as identity primary key,
  room       text not null check (room ~ '^(sec:[12]:[A-Za-z0-9]{1,6}|hostel:[A-Za-z0-9]{1,6})$'),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_room_idx on public.chat_messages (room, created_at desc);

create or replace function public.chat_room_ok(p_room text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_campus_user() and exists (
    select 1 from public.profiles me
    where me.id = auth.uid()
      and (p_room = 'sec:' || me.year || ':' || me.section or (me.hostel is not null and p_room = 'hostel:' || me.hostel))
  );
$$;

create or replace function public.chat_stamp()
returns trigger
language plpgsql
as $$
begin
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists chat_stamp on public.chat_messages;
create trigger chat_stamp before insert on public.chat_messages for each row execute function public.chat_stamp();

alter table public.chat_messages enable row level security;
drop policy if exists "members read chat" on public.chat_messages;
drop policy if exists "members post in chat" on public.chat_messages;
drop policy if exists "authors delete chat" on public.chat_messages;
create policy "members read chat" on public.chat_messages
  for select to authenticated using (public.chat_room_ok(room));
create policy "members post in chat" on public.chat_messages
  for insert to authenticated with check (user_id = auth.uid() and public.chat_room_ok(room));
create policy "authors delete chat" on public.chat_messages
  for delete to authenticated using (user_id = auth.uid());
grant select, insert, delete on public.chat_messages to authenticated;
revoke update on public.chat_messages from authenticated;

create table if not exists public.chat_reports (
  message_id bigint not null references public.chat_messages (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason     text not null default 'other' check (reason in ('abuse', 'spam', 'private', 'other')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.chat_reports enable row level security;
drop policy if exists "members report chat" on public.chat_reports;
drop policy if exists "reporters read their reports" on public.chat_reports;
create policy "members report chat" on public.chat_reports
  for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.chat_messages m where m.id = chat_reports.message_id));
create policy "reporters read their reports" on public.chat_reports
  for select to authenticated using (user_id = auth.uid());
grant select, insert on public.chat_reports to authenticated;

-- Admins: reported messages (with their text and author), and remove or dismiss them.
create or replace function public.chat_reported()
returns table (id bigint, room text, body text, author text, created_at timestamptz, reports int, reasons text[])
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.room, m.body, p.name, m.created_at, count(r.*)::int, array_agg(distinct r.reason)
  from public.chat_reports r
  join public.chat_messages m on m.id = r.message_id
  left join public.profiles p on p.id = m.user_id
  where public.is_admin()
  group by m.id, m.room, m.body, p.name, m.created_at
  order by max(r.created_at) desc;
$$;

create or replace function public.chat_moderate(p_message bigint, p_remove boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only council admins can moderate chats.';
  end if;
  if p_remove then
    delete from public.chat_messages where id = p_message;
  else
    delete from public.chat_reports where message_id = p_message;
  end if;
end;
$$;
revoke execute on function public.chat_room_ok(text) from public, anon;
revoke execute on function public.chat_reported() from public, anon;
revoke execute on function public.chat_moderate(bigint, boolean) from public, anon;
grant execute on function public.chat_room_ok(text) to authenticated;
grant execute on function public.chat_reported() to authenticated;
grant execute on function public.chat_moderate(bigint, boolean) to authenticated;

-------------------------------------------------------------------------------
-- Medicine requests. Private: only the student and the medical desk (people an admin adds) see them.
-------------------------------------------------------------------------------

create table if not exists public.medical_desk (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.medical_desk enable row level security;
drop policy if exists "admins and members read medical_desk" on public.medical_desk;
create policy "admins and members read medical_desk" on public.medical_desk
  for select to authenticated using (public.is_admin() or user_id = auth.uid());
grant select on public.medical_desk to authenticated;

create or replace function public.is_medical()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.medical_desk d where d.user_id = auth.uid());
$$;

create or replace function public.medical_desk_list()
returns table (user_id uuid, email text, name text)
language sql
stable
security definer
set search_path = public
as $$
  select d.user_id, u.email::text, p.name
  from public.medical_desk d join auth.users u on u.id = d.user_id left join public.profiles p on p.id = d.user_id
  where public.is_admin()
  order by d.added_at;
$$;

create or replace function public.medical_desk_set(p_email text, p_add boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
begin
  if not public.is_admin() then
    raise exception 'Only council admins can change the medical desk.';
  end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if uid is null then
    raise exception 'No account with that email yet. Ask them to sign in to the app once, then try again.';
  end if;
  if p_add then
    insert into public.medical_desk (user_id) values (uid) on conflict (user_id) do nothing;
  else
    delete from public.medical_desk where user_id = uid;
  end if;
end;
$$;

create table if not exists public.medicine_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  items      text not null check (char_length(items) between 1 and 300),
  notes      text check (notes is null or char_length(notes) <= 300),
  urgency    text not null default 'today' check (urgency in ('now', 'today', 'tomorrow')),
  deliver_to text check (deliver_to is null or char_length(deliver_to) <= 120),
  phone      text check (phone is null or char_length(phone) <= 20),
  status     text not null default 'requested' check (status in ('requested', 'ready', 'delivered', 'unavailable', 'cancelled')),
  response   text check (response is null or char_length(response) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists medicine_requests_open_idx on public.medicine_requests (status, created_at);

-- Students can only cancel their own request; the desk can only change status and reply.
create or replace function public.medicine_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'requested';
    new.response := null;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;
  if new.user_id is distinct from old.user_id or new.items is distinct from old.items or new.notes is distinct from old.notes
     or new.urgency is distinct from old.urgency or new.deliver_to is distinct from old.deliver_to
     or new.phone is distinct from old.phone or new.created_at is distinct from old.created_at then
    raise exception 'A request can''t be edited. Cancel it and send a new one.';
  end if;
  if not public.is_medical() then
    if new.response is distinct from old.response or not (new.status = 'cancelled' and old.status = 'requested') then
      raise exception 'You can only cancel a request that hasn''t been handled yet.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists medicine_requests_guard on public.medicine_requests;
create trigger medicine_requests_guard before insert or update on public.medicine_requests
  for each row execute function public.medicine_requests_guard();

alter table public.medicine_requests enable row level security;
drop policy if exists "students and desk read medicine_requests" on public.medicine_requests;
drop policy if exists "students request medicines" on public.medicine_requests;
drop policy if exists "students and desk update medicine_requests" on public.medicine_requests;
create policy "students and desk read medicine_requests" on public.medicine_requests
  for select to authenticated using (user_id = auth.uid() or public.is_medical());
create policy "students request medicines" on public.medicine_requests
  for insert to authenticated with check (user_id = auth.uid() and public.is_campus_user());
create policy "students and desk update medicine_requests" on public.medicine_requests
  for update to authenticated using (user_id = auth.uid() or public.is_medical()) with check (user_id = auth.uid() or public.is_medical());
grant select, insert, update on public.medicine_requests to authenticated;
revoke delete on public.medicine_requests from authenticated;

revoke execute on function public.is_medical() from public, anon;
revoke execute on function public.medical_desk_list() from public, anon;
revoke execute on function public.medical_desk_set(text, boolean) from public, anon;
grant execute on function public.is_medical() to authenticated;
grant execute on function public.medical_desk_list() to authenticated;
grant execute on function public.medical_desk_set(text, boolean) to authenticated;

-------------------------------------------------------------------------------
-- Sample posts so Buy & sell, Events and Polls don't look empty. Marked "Sample" in the app;
-- Admin -> Overview -> "Remove sample posts" deletes them all. Added once, posted as the first admin.
-------------------------------------------------------------------------------

alter table public.listings add column if not exists sample boolean not null default false;

create or replace function public.admin_remove_samples()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_l int; n_e int; n_p int;
begin
  if not public.is_admin() then
    raise exception 'Only council admins can remove sample posts.';
  end if;
  with d as (delete from public.listings where sample returning 1) select count(*) into n_l from d;
  with d as (delete from public.events where sample returning 1) select count(*) into n_e from d;
  with d as (delete from public.polls where sample returning 1) select count(*) into n_p from d;
  return jsonb_build_object('listings', n_l, 'events', n_e, 'polls', n_p);
end;
$$;
revoke execute on function public.admin_remove_samples() from public, anon;
grant execute on function public.admin_remove_samples() to authenticated;

do $$
declare
  owner uuid;
  t date := public.ist_today();
  pid uuid;
begin
  if exists (select 1 from public.settings where key = 'samples_loaded') then
    return;
  end if;
  select a.user_id into owner from public.admins a join public.profiles p on p.id = a.user_id order by a.added_at limit 1;
  if owner is null then
    return; -- no admin with a profile yet: run this file again after setting one up
  end if;

  insert into public.listings (user_id, kind, title, price, unit, category, condition, description, sample) values
    (owner, 'sell', 'Kotler & Keller, Marketing Management (16th ed.)', 450, null, 'Books', 'Like new', 'A few highlights in the first four chapters. Pick up from the hostel.', true),
    (owner, 'sell', 'Casio fx-991EX scientific calculator', 900, null, 'Electronics', 'Like new', 'Used for one term, with cover.', true),
    (owner, 'rent', 'Air cooler (Symphony, 30 L)', 800, 'month', 'Appliances', 'Used', 'Works well. Rent for the summer term.', true),
    (owner, 'sell', 'Hero Sprint cycle with lock', 3500, null, 'Cycles', 'Used', 'New tyres last month. Lock and key included.', true),
    (owner, 'sell', 'Electric kettle, 1.5 L', 500, null, 'Appliances', 'Used', null, true),
    (owner, 'sell', 'Study table lamp (LED, 3 brightness levels)', 350, null, 'Furniture & room', 'Like new', null, true),
    (owner, 'want', 'Formal blazer, size 40, for placement week', 1500, null, 'Clothing', 'Any', 'Buy or rent for two weeks.', true),
    (owner, 'sell', 'Mattress topper, single bed', 700, null, 'Furniture & room', 'Used', 'Clean, with cover.', true);

  insert into public.events (user_id, title, organiser, venue, event_date, starts, ends, description, sample) values
    (owner, 'Finance Club: DCF valuation workshop', 'Finance Club', 'CR B2', t + 2, '18:00', '19:30', 'Hands-on session. Bring a laptop with Excel.', true),
    (owner, 'Inter-section cricket: Section A vs Section C', 'Sports Committee', 'Sports complex', t + 3, '16:00', '18:30', null, true),
    (owner, 'Quiz night: business and pop culture', 'Quiz Club', 'MDC', t + 5, '20:00', '21:30', 'Teams of three. Register at the venue.', true),
    (owner, 'Marketing Club guest talk', 'Marketing Club', 'PGP Auditorium', t + 7, '17:30', '18:45', null, true),
    (owner, 'Movie night', 'Cultural Committee', 'Amphitheatre', t + 9, '21:00', '23:00', 'Bring a mat. Snacks on sale.', true);

  insert into public.polls (title, details, secret, closes_at, created_by, sample)
  values ('Which day suits you for the next town hall?', 'Sample poll. The council books the auditorium for the most popular slot.', false, now() + interval '5 days', owner, true)
  returning id into pid;
  insert into public.poll_options (poll_id, label, sort) values (pid, 'Friday 6 pm', 1), (pid, 'Saturday 11 am', 2), (pid, 'Sunday 5 pm', 3);

  insert into public.polls (title, details, secret, closes_at, created_by, sample)
  values ('Should the library stay open till 2 am during exams?', 'Sample poll.', false, now() + interval '7 days', owner, true)
  returning id into pid;
  insert into public.poll_options (poll_id, label, sort) values (pid, 'Yes, every night', 1), (pid, 'Only in exam week', 2), (pid, 'No need', 3);

  insert into public.polls (title, details, secret, closes_at, created_by, sample)
  values ('Sample election: Sports secretary', 'Sample election to try the secret ballot. Results show after it closes.', true, now() + interval '3 days', owner, true)
  returning id into pid;
  insert into public.poll_options (poll_id, label, sort) values (pid, 'Candidate A', 1), (pid, 'Candidate B', 2), (pid, 'NOTA', 3);

  insert into public.settings (key, value) values ('samples_loaded', t::text);
end $$;

-------------------------------------------------------------------------------
-- Live updates
-------------------------------------------------------------------------------

do $$
declare tb text;
begin
  foreach tb in array array['chat_messages', 'medicine_requests']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tb
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tb);
    end if;
  end loop;
end $$;

grant all on public.chat_messages, public.chat_reports, public.medical_desk, public.medicine_requests to service_role;
