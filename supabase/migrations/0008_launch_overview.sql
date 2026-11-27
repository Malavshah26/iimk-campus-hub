-- IIMK Campus Hub, update 8: Admin -> Overview (launch checklist, sign-ups and activity).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run twice.
-- If Supabase warns about "destructive operations", click "Run this query" (it only re-creates access rules).
-- Needs 0004 (section timetables) and 0006 (polls) to have been run first.

-------------------------------------------------------------------------------
-- When each student last opened the app (one row per student, the date only).
-- Only the student can read their own row; admins only ever see totals, through admin_overview().
-------------------------------------------------------------------------------

create table if not exists public.last_seen (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  day     date not null default public.ist_today()
);
create index if not exists last_seen_day_idx on public.last_seen (day);

-- The date is always today on campus, whatever the app sends.
create or replace function public.last_seen_today()
returns trigger
language plpgsql
as $$
begin
  new.day := public.ist_today();
  return new;
end;
$$;
drop trigger if exists last_seen_today on public.last_seen;
create trigger last_seen_today before insert or update on public.last_seen
  for each row execute function public.last_seen_today();

alter table public.last_seen enable row level security;
drop policy if exists "students read their own last_seen" on public.last_seen;
drop policy if exists "students add their own last_seen" on public.last_seen;
drop policy if exists "students update their own last_seen" on public.last_seen;
create policy "students read their own last_seen" on public.last_seen
  for select to authenticated using (user_id = auth.uid());
create policy "students add their own last_seen" on public.last_seen
  for insert to authenticated with check (user_id = auth.uid() and public.is_campus_user());
create policy "students update their own last_seen" on public.last_seen
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.last_seen to authenticated;
revoke delete on public.last_seen from authenticated;

-------------------------------------------------------------------------------
-- Launch checklist items an admin ticked as done by hand (things the app can't check itself).
-------------------------------------------------------------------------------

create table if not exists public.admin_checks (
  item    text primary key check (char_length(item) between 1 and 40),
  done_by uuid default auth.uid() references auth.users (id) on delete set null,
  done_at timestamptz not null default now()
);
alter table public.admin_checks enable row level security;
drop policy if exists "admins read admin_checks" on public.admin_checks;
drop policy if exists "admins add admin_checks" on public.admin_checks;
drop policy if exists "admins remove admin_checks" on public.admin_checks;
create policy "admins read admin_checks" on public.admin_checks for select to authenticated using (public.is_admin());
create policy "admins add admin_checks" on public.admin_checks for insert to authenticated with check (public.is_admin());
create policy "admins remove admin_checks" on public.admin_checks for delete to authenticated using (public.is_admin());
grant select, insert, delete on public.admin_checks to authenticated;
grant all on public.last_seen, public.admin_checks to service_role;

-------------------------------------------------------------------------------
-- Totals for Admin -> Overview. Counts only: no names, no individual dates.
-------------------------------------------------------------------------------

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  t date := public.ist_today();
begin
  if not public.is_admin() then
    raise exception 'Only council admins can see the overview.';
  end if;
  return jsonb_build_object(
    'students', (select count(*) from public.profiles),
    'new7',     (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'active1',  (select count(*) from public.last_seen where day = t),
    'active7',  (select count(*) from public.last_seen where day > t - 7),
    'active30', (select count(*) from public.last_seen where day > t - 30),
    'admins',   (select count(*) from public.admins),
    'sections', (select coalesce(jsonb_agg(x order by x.year, x.sort, x.section), '[]'::jsonb) from (
                   select p.year, p.section, coalesce(s.sort, 99) as sort, count(*) as students,
                          count(ls.user_id) filter (where ls.day > t - 7) as active7,
                          exists (select 1 from public.section_sessions ss
                                  where ss.year = p.year and ss.section = p.section and ss.day >= t - 7) as shared
                   from public.profiles p
                   left join public.sections s on s.code = p.section
                   left join public.last_seen ls on ls.user_id = p.id
                   group by p.year, p.section, s.sort) x),
    'notices_live',   (select count(*) from public.notices where expires_on is null or expires_on >= t),
    'notices_pinned', (select count(*) from public.notices where pinned and (expires_on is null or expires_on >= t)),
    'events_soon',    (select count(*) from public.events where event_date between t and t + 14),
    'polls_open',     (select count(*) from public.polls where closes_at > now()),
    'lost_open',      (select count(*) from public.lost_items where status = 'open'),
    'listings_open',  (select count(*) from public.listings where status = 'open'),
    'complaints_open',(select count(*) from public.complaints where status <> 'fixed'),
    'calendars',      (select count(distinct updated_by) from public.section_sessions where day >= t - 7)
  );
end;
$$;
revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
