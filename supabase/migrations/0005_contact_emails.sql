-- IIMK Campus Hub, update 5: emails on contacts, real IIMK office numbers.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run twice.

alter table public.contacts add column if not exists email text;
alter table public.contacts drop constraint if exists contacts_email_check;
alter table public.contacts add constraint contacts_email_check check (
  email is null
  or (char_length(email) <= 300 and email ~ '^[^[:space:]@,]+@[^[:space:]@,]+([[:space:]]*,[[:space:]]*[^[:space:]@,]+@[^[:space:]@,]+)*$')
);

-- Remove the made-up placeholder numbers that seed.sql used to add (exact ones only).
delete from public.contacts
where number in ('90000 10001', '90000 10002', '90000 10003', '90000 10004', '90000 10005', '90000 10006',
                 '90000 10007', '90000 10008', '90000 10009', '90000 10010', '90000 10011', '90000 10012');

-- Real IIMK office contacts (added once; edit them later in Admin -> Contacts).
insert into public.contacts (grp, name, number, note, email, emergency, sort)
select v.grp, v.name, v.number, v.note, v.email, false, v.sort
from (values
  ('IIMK offices', 'Programmes Office', '0495 280 9637', null, 'aaoprogrammes@iimk.ac.in', 10),
  ('IIMK offices', 'Programmes Office', '0495 280 9194', null, 'aoprogrammes@iimk.ac.in', 11),
  ('IIMK offices', 'Admissions Office', '0495 280 9219', null, 'admissions@iimk.ac.in', 12),
  ('IIMK offices', 'Student Affairs & Hostel Office', '0495 280 9258', null, 'stdaffrs@iimk.ac.in, sahstaff1@iimk.ac.in, sahstaff2@iimk.ac.in', 13),
  ('IIMK offices', 'Student Affairs & Hostel Office', '0495 280 9407', 'Second line', null, 14)
) as v(grp, name, number, note, email, sort)
where not exists (
  select 1 from public.contacts c where regexp_replace(c.number, '\D', '', 'g') = regexp_replace(v.number, '\D', '', 'g')
);
