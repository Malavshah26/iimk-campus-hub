-- IIMK Campus Hub: starting data. Run after migrations/0001_init.sql.
-- Everything here is SAMPLE data except the hostel list, class timings and national helplines.
-- Council admins can edit all of it later from the app's Admin page.

insert into public.sections (code, label, sort) values
  ('A','Section A',1),('B','Section B',2),('C','Section C',3),('D','Section D',4),
  ('E','Section E',5),('F','Section F',6),('G','Section G',7),('H','Section H',8),
  ('LSM','LSM',9),('FIN','FIN',10)
on conflict (code) do nothing;

-- Machine counts are placeholders (3 each); update them on the Admin page.
insert into public.hostels (code, machines, sort) values
  ('A',3,1),('B',3,2),('C',3,3),('D',3,4),('E',3,5),('F',3,6),('G',3,7),('H',3,8),('J',3,9),
  ('K1',3,10),('K2',3,11),('L1',3,12),('L2',3,13),('P',3,14),('Q',3,15),('M',3,16),('N',3,17)
on conflict (code) do nothing;

-- 75-minute classes from 09:15, 20-minute breaks, lunch 13:40-14:40.
insert into public.class_slots (slot, starts, ends) values
  (1,'09:15','10:30'),(2,'10:50','12:05'),(3,'12:25','13:40'),
  (4,'14:40','15:55'),(5,'16:15','17:30'),(6,'17:50','19:05')
on conflict (slot) do nothing;

insert into public.meal_times (meal, label, starts, ends, sort) values
  ('b','Breakfast','07:30','09:30',1),('l','Lunch','12:30','14:30',2),
  ('d','Dinner','19:30','22:00',4)
on conflict (meal) do nothing;

insert into public.mess_menu (day, meal, items) values
  ('Mon','b','Idli, sambar, coconut chutney, bread omelette'),
  ('Mon','l','Rice, dal tadka, aviyal, cabbage thoran, curd, papad'),
  ('Mon','d','Chapati, paneer butter masala, jeera rice, dal, salad'),
  ('Tue','b','Puttu, kadala curry, banana'),
  ('Tue','l','Matta rice, sambar, beans thoran, egg roast, curd'),
  ('Tue','d','Kerala parotta, chicken curry / veg kurma, rice, rasam'),
  ('Wed','b','Aloo paratha, curd, pickle'),
  ('Wed','l','Rajma chawal, roti, bhindi fry, salad'),
  ('Wed','d','Fried rice, gobi manchurian, chilli chicken / chilli paneer, soup'),
  ('Thu','b','Dosa, sambar, chutney'),
  ('Thu','l','Rice, moru curry, beetroot thoran, egg curry, papad'),
  ('Thu','d','Chapati, chana masala, rice, dal fry, gulab jamun'),
  ('Fri','b','Appam, veg stew / egg curry'),
  ('Fri','l','Chicken biryani / veg biryani, raita, pickle'),
  ('Fri','d','Roti, aloo gobi, rice, sambar, semiya payasam'),
  ('Sat','b','Poha, boiled eggs, fruit'),
  ('Sat','l','Rice, dal, kadhi pakoda, aloo jeera, curd'),
  ('Sat','d','Ghee rice, chicken fry / mushroom masala, raita'),
  ('Sun','b','Chole bhature, lassi'),
  ('Sun','l','Kerala sadya: rice, sambar, aviyal, olan, thoran, payasam'),
  ('Sun','d','Pulao, dal makhani, roti, ice cream')
on conflict (day, meal) do nothing;

-- Bus: the campus shuttle timetable is loaded by migrations/0003_campus_shuttle.sql.
-- Add campus-to-city buses (if any) on the Admin page.

-- National helplines (real). The IIMK office numbers and emails are added by migrations/0005_contact_emails.sql.
insert into public.contacts (grp, name, number, note, email, emergency, sort) values
  ('Emergency helplines (India)','Emergency, all services','112','Police, fire and ambulance',null,true,1),
  ('Emergency helplines (India)','Ambulance','108','Kerala emergency ambulance',null,true,2),
  ('Emergency helplines (India)','Police','100',null,null,true,3),
  ('Emergency helplines (India)','Fire and rescue','101',null,null,true,4),
  ('Emergency helplines (India)','Women helpline','1091',null,null,true,5);
