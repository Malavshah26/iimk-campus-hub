# Context for Claude Code

This repo is **IIMK Campus Hub**, a student utility web app for IIM Kozhikode, built for the
Junior Students' Council (owner: Malav Shah, GitHub Malavshah26). It started as a single-page
prototype in a claude.ai chat and was rebuilt here as a real app.

## Stack
- React 19 + TypeScript + Vite, static site (deploy on Vercel). Hash routing (`#classes`, `#rides`, ...).
- Supabase: Postgres + row-level security, email OTP sign-in, private `photos` storage bucket, Realtime.
- No custom server. All access control lives in `supabase/migrations/` (0001 base, 0002 campus life). New
  schema changes go in a new numbered file that is safe to re-run (`if not exists`, `drop policy if exists`).
- Server code (Vercel functions): `api/keepalive.js`, a daily cron calling `rpc/ping` so the free project doesn't
  pause; `api/ics.js`, which fetches a student's calendar .ics (campus JWT required, Google/Outlook hosts only).

## Key decisions (keep unless the user changes them)
- Only emails at `iimk.ac.in` (or a subdomain) can use the app. Enforced by `public.is_campus_user()`
  reading `public.settings.allowed_email_domain`, and mirrored client-side by `isAllowedEmail()`.
- Admins are rows in `public.admins`. The first one is added via SQL; after that admins add/remove others in
  Admin → Admins (`admin_add` / `admin_remove` RPCs, can't remove the last admin). Admins edit reference data
  on `#admin`, post notices, set complaint status/replies and can delete any post.
- Reference data (sections, hostels, class_slots, timetable, bus_times, meal_times, mess_menu, contacts)
  is loaded by `RefProvider` (`src/lib/ref.tsx`), cached in localStorage (`hub.ref`) so the app opens offline,
  and refreshed on focus after 10 min. Student posts use `useLive` (`src/lib/useLive.ts`), which refetches on
  Realtime changes. Pages are lazy-loaded in `App.tsx`; keep shared helpers in `src/lib` or `src/components`
  (not in page files) so they don't pull pages into the startup bundle.
- Complaints: students can only open and close their own; status/response changes are admin-only (trigger
  `complaints_guard`). Bookings: overlap, hours, max length, 14-day window and 4-upcoming limit enforced by
  trigger `bookings_check`. Meal ratings: individual votes private; totals via `meal_summary()` (comments
  only returned to admins).
- Campus shuttle: `shuttle_trips` (0003) = one row per trip: `depart`, ordered `stops[]`, optional `at[]` times
  per stop ('' = not given; the app estimates 5 min per hop, `src/lib/shuttle.ts`). '24:00' = the midnight trip.
  Loaded with reference data but optional (a missing table must not break `RefProvider`). Admin → Bus pastes
  the official sheet (Time, From, To, To, Extended) via `parseShuttle()`. Stops seen: PGP Auditorium, Phase V
  Campus, C&D Housing, Maingate. Real timetable w.e.f. 2026-06-09; sample city buses were removed.
- Google Calendar sync (Classes tab): a student pastes their calendar's secret iCal link; it's kept only in
  localStorage (`hub.cal`, `src/lib/gcal.ts`), fetched via `api/ics.js`, parsed by `src/lib/ical.ts` (weekly/daily
  RRULE, EXDATE, RECURRENCE-ID, cancellations; times read as IST). `myClasses()` then drives Classes, the "Next
  class" tile and Events clash checks; sessions map to class periods so attendance keys stay `year+section|date|slot`
  (`|t<HH:MM>` for sessions outside periods). IIMK invites are titled "Session No: 15 - EE(C)-LME-(CR B1)"
  = session 15, course EE, Section C, faculty initials LME, classroom B1 ("CR" = classroom; rooms A1–A4, B1–B4,
  C1–C4, C6, MDC, ...). `src/lib/sessionTitle.ts` parses them so attendance groups by course code (EE, CMA, OS,
  CF, LEPM) and rooms show as "Room B1"; full course names come from the timetable table if an admin has entered
  matching codes. First connect auto-filters to "Session No" when the calendar has other events; Classes offers
  to fix the profile section if it differs from the calendar's section. The owner is in Section C. The owner's classes live in his
  @iimk.ac.in Google account, not the personal Gmail connected to Claude.
- Mess menu: real November 2026 menu in `supabase/menus/2026-11_mess_menu.sql` (no snacks on the official sheet;
  meal timings are still the seed's guesses).
- Notifications (`src/lib/notify.ts`, `src/components/Notifier.tsx`) are local: they fire while the app is
  open. There is no push server. `public/sw.js` is network-first for pages, cache-first for `/assets/`.
- PostgREST embeds use explicit FK hints (e.g. `profiles!rides_user_id_fkey`) because junction tables
  make relationships ambiguous. Keep the hints when adding queries.
- Attendance is private per user (`attendance` table, key = `year+section|YYYY-MM-DD|slot`).
- Photos are compressed client-side to JPEG and stored at `photos/<user_id>/<uuid>.jpg`; shown via signed URLs.
- Visual style: white + council blue (#1f4583 / #2457a6), calm muted states, Sora + Inter. The user
  explicitly asked for "white and blue, less bright sparky colours".

## Campus facts given by the user
- Sections: A–H, LSM, FIN; Year 1 and Year 2.
- Classes are 75 min, start 09:15, 20-min breaks, lunch 13:40–14:40 (6 periods; see `supabase/seed.sql`).
- Hostels: A B C D E F G H J K1 K2 L1 L2 P Q M N (machine counts unknown; placeholder 3 each).

## Sample / placeholder data (must be replaced before launch)
- Timetable (`supabase/seed_timetable.sql`, generated by `scripts/gen-timetable-seed.mjs`)
- Campus and local phone numbers (all `90000 ...` numbers are fake;
  national helplines 112/108/100/101/1091 are real)
- Meal timings (seed guesses) and washing machines per hostel
- Facilities for booking (6 sample rooms/courts added by 0002)

## Status
- Live: GitHub `Malavshah26/iimk-campus-hub` → Vercel, Supabase project in Mumbai (set up 2026-11-26).
- Builds cleanly (`npm run build`). SQL (0001 + 0002, incl. RLS and triggers) tested against PGlite with
  stubbed auth/storage (52 checks). UI clicked through against a mock REST backend, not a live project.
- Sign-in emails use Supabase's default sender: no custom SMTP yet, so templates can't be edited (no code in
  the email) and sending is rate-limited. Needs SMTP before launch (docs/SETUP.md step 4).
- Deployment steps: `docs/SETUP.md`.

## Ideas not built yet
- Real push notifications (needs a server, e.g. Supabase Edge Function + Web Push keys)
- Anonymous complaints (needs a view or RPC that hides user_id; RLS alone can't hide a column)
- PNG app icons for older Android installs (only SVG now)

## Conventions
- Keep components small and in `src/pages/<Tab>.tsx`; shared bits in `src/components/`.
- Run `npm run typecheck` before committing.
- Never commit `.env*` files or the Supabase service_role key.
