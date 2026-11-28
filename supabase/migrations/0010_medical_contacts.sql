-- IIMK Campus Hub, update 10: the campus ambulance and dispensary numbers (given by the council).
-- They become the "Call IIMK ambulance" and "Call the dispensary" buttons on Campus -> Medical,
-- and appear under Contacts. Run once in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run twice.

insert into public.contacts (grp, name, number, note, emergency, sort)
select v.grp, v.name, v.number, v.note, v.emergency, v.sort
from (values
  ('Medical', 'IIMK Ambulance', '0495 280 9166', 'Campus ambulance', true, 20),
  ('Medical', 'IIMK Dispensary', '+91 81298 51566', 'Campus dispensary', false, 21)
) as v(grp, name, number, note, emergency, sort)
where not exists (
  select 1 from public.contacts c
  where regexp_replace(c.number, '\D', '', 'g') like '%' || right(regexp_replace(v.number, '\D', '', 'g'), 10)
);
