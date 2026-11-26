-- IIMK students' mess menu, November 2026 (from the mess committee's sheet; tentative, may change
-- with market availability). Run in Supabase: SQL Editor -> New query -> paste -> Run.
-- Replaces breakfast, lunch and dinner for every day (the official menu has no evening snacks).
-- Next month: upload the committee's Excel file on Admin -> Mess menu instead of SQL.
-- Main dishes are listed first because the app's top bar shows the first item.

insert into public.mess_menu (day, meal, items) values
  -- Breakfast
  ('Mon','b','Idli, Medu Vada, Sambar, Coconut Chutney, Boiled Egg, Chocos, Banana, Boiled Pulses, Bread/Butter/Jam, Tea/Coffee/Milk'),
  ('Tue','b','Pongal, Missi Roti, Aloo Matar Sabzi, Coconut Chutney, Boiled Egg, Cornflakes, Papaya, Boiled Pulses, Bread/Butter/Jam, Tea/Coffee/Milk'),
  ('Wed','b','Masala Dosa, Veg Poha, Sambar, Coriander Chutney, Boiled Egg, Chocos, Watermelon, Boiled Pulses, Bread/Butter/Jam, Tea/Coffee/Milk'),
  ('Thu','b','Kallappam / Dal Pakwan, Oats-Millet Idli / Rava Idli, Vegetable Stew, Coriander Mint Chutney, Boiled Egg, Cornflakes, Mixed Fruits, Boiled Pulses, Bread/Butter/Jam, Tea/Coffee/Milk'),
  ('Fri','b','Aloo Paratha, Veg Wheat Upma, Curd, Coriander Mint Chutney, Boiled Egg, Chocos, Banana, Boiled Pulses, Bread/Butter/Jam, Tea/Coffee/Milk'),
  ('Sat','b','Besan Chilla, Semiya Upma, Sambar, Coriander Mint Chutney, Boiled Egg, Cornflakes, Watermelon, Boiled Pulses, Bread/Butter/Jam, Tea/Coffee/Milk'),
  ('Sun','b','Missal Pav, Ragi Dosa, Coconut Red Chutney, Omelette, Chocos, Papaya, Boiled Pulses, Bread/Butter/Jam, Tea/Coffee/Milk'),
  -- Lunch
  ('Mon','l','Punjabi Chole, Broad Beans, Golden Corn Gobi Dry, Egg Pepper Roast, Ash Gourd Dal, Lemon Rice, Wheat Chapati, Plain Rice, Rasam, Lassi, Pappad, Green Salad'),
  ('Tue','l','Kadhi Pakoda, Gobi Dry, Rajma Masala, Fish Curry, Palak Dal, Curry Leaves Rice, Wheat Chapati, Plain Rice, Sambar, Jeera Buttermilk, Pappad, Veg Salad'),
  ('Wed','l','Veg Kofta Curry, Cabbage Matar Masala Dry, Soya Curry, Kerala Fish Curry, Dal Tadka, Tomato Rice, Moong Dal Halwa / Carrot Halwa, Wheat Chapati, Plain Rice, Rasam, Buttermilk, Pappad, Veg Salad'),
  ('Thu','l','Rajma Raseela, Dum Aloo Banarasi, Besan Gatte, Nellore Fish Curry, Bengal Gram Dal Fry, Coconut Rice, Wheat Chapati, Plain Rice, Sambar, Buttermilk, Pappad, Veg Salad'),
  ('Fri','l','Kootu Curry, Corn Palak, Bhindi Kurkure, Egg Curry, Dal Makhani, Corn Pulao, Wheat Chapati, Plain Rice, Rasam, Buttermilk, Pappad, Veg Salad'),
  ('Sat','l','Paneer Lababdar, Kadai Veg Dry, Yellow Dal, Tamarind Rice, Sweet Boondi, Wheat Chapati, Plain Rice, Sambar, Masala Buttermilk, Pappad, Veg Salad'),
  ('Sun','l','Soya Capsicum, Honey Chilli Potato, Masala Peanut Dry, Egg Bhurji, Arhar Dal, Tawa Pulao, Wheat Chapati, Plain Rice, Rasam, Jeera Buttermilk, Pappad, Veg Salad'),
  -- Dinner (veg / non-veg special first)
  ('Mon','d','Kadai Paneer / Kadai Chicken, Bhindi Fry, Basanti Pulao, Masala Dal, Gulab Jamun, Chapati/Phulka, Curd, Fryums, Veg Salad, Pickle'),
  ('Tue','d','Bisi Bele Bath, Lobia Masala, Raw Banana Fry, Chana Dal, Ice Cream (1 piece), Chapati/Phulka, Boondi Raita, Spicy Boondi, Veg Salad, Pickle'),
  ('Wed','d','Palak Paneer / Pahadi Chicken, Kadala Curry, Lauki Tomato, Veg Pulao, Chana Dal, Chapati/Phulka, Curd, Fryums, Veg Salad, Pickle'),
  ('Thu','d','Shahi Paneer / Chicken Kolhapuri, Matar Masala, Mix Veg Poriyal, Jeera Rice, Tomato Pappu, Fruit Custard, Chapati/Phulka, Jeera Buttermilk, Fryums, Veg Salad, Pickle'),
  ('Fri','d','Hyderabadi Paneer Dum Biryani / Hyderabadi Chicken Dum Biryani, Mirchi ka Salan, Onion Cucumber Raita, Semiya Kheer, Onion Salad, Pickle'),
  ('Sat','d','Peanut Masala / Egg Kolhapuri, Aloo Methi Dry, Chole Masala, Bhagara Rice, Dal Tadka, Chapati/Phulka, Plain Curd, Fryums, Veg Salad, Pickle'),
  ('Sun','d','Paneer Tikka Masala / Chicken Tikka Masala, White Peas Kurma, Cluster Beans Poriyal, Veg Pulao, Dal Maharani, Balushahi, Chapati/Phulka, Buttermilk, Fryums, Veg Salad, Pickle')
on conflict (day, meal) do update set items = excluded.items;
