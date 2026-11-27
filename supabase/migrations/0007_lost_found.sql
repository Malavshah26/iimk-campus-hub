-- IIMK Campus Hub, update 7: a fuller Lost & found (ideas from the council's Lost & Found board).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run twice, keeps existing posts.
-- If Supabase warns about "destructive operations", click "Run this query" (it only re-creates access rules).
--
-- Adds to each post: category, campus area + exact spot, time of day, where a found item is now (finder /
-- security / admin office), an optional extra contact, a reference code (LF-2611-X4EK), "closed, unclaimed"
-- status, hiding by the council. Plus public responses ("This is mine", "I found it", "I saw it") and
-- private reports to the council. Matching lost <-> found posts happens in the app.

-- Reference codes people can quote: LF-<YYMM>-<4 letters/digits, no look-alikes>.
create or replace function public.lf_ref()
returns text
language sql
volatile
as $$
  select 'LF-' || to_char(now() at time zone 'Asia/Kolkata', 'YYMM') || '-' ||
         (select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
          from generate_series(1, 4))
$$;

alter table public.lost_items
  add column if not exists category      text not null default 'other',
  add column if not exists area          text,
  add column if not exists time_of_day   text not null default 'unsure',
  add column if not exists held_at       text,
  add column if not exists contact       text,
  add column if not exists ref           text default public.lf_ref(),
  add column if not exists resolved_at   timestamptz,
  add column if not exists hidden        boolean not null default false,
  add column if not exists hidden_reason text,
  add column if not exists updated_at    timestamptz not null default now();

update public.lost_items set ref = public.lf_ref() where ref is null;
update public.lost_items set held_at = 'finder' where kind = 'found' and held_at is null;
alter table public.lost_items alter column ref set not null;
create unique index if not exists lost_items_ref_idx on public.lost_items (ref);
create index if not exists lost_items_open_idx on public.lost_items (status, kind, category);

alter table public.lost_items drop constraint if exists lost_items_status_check;
alter table public.lost_items add constraint lost_items_status_check check (status in ('open', 'done', 'closed'));
alter table public.lost_items drop constraint if exists lost_items_description_check;
alter table public.lost_items add constraint lost_items_description_check check (description is null or char_length(description) <= 600);
alter table public.lost_items drop constraint if exists lost_items_category_check;
alter table public.lost_items add constraint lost_items_category_check check (category in (
  'electronics', 'idcard', 'wallet', 'keys', 'bag', 'books', 'clothing', 'bottle', 'accessories', 'umbrella', 'sports', 'other'));
alter table public.lost_items drop constraint if exists lost_items_area_check;
alter table public.lost_items add constraint lost_items_area_check check (area is null or area in (
  'classrooms', 'library', 'faculty', 'admin', 'mess', 'hostel', 'canteen', 'sports', 'pool', 'auditorium', 'amphi',
  'mdc', 'health', 'gate', 'bus', 'phase5', 'housing', 'town', 'city', 'other'));
alter table public.lost_items drop constraint if exists lost_items_time_check;
alter table public.lost_items add constraint lost_items_time_check check (time_of_day in ('morning', 'afternoon', 'evening', 'night', 'unsure'));
alter table public.lost_items drop constraint if exists lost_items_held_check;
alter table public.lost_items add constraint lost_items_held_check check (held_at is null or held_at in ('finder', 'security', 'admin'));
alter table public.lost_items drop constraint if exists lost_items_contact_check;
alter table public.lost_items add constraint lost_items_contact_check check (contact is null or char_length(contact) <= 120);
alter table public.lost_items drop constraint if exists lost_items_hidden_reason_check;
alter table public.lost_items add constraint lost_items_hidden_reason_check check (hidden_reason is null or char_length(hidden_reason) <= 120);

-- Keeps posts honest: a fresh reference code on every new post, status/hiding only changed the right way,
-- the poster and code never change, no dates in the future, "where is it now" only on found items.
create or replace function public.lost_items_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.ref := public.lf_ref();
    while exists (select 1 from public.lost_items where ref = new.ref) loop
      new.ref := public.lf_ref();
    end loop;
    new.status := 'open';
    new.resolved_at := null;
    new.hidden := false;
    new.hidden_reason := null;
    new.created_at := now();
    new.updated_at := now();
  else
    new.ref := old.ref;
    new.user_id := old.user_id;
    new.created_at := old.created_at;
    if not public.is_admin() then
      new.hidden := old.hidden;
      new.hidden_reason := old.hidden_reason;
    end if;
    if new.status = 'done' and old.status is distinct from 'done' then
      new.resolved_at := now();
    elsif new.status <> 'done' then
      new.resolved_at := null;
    else
      new.resolved_at := old.resolved_at;
    end if;
    new.updated_at := now();
  end if;
  if new.kind = 'lost' then
    new.held_at := null;
  elsif new.held_at is null then
    new.held_at := 'finder';
  end if;
  if new.item_date > public.ist_today() and (tg_op = 'INSERT' or new.item_date is distinct from old.item_date) then
    raise exception 'The date can''t be in the future.';
  end if;
  return new;
end;
$$;
drop trigger if exists lost_items_guard on public.lost_items;
create trigger lost_items_guard before insert or update on public.lost_items
  for each row execute function public.lost_items_guard();

-- Hidden posts disappear for everyone except their poster and the council.
drop policy if exists "campus users read lost_items" on public.lost_items;
create policy "campus users read lost_items" on public.lost_items
  for select to authenticated
  using (public.is_campus_user() and (not hidden or user_id = auth.uid() or public.is_admin()));

-------------------------------------------------------------------------------
-- Responses on a post (public to campus). Deleted with the post.
--   found post: claim ("This is mine") | note       lost post: found ("I found it") | seen | note
-------------------------------------------------------------------------------

create table if not exists public.lost_replies (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.lost_items (id) on delete cascade,
  item_owner uuid references public.profiles (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind       text not null default 'note' check (kind in ('claim', 'found', 'seen', 'note')),
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists lost_replies_item_idx on public.lost_replies (item_id, created_at);
create index if not exists lost_replies_owner_idx on public.lost_replies (item_owner);

create or replace function public.lost_replies_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  it public.lost_items;
begin
  select * into it from public.lost_items where id = new.item_id;
  if not found or (it.hidden and it.user_id <> auth.uid() and not public.is_admin()) then
    raise exception 'This post is no longer on the board.';
  end if;
  if (it.kind = 'found' and new.kind not in ('claim', 'note')) or (it.kind = 'lost' and new.kind not in ('found', 'seen', 'note')) then
    new.kind := 'note';
  end if;
  new.item_owner := it.user_id;
  new.created_at := now();
  return new;
end;
$$;
drop trigger if exists lost_replies_fill on public.lost_replies;
create trigger lost_replies_fill before insert on public.lost_replies
  for each row execute function public.lost_replies_fill();

alter table public.lost_replies enable row level security;
drop policy if exists "campus users read lost_replies" on public.lost_replies;
drop policy if exists "users add their own lost_replies" on public.lost_replies;
drop policy if exists "owners or admins delete lost_replies" on public.lost_replies;
create policy "campus users read lost_replies" on public.lost_replies
  for select to authenticated
  using (public.is_campus_user() and exists (select 1 from public.lost_items i where i.id = lost_replies.item_id));
create policy "users add their own lost_replies" on public.lost_replies
  for insert to authenticated with check (user_id = auth.uid() and public.is_campus_user());
create policy "owners or admins delete lost_replies" on public.lost_replies
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-------------------------------------------------------------------------------
-- Reports to the council (only the reporter and admins can see them).
-------------------------------------------------------------------------------

create table if not exists public.lost_flags (
  item_id    uuid not null references public.lost_items (id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason     text not null check (reason in ('spam', 'wrong', 'personal', 'done')),
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

alter table public.lost_flags enable row level security;
drop policy if exists "reporters and admins read lost_flags" on public.lost_flags;
drop policy if exists "users add their own lost_flags" on public.lost_flags;
drop policy if exists "users change their own lost_flags" on public.lost_flags;
drop policy if exists "reporters or admins delete lost_flags" on public.lost_flags;
create policy "reporters and admins read lost_flags" on public.lost_flags
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "users add their own lost_flags" on public.lost_flags
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_campus_user() and exists (select 1 from public.lost_items i where i.id = lost_flags.item_id));
create policy "users change their own lost_flags" on public.lost_flags
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "reporters or admins delete lost_flags" on public.lost_flags
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

grant select, insert, delete on public.lost_replies to authenticated;
grant select, insert, update, delete on public.lost_flags to authenticated;
grant all on public.lost_replies, public.lost_flags to service_role;
revoke execute on function public.lf_ref() from public, anon;
grant execute on function public.lf_ref() to authenticated;

-------------------------------------------------------------------------------
-- Clean-up (Admin -> Usage & clean-up) now also removes old "closed, unclaimed" lost & found posts.
-------------------------------------------------------------------------------

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

  -- Reunited: by when it was reunited (older posts: when posted). Closed, unclaimed: by when it was closed.
  with d as (delete from public.lost_items
             where (status = 'done' and coalesce(resolved_at, created_at) < cutoff) or (status = 'closed' and updated_at < cutoff)
             returning photo_path)
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
revoke execute on function public.admin_cleanup(int) from public, anon;
grant execute on function public.admin_cleanup(int) to authenticated;

-------------------------------------------------------------------------------
-- Live updates: responses appear as they're posted; the poster gets a notification.
-------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['lost_replies', 'lost_flags']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
