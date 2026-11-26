-- IIMK Campus Hub, update 6: council polls and elections, opt-in section birthdays.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run twice.
-- If Supabase warns about "destructive operations", click "Run this query" (it only re-creates access rules).

-------------------------------------------------------------------------------
-- Polls and elections
--   Quick poll: one choice per student, can be changed until it closes; results show after you vote.
--   Election (secret = true): one final vote per student; the database keeps *that* you voted
--   (poll_votes, option_id null) apart from *what* you voted (poll_ballots, no user, no time),
--   so nobody, council included, can link a ballot to a person. Results appear only after closing.
-- Polls are created only through poll_create() and voted on only through poll_vote().
-------------------------------------------------------------------------------

create table if not exists public.polls (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (char_length(title) between 1 and 140),
  details    text check (details is null or char_length(details) <= 1000),
  secret     boolean not null default false,
  year       text check (year is null or year in ('1', '2')),
  section    text references public.sections (code) on update cascade on delete cascade,
  closes_at  timestamptz not null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (section is null or year is not null)
);
create index if not exists polls_created_idx on public.polls (created_at desc);

create table if not exists public.poll_options (
  id      bigint generated always as identity primary key,
  poll_id uuid not null references public.polls (id) on delete cascade,
  label   text not null check (char_length(label) between 1 and 100),
  sort    int not null default 0
);
create index if not exists poll_options_poll_idx on public.poll_options (poll_id);

create table if not exists public.poll_votes (
  poll_id   uuid not null references public.polls (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  option_id bigint references public.poll_options (id) on delete cascade,
  primary key (poll_id, user_id)
);
create index if not exists poll_votes_option_idx on public.poll_votes (option_id);

create table if not exists public.poll_ballots (
  id        uuid primary key default gen_random_uuid(),
  poll_id   uuid not null references public.polls (id) on delete cascade,
  option_id bigint not null references public.poll_options (id) on delete cascade
);
create index if not exists poll_ballots_option_idx on public.poll_ballots (option_id);

-- Who a poll is for: everyone, one year, or one section of one year (as set in each student's profile).
create or replace function public.poll_for_me(p_year text, p_section text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_campus_user() and (
    public.is_admin()
    or p_year is null
    or exists (
      select 1 from public.profiles me
      where me.id = auth.uid() and me.year = p_year and (p_section is null or me.section = p_section)
    )
  );
$$;

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.poll_ballots enable row level security;

drop policy if exists "students read their polls" on public.polls;
drop policy if exists "admins change polls" on public.polls;
drop policy if exists "admins delete polls" on public.polls;
create policy "students read their polls" on public.polls
  for select to authenticated using (public.poll_for_me(year, section));
create policy "admins change polls" on public.polls
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins delete polls" on public.polls
  for delete to authenticated using (public.is_admin());

drop policy if exists "students read options of their polls" on public.poll_options;
create policy "students read options of their polls" on public.poll_options
  for select to authenticated using (exists (select 1 from public.polls p where p.id = poll_options.poll_id));

-- Students see only their own vote rows. No insert/update/delete policies: voting goes through poll_vote().
drop policy if exists "students read their own votes" on public.poll_votes;
create policy "students read their own votes" on public.poll_votes
  for select to authenticated using (user_id = auth.uid());

-- poll_ballots has no policies at all: only the counting functions below read it.
revoke all on public.poll_ballots from anon, authenticated;
revoke insert, update, delete on public.poll_votes from anon, authenticated;
revoke insert, update, delete on public.poll_options from anon, authenticated;
revoke insert on public.polls from anon, authenticated;
grant select on public.poll_votes, public.poll_options to authenticated;
grant select, update, delete on public.polls to authenticated;

-- After creation only the closing time may change ("Close now", or extending it); a poll's question,
-- options, audience and type can't be edited once students may have voted.
create or replace function public.polls_guard()
returns trigger
language plpgsql
as $$
begin
  if new.title is distinct from old.title or new.details is distinct from old.details
     or new.secret is distinct from old.secret or new.year is distinct from old.year
     or new.section is distinct from old.section or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Only the closing time of a poll can be changed. Delete it and start a new one instead.';
  end if;
  if old.closes_at <= now() and new.closes_at is distinct from old.closes_at then
    raise exception 'This poll has closed and its results are out, so it can''t be reopened.';
  end if;
  return new;
end;
$$;
drop trigger if exists polls_guard on public.polls;
create trigger polls_guard before update on public.polls for each row execute function public.polls_guard();

create or replace function public.poll_create(
  p_title text, p_details text, p_secret boolean, p_year text, p_section text,
  p_closes timestamptz, p_options text[]
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
  if p_section is not null and p_year is null then
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

  insert into public.polls (title, details, secret, year, section, closes_at)
  values (trim(p_title), nullif(left(trim(coalesce(p_details, '')), 1000), ''), coalesce(p_secret, false),
          nullif(p_year, ''), nullif(p_section, ''), p_closes)
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

-- Turnout for every poll the caller can see; per-option counts only once they may be shown
-- (election: after closing; quick poll: after you voted, after closing, or for admins).
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
  where p.id = any(p_polls) and public.poll_for_me(p.year, p.section);
$$;

-- Admins only: who has voted (names, never choices), to check an election's voter list.
create or replace function public.poll_voters(p_poll uuid)
returns table (name text, email text, year text, section text)
language sql
stable
security definer
set search_path = public
as $$
  select pr.name, u.email::text, pr.year, pr.section
  from public.poll_votes v
  join auth.users u on u.id = v.user_id
  left join public.profiles pr on pr.id = v.user_id
  where v.poll_id = p_poll and public.is_admin()
  order by pr.section, pr.name;
$$;

revoke execute on function public.poll_create(text, text, boolean, text, text, timestamptz, text[]) from public, anon;
revoke execute on function public.poll_vote(uuid, bigint) from public, anon;
revoke execute on function public.poll_tally(uuid[]) from public, anon;
revoke execute on function public.poll_voters(uuid) from public, anon;
revoke execute on function public.poll_for_me(text, text) from public, anon;
grant execute on function public.poll_create(text, text, boolean, text, text, timestamptz, text[]) to authenticated;
grant execute on function public.poll_vote(uuid, bigint) to authenticated;
grant execute on function public.poll_tally(uuid[]) to authenticated;
grant execute on function public.poll_voters(uuid) to authenticated;
grant execute on function public.poll_for_me(text, text) to authenticated;

-------------------------------------------------------------------------------
-- Birthdays (opt-in): a row exists only if the student added theirs. Day and month only, no year.
-- Classmates in the same year and section can see it; nobody else.
-------------------------------------------------------------------------------

create table if not exists public.birthdays (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  month   int not null check (month between 1 and 12),
  day     int not null check (day between 1 and (case when month = 2 then 29 when month in (4, 6, 9, 11) then 30 else 31 end))
);

create or replace function public.same_section(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_campus_user() and exists (
    select 1 from public.profiles me join public.profiles them on them.year = me.year and them.section = me.section
    where me.id = auth.uid() and them.id = p_user
  );
$$;
revoke execute on function public.same_section(uuid) from public, anon;
grant execute on function public.same_section(uuid) to authenticated;

alter table public.birthdays enable row level security;
drop policy if exists "section mates read birthdays" on public.birthdays;
drop policy if exists "students add their birthday" on public.birthdays;
drop policy if exists "students change their birthday" on public.birthdays;
drop policy if exists "students remove their birthday" on public.birthdays;
create policy "section mates read birthdays" on public.birthdays
  for select to authenticated using (user_id = auth.uid() or public.same_section(user_id));
create policy "students add their birthday" on public.birthdays
  for insert to authenticated with check (user_id = auth.uid() and public.is_campus_user());
create policy "students change their birthday" on public.birthdays
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "students remove their birthday" on public.birthdays
  for delete to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.birthdays to authenticated;

-------------------------------------------------------------------------------
-- Live updates (new polls notify students; your own vote updates your other devices)
-------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['polls', 'poll_votes']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

grant all on public.polls, public.poll_options, public.poll_votes, public.poll_ballots, public.birthdays to service_role;
