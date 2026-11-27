# IIMK Campus Hub

One web app for everyday campus life at IIM Kozhikode, run by the Students' Council.

Six main headers, each with its tabs: **Classes** · **Updates** (Notices, Polls, Events) · **Mess & laundry** · **Transport** (Shuttle, Autos & taxis, Carpool) · **Market** (Buy & sell, Lost & found) · **Campus** (Book a room, Complaints, Contacts).

| Tab | What it does |
|---|---|
| **Classes** | Section-wise timetable (A–H, LSM, FIN; Year 1 and 2) or **your own Google Calendar** (secret iCal link, kept on your device), private attendance with course-wise %, “can miss N more” at 75%, and **Compare people** to find common free slots |
| **Notices** | Council announcements, pinned notices as a banner, unread badge |
| **Polls** | Council quick polls (change your vote until it closes) and **elections** with a secret ballot: one final vote each, nobody can link a vote to a person, results only after closing. For everyone, one year or one section |
| **Events** | Anyone can post club events and talks; flags clashes with other events and with *your* classes, shows organisers which sections have class at that time; “I’m going”, Google Calendar / .ics |
| **Mess menu** | Weekly menu with what’s on now; 👍/👎 per meal (totals for all, comments only for the council) |
| **Shuttle** | Campus shuttle (PGP Auditorium, Phase V, C&D Housing, Maingate): pick your stop and destination, next shuttle highlighted; city buses if any |
| **Autos & taxis** | Auto and taxi drivers who serve campus, with Call / WhatsApp / Copy |
| **Laundry** | Live washing-machine status for all 17 hostels, queues, fault reports, “wash done” notification |
| **Carpool** | Post where and when you’re going; see rides going the same way, with Google Maps directions |
| **Book a room** | Discussion rooms and courts: day view, tap a free slot, no double bookings, fair-use limits |
| **Lost & found** | Post lost or found items with photo, category, campus place and time; each gets a code like LF-2611-X4EK. The board suggests lost↔found matches (and notifies you of new ones), people respond ("This is mine", "I found it") or WhatsApp the poster, finders say where the item is now (with them, security, admin office). Mark reunited; report bad posts; council **Desk** to hide reports, hand over desk items and close old posts |
| **Buy & sell** | Sell, rent out or ask for books, cycles, coolers, room items, with photos |
| **Complaints** | Hostel, Wi-Fi, mess… issues with “me too” votes; council sets open / in progress / fixed and replies |
| **Contacts** | Emergency helplines and IIMK offices, tap to call or email |
| **Admin** | Timetable (incl. paste from Excel), mess menu (Excel upload) and feedback, transport (shuttle sheet and auto list paste), contacts, hostels, facilities, class timings, admins, usage & clean-up |

Also: a 4-step intro for new students (profile, calendar sync, notifications), opt-in birthdays shown to your own section on the home screen, works offline for timetable/menu/bus/contacts, installable on phones, in-app notifications (wash done, ride joined, complaint updated, new notice or poll, event and booking reminders, evening attendance reminder), and a daily keep-alive so the free database doesn’t pause.

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
supabase/migrations/0002_campus_life.sql  notices, events, complaints, mess feedback, booking, admin tools
supabase/migrations/0003_campus_shuttle.sql  campus shuttle + timetable w.e.f. 09.06.2026
supabase/menus/                     monthly mess menus (run the latest in the SQL editor)
supabase/seed.sql                   hostels, class timings, sample menu and contacts
supabase/seed_timetable.sql         made-up demo timetable; don't load it for real use
src/pages/                          one file per tab
src/lib/                            Supabase client, auth, data loading, photos, notifications, helpers
api/keepalive.js                    daily Vercel cron that keeps the free database awake
public/sw.js                        offline support and Android notifications
docs/SETUP.md                       step-by-step deployment guide
```

## Before launch

- Replace the **sample** campus phone numbers and check meal timings (Admin page). Don't load the demo timetable; students sync their Google Calendar instead.
- Set the real number of washing machines per hostel (Admin → Hostels) and the real rooms/courts (Admin → Facilities).
- Set up a custom email sender in Supabase (see SETUP step 4) so sign-in emails don't hit the default sending limits.
