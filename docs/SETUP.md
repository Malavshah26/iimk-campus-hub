# Setting up IIMK Campus Hub

About 30 minutes. You need: a GitHub account (this repository), a free [Supabase](https://supabase.com) account and a free [Vercel](https://vercel.com) account. Use a shared Students' Council email for Supabase and Vercel if you can, so the next council can take over.

> **Already set up?** Run any migration you haven't run yet, in order (Supabase → **SQL Editor → New query**, paste the
> whole file, **Run**; if Supabase warns about "destructive operations", click **Run this query**):
> `0002_campus_life.sql` (notices, events, complaints, mess feedback, room booking, admin tools) and
> `0003_campus_shuttle.sql` (campus shuttle timetable), `0004_section_sessions.sql` (section timetables filled from
> students' synced calendars), `0005_contact_emails.sql` (emails on contacts, real IIMK office numbers), `0006_polls_birthdays.sql`
> (polls and elections, opt-in birthdays), `0007_lost_found.sql` (categories, places, matches, responses and reports in
> Lost & found), `0008_launch_overview.sql` (Admin -> Overview: launch checklist and sign-up numbers),
> `0009_audiences_chat_medical.sql` (posts for a batch/section/hostel, group chats, medicine requests, airport cabs,
> sample posts), `0010_medical_contacts.sql` (campus ambulance and dispensary numbers). Until then the new parts say
> they need the database update;
> everything else keeps working.

---

## 1. Create the Supabase project

1. Sign in at supabase.com. If asked, create an **organization** first: name it after the council (e.g. `IIMK Students Council`), type **Educational** or **Personal**, plan **Free**.
2. **New project**. Name: `campus-hub`. Click **Generate a password**, copy it somewhere safe (council password manager). The app itself never needs it.
3. Region: click **Need a specific region?** and pick **South Asia (Mumbai)**. Don't leave it on "Auto".
4. Under **Data access**, tick all three boxes (Data API, *Grant API access to new tables automatically*, *Enable RLS on new tables automatically*). The SQL in step 2 also grants access itself, so the app works even if you missed one.
5. Click **Create new project** and wait a minute or two.

## 2. Create the database

In the Supabase dashboard open **SQL Editor → New query**, then run these files from this repository, **in this order** (open the file, select all, copy, paste the whole file, click **Run**; use a new query for each):

1. `supabase/migrations/0001_init.sql`: tables, access rules, photo storage
2. `supabase/migrations/0002_campus_life.sql`: notices, events, complaints, mess feedback, room booking, admin tools
3. `supabase/migrations/0003_campus_shuttle.sql`: campus shuttle, with the timetable w.e.f. 09.06.2026
4. `supabase/migrations/0004_section_sessions.sql`: section timetables shared from students' synced calendars
5. `supabase/migrations/0005_contact_emails.sql`: emails on contacts, plus the real IIMK office numbers
6. `supabase/migrations/0006_polls_birthdays.sql`: polls and secret-ballot elections, opt-in section birthdays
7. `supabase/migrations/0007_lost_found.sql`: Lost & found with categories, places, reference codes, matches, responses and reports
8. `supabase/migrations/0008_launch_overview.sql`: Admin -> Overview (launch checklist, sign-ups, activity)
9. `supabase/migrations/0009_audiences_chat_medical.sql`: notices/events/polls for a batch, section or hostel; section and hostel chats; medicine requests; airport cabs; sample posts (added once an admin exists; run it again after step 6 on a new setup)
10. `supabase/migrations/0010_medical_contacts.sql`: IIMK ambulance and dispensary numbers (the Medical page's call buttons)
11. `supabase/seed.sql`: hostels, class timings, sample menu and contacts
12. *(Demo only, skip for real use)* `supabase/seed_timetable.sql` fills every section with **made-up** subjects. To remove them later: `delete from public.timetable;`
13. Optional: the latest mess menu from `supabase/menus/` (e.g. `2026-11_mess_menu.sql`)

Each should finish with "Success. No rows returned". If Supabase pops up a "destructive operation" warning, click **Run this query** (the files remove and recreate access rules so they can be re-run). Running a file twice is harmless for 0002–0010 and the seeds.

## 3. Check the email domain

Students must sign in with an address ending in `iimk.ac.in` (subdomains such as `pgp.iimk.ac.in` also work).
If student emails use a different domain, change it in **both** places:

```sql
update public.settings set value = 'your-domain.ac.in' where key = 'allowed_email_domain';
```

and the `VITE_ALLOWED_EMAIL_DOMAIN` setting in step 5.

## 4. Sign-in emails

Students get an email with a sign-in link. This works out of the box for testing. **Before launch**, do both of these:

1. **Connect a real email sender.** Supabase's built-in sender only allows a few emails per hour, which is fine for a handful of testers and not for a batch of students. Under **Authentication → Emails → SMTP Settings**, connect one:
   - the institute's mail server (ask the Computer Centre; mail from an `iimk.ac.in` address is least likely to land in spam), or
   - a free service such as **Brevo** (300 emails/day) or **Resend** (needs a domain you control).
2. **Add a typeable code to the emails.** Supabase only lets you edit email templates *after* SMTP is connected. Then open **Authentication → Emails → Templates** and change **both** templates:
   - **Magic Link** (returning students)
   - **Confirm signup** (a student's very first sign-in)

   Subject: `Your Campus Hub sign-in code`. Body:

   ```html
   <h2>Your Campus Hub sign-in</h2>
   <p>Your code is <b>{{ .Token }}</b></p>
   <p>Or <a href="{{ .ConfirmationURL }}">tap here to sign in</a>.</p>
   ```

   The code matters on campus: some email security scanners "click" links before the student does, which uses the link up ("Email link is invalid or has expired"). A code can't be used up that way. The app's sign-in screen accepts either.

## 5. Put the site online with Vercel

1. In Supabase copy two values:
   - **Project URL**: **Project Settings → Data API** (also under the **Connect** button). Looks like `https://abcdefghijkl.supabase.co`. Copy only that, **without** `/rest/v1` on the end.
   - **Publishable key**: **Project Settings → API Keys**, starts with `sb_publishable_`. (Older projects: the **anon / public** key under *Legacy API keys*.)
   - Never use the **secret** (`sb_secret_…`) or **service_role** key anywhere in the website, Vercel or GitHub.
2. Sign in at vercel.com with GitHub → **Add New → Project** → **Import** `iimk-campus-hub`.
3. Framework preset: **Vite** (detected automatically).
4. Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your publishable key (the name says ANON; that's fine) |
   | `VITE_ALLOWED_EMAIL_DOMAIN` | `iimk.ac.in` |

5. Under **Optional Integrations** Vercel may offer to add **Supabase**: **skip it**. It would create a second, empty database.
6. Click **Deploy**. You'll get an address like `https://iimk-campus-hub.vercel.app`.
7. Back in Supabase, **Authentication → URL Configuration**:
   - **Site URL:** your Vercel address, e.g. `https://iimk-campus-hub.vercel.app` (no `/` at the end)
   - **Redirect URLs → Add URL:** `https://iimk-campus-hub.vercel.app/**` and, for local testing, `http://localhost:5173/**`

   If you skip this, sign-in links send people to `localhost:3000` ("This site can't be reached").

Open the site, sign in with your IIMK email, and fill in your profile. Every push to GitHub's `main` branch redeploys automatically.

## 6. Make yourself admin (once)

After you've signed in once, run this one time in the SQL Editor:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'yourname@iimk.ac.in';
```

Reload the site: an **Admin** button appears in the header. From now on, add or remove other council members in the app: **Admin → Admins** (they need to have signed in once). The app won't let you remove the last admin.

## 7. Replace the sample data

On the **Admin** page, start with **Overview**: its launch checklist shows which of the items below are still sample data, with a button to fix each one, and **Mark done** for things the app can't check itself (like SMTP). Below it: sign-ups per section, how many students used the app this week, and which sections have a shared timetable (totals only; nobody's individual activity is shown).


- **Timetable:** optional. Students can sync their own Google Calendar on the Classes tab, which already has their real sessions. A section timetable is only needed for *Compare people* and for students who don't sync. Easiest is a spreadsheet. Make columns **Year, Section, Day, Period, Code, Course, Room** (Period = 1–6 or a start time like 09:15), copy the rows, paste them into **Import from a spreadsheet**, check the preview, **Import**. *Download current timetable (CSV)* gives you a starting file. You can also edit one section at a time in the grid.
- **Mess menu:** each month, upload the mess committee's Excel file (or paste its cells) in **Admin → Mess menu → Update from the mess committee's Excel**, check the preview, and replace. Photos/PDFs can't be read; old `.xls` files need *Save As .xlsx*. Check **Meal timings** at the bottom too; **remove** deletes a meal (e.g. Snacks) with its menu and ratings.
- **Transport:** the campus shuttle (PGP Auditorium, Phase V Campus, C&D Housing, Maingate) is loaded by 0003. When a new bus sheet comes out, copy its rows from Excel and paste them into **Admin → Transport → Campus shuttle**; it shows a preview and replaces the old timetable.
  **Auto and taxi drivers:** paste the drivers' list (e.g. the WhatsApp message, one "Name. +91…" per line) into **Admin → Transport → Autos & taxis**, check the preview, save. The numbers are kept only in the database, not in this public repository. City buses (if any) go at the bottom.
- **Contacts:** the IIMK office numbers and emails come from migration 0005. Add more (security, medical centre, mess office, computer centre, library) in **Admin → Contacts**; several emails can go in one contact, separated by commas.
- **Polls & elections:** start them from the **Polls** tab (admins see a form). *Quick poll*: one choice each, changeable until it closes, results after voting. *Election*: secret ballot, one final vote each, results only after closing; the database stores that someone voted separately from what they voted, so not even admins can link the two. **Who voted** lists voters (names only) so you can check eligibility. Voting by section relies on the section students set in their profile.
- **Lost & found:** council admins get a **Desk** view (Market → Lost & found → Desk): posts students reported (hide or dismiss), found items handed to security or the admin office (**Handed to owner**), posts open for 30+ days (**Close as unclaimed**) and hidden posts. Old reunited and closed posts are removed by **Usage & clean-up**.
- **Medical:** the IIMK ambulance and dispensary numbers come from 0010 (group `Medical`) and are the Call buttons on **Campus → Medical**; change them in **Admin → Contacts** if they change. Then add who handles medicine requests: **Campus → Medical → Medical desk** (by email). Requests are private to the student and the desk, not all admins.
- **Sample posts:** 0009 adds a few sample Buy & sell listings, events and polls (marked *Sample*) so the app doesn't look empty. Remove them all with one tap in **Admin → Overview** once real posts come in.
- **Chats:** every student is in their section's chat and their hostel's chat. Admins don't read chats; reported messages appear under **Chat → Reported messages** for admins to remove or dismiss.
- **Hostels:** set the real number of washing machines in each hostel.
- **Facilities:** the rooms and courts students can book. The six listed are samples: rename, add, or untick *Bookable*.
- **Class timings:** already set to 09:15 start, 75-minute classes, 20-minute breaks, lunch 13:40–14:40.

## 8. Keeping it running

**The free database pauses after about a week with no use** (e.g. vacations). This repository includes a daily keep-alive: Vercel calls `/api/keepalive` every morning (set in `vercel.json`), which pings the database. It needs no setup; check it's listed under Vercel → Project → **Settings → Cron Jobs**. If the project pauses anyway, open the Supabase dashboard and click **Restore project** (data is kept; don't leave it paused for months).

**Space:** the free plan allows 500 MB of data and 1 GB of photos. **Admin → Usage & clean-up** shows how much is used and removes old finished posts (returned items, sold listings, fixed complaints, past rides/events/bookings) with their photos. Do it at the end of each term.

**Paid plan:** Supabase Pro (about $25/month) never pauses, adds daily backups and much more space. This is what the hosting-fee request in the proposal covers.

## 9. Optional extras

**Your own address (e.g. `hub.iimk.ac.in`):** In Vercel → Project → Settings → Domains, add the domain. Vercel shows a DNS record (usually a CNAME); the Computer Centre adds it. Then update the Site URL and Redirect URLs in Supabase (step 5.7).

**"Continue with Google" button:** only if IIMK email runs on Google Workspace. Create an OAuth client in Google Cloud Console, enable the Google provider in Supabase (Authentication → Sign In / Providers → Google), then add `VITE_ENABLE_GOOGLE_LOGIN=true` in Vercel and redeploy. The database still blocks non-IIMK emails either way.

**Google Calendar sync:** nothing to set up. Students tap *Sync them here* on the Classes tab and paste their class calendar's **Secret address in iCal format** (Google Calendar → Settings → the calendar → Integrate calendar). If that option is missing for @iimk.ac.in accounts, the institute's Google Workspace admin has turned off secret addresses; ask the Computer Centre, or share the class calendar to a personal Gmail and use that account's link.

**Install on phones:** students can open the site in Chrome/Safari and choose **Add to Home screen**. It then opens like an app, works offline for the timetable, menu, bus and contacts, and can show notifications (turn them on in **Profile**).

## Handing over to the next council

- **GitHub:** Settings → Transfer ownership to a council/institute account (history is kept), or add the new team as collaborators.
- **Supabase / Vercel:** invite the new members to the organisation/team, then remove old ones.
- Add the new admins in **Admin → Admins**, then remove the old ones.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Almost there" screen | Environment variables missing in Vercel. Add them (step 5) and **Redeploy**. |
| Sign-in link opens `localhost:3000` / "can't be reached" | Set Site URL and Redirect URLs (step 5.7), then send a new email. |
| "Email link is invalid or has expired" | Each link works once and only the newest email's link works. Send a new one. If fresh links keep failing, a mail scanner is using them up: set up SMTP and the code template (step 4). |
| "Set up custom SMTP to edit the source" | Expected: templates unlock after step 4.1. |
| Sign-in email never arrives / "rate limit" | Check spam; set up SMTP (step 4.1); check Authentication → Logs. |
| "Use your @iimk.ac.in email" | Wrong domain; see step 3. |
| A tab says it "needs the latest database update" | Run `supabase/migrations/0002_campus_life.sql` (step 2). |
| Data loads but posting fails | Make sure step 2 ran fully, in order. |
| Site works but shows no data at all, project dashboard says *Paused* | Click **Restore project** in Supabase (section 8). |
| Photo picker doesn't open inside an app | Open the site in Chrome/Safari, or paste the photo into the paste box. |
| No notifications | Profile → Turn on notifications. They arrive while Campus Hub is open (a background tab or the installed app is enough); there's no push server. |
