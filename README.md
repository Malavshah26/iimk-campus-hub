# IIMK Campus Hub

One web app for everyday campus life at IIM Kozhikode, run by the Students' Council.

| Tab | What it does |
|---|---|
| **Classes** | Section-wise timetable (A–H, LSM, FIN; Year 1 and 2), private attendance marking with course-wise %, and **Compare people** to find common free slots |
| **Carpool** | Post where and when you're going; see rides going the same way or along the route, with Google Maps directions |
| **Lost & found** | Post lost or found items with photos; contact the poster on WhatsApp; mark returned |
| **Buy & sell** | Sell, rent out or ask for books, cycles, coolers, room items, with photos |
| **Laundry** | Live washing-machine status for all 17 hostels, queues and fault reports |
| **Bus / Mess menu** | Campus bus timetable and weekly mess menu, with what's next highlighted |
| **Contacts** | Emergency helplines and campus numbers, tap to call |
| **Admin** | Council admins edit timetables, mess menu, bus times, contacts, hostels and class timings |

Only signed-in `@iimk.ac.in` accounts can see or post anything. This is enforced in the database (row-level security), not just in the app.

## Tech

- **Frontend:** React + TypeScript + Vite (a static site; deploy anywhere, e.g. Vercel)
- **Backend:** [Supabase](https://supabase.com): Postgres database, email sign-in, photo storage and live updates
- No server code to run or maintain

## Getting it online

Follow **[docs/SETUP.md](docs/SETUP.md)**. It takes about 30 minutes and needs no coding.

## Run it on your laptop

```bash
npm install
cp .env.example .env.local   # then paste your Supabase URL and anon key
npm run dev
```

## Project layout

```
supabase/migrations/0001_init.sql   tables, access rules, photo storage, live updates
supabase/seed.sql                   hostels, class timings, sample menu/bus/contacts
supabase/seed_timetable.sql         SAMPLE timetable (regenerate: npm run seed:timetable)
src/pages/                          one file per tab
src/lib/                            Supabase client, auth, data loading, photos, helpers
docs/SETUP.md                       step-by-step deployment guide
```

## Before launch

- Replace the **sample** timetable, mess menu, bus times and campus phone numbers (Admin page).
- Set the real number of washing machines per hostel (Admin → Hostels).
- Set up a custom email sender in Supabase (see SETUP step 4) so sign-in emails don't hit the default sending limits.
