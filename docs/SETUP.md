# Setting up IIMK Campus Hub

About 30 minutes. You need: a GitHub account (this repository), a free [Supabase](https://supabase.com) account and a free [Vercel](https://vercel.com) account. Use a shared Students' Council email for Supabase and Vercel if you can, so the next council can take over.

---

## 1. Create the Supabase project

1. Sign in at supabase.com → **New project**.
2. Name: `campus-hub`. Set a strong database password and save it somewhere safe (council password manager).
3. Region: **Mumbai (ap-south-1)**, closest to campus.
4. Wait a minute or two for it to finish.

## 2. Create the database

In the Supabase dashboard open **SQL Editor → New query**, then run these three files from this repository, **in this order** (paste the whole file, click **Run**):

1. `supabase/migrations/0001_init.sql`: tables, access rules, photo storage
2. `supabase/seed.sql`: hostels, class timings, sample menu, bus times and contacts
3. `supabase/seed_timetable.sql`: a **sample** timetable for every section

Each should finish with "Success. No rows returned".

## 3. Check the email domain

Students must sign in with an address ending in `iimk.ac.in` (subdomains such as `pgp.iimk.ac.in` also work).
If student emails use a different domain, change it in **both** places:

```sql
update public.settings set value = 'your-domain.ac.in' where key = 'allowed_email_domain';
```

and the `VITE_ALLOWED_EMAIL_DOMAIN` setting in step 5.

## 4. Set up sign-in emails

Students sign in with a code sent to their IIMK email.

1. **Authentication → Sign In / Providers → Email**: make sure Email is enabled.
2. **Authentication → Emails → Templates → Magic Link**: add the code to the email so people can type it (useful inside in-app browsers). For example:

   ```html
   <h2>Your Campus Hub sign-in</h2>
   <p>Your code is <b>{{ .Token }}</b></p>
   <p>Or <a href="{{ .ConfirmationURL }}">tap here to sign in</a>.</p>
   ```
3. **Before launch:** Supabase's built-in email sender is only meant for testing and has low sending limits. Under **Authentication → Emails → SMTP Settings**, connect a real sender (the institute's mail server, or a service such as Resend, Brevo or Amazon SES). Ask the Computer Centre which they prefer.

## 5. Put the site online with Vercel

1. In Supabase open **Project Settings → API** (or **API Keys**) and copy:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon / publishable key** (the public one, **not** the `service_role` / secret key)
2. Sign in at vercel.com with GitHub → **Add New → Project** → import `iimk-campus-hub`.
3. Framework preset: **Vite** (detected automatically).
4. Open **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your anon / publishable key |
   | `VITE_ALLOWED_EMAIL_DOMAIN` | `iimk.ac.in` |

5. Click **Deploy**. You'll get an address like `https://iimk-campus-hub.vercel.app`.
6. Back in Supabase, **Authentication → URL Configuration**:
   - **Site URL:** your Vercel address
   - **Redirect URLs:** add your Vercel address (and `http://localhost:5173` for local testing)

Open the site, sign in with your IIMK email, and fill in your profile.

## 6. Make yourself (and other council members) admin

After you've signed in once, run in the SQL Editor:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'yourname@iimk.ac.in';
```

Reload the site: an **Admin** button appears in the header. Repeat for each council member who should edit timetables and other data. To remove someone: `delete from public.admins where user_id = (select id from auth.users where email = '...');`

## 7. Replace the sample data

On the **Admin** page:

- **Timetable:** pick year and section, fill code/course/room per class, **Save**. (Or ask a developer to load the official timetable via SQL.)
- **Mess menu**, **Bus**, **Contacts:** replace placeholders. Campus numbers starting `90000` are fake.
- **Hostels:** set the real number of washing machines in each hostel.
- **Class timings:** already set to 09:15 start, 75-minute classes, 20-minute breaks, lunch 13:40–14:40.

## 8. Optional extras

**Your own address (e.g. `hub.iimk.ac.in`):** In Vercel → Project → Settings → Domains, add the domain. Vercel shows a DNS record (usually a CNAME); the Computer Centre adds it. Then update the Site URL and Redirect URLs in Supabase (step 5.6).

**"Continue with Google" button:** only if IIMK email runs on Google Workspace. Create an OAuth client in Google Cloud Console, enable the Google provider in Supabase (Authentication → Sign In / Providers → Google), then add `VITE_ENABLE_GOOGLE_LOGIN=true` in Vercel and redeploy. The database still blocks non-IIMK emails either way.

**Keep the free plan from sleeping:** free Supabase projects pause after a week with no activity (e.g. vacations). The paid Pro plan doesn't pause and adds daily backups; this is what the hosting-fee request in the proposal covers.

## Handing over to the next council

- **GitHub:** Settings → Transfer ownership to a council/institute account (history is kept), or add the new team as collaborators.
- **Supabase / Vercel:** invite the new members to the organisation/team, then remove old ones.
- Add new admins (step 6).

## Troubleshooting

| Problem | Fix |
|---|---|
| "Almost there" screen | Environment variables missing in Vercel. Add them (step 5) and redeploy. |
| Sign-in email never arrives | Check spam; set up SMTP (step 4.3); check Authentication → Logs. |
| "Use your @iimk.ac.in email" | Wrong domain; see step 3. |
| Tapping the email link opens a blank page | Add your site address to Redirect URLs (step 5.6), or type the code instead. |
| Data loads but posting fails | Make sure step 2 ran fully, in order. |
| Photo picker doesn't open inside an app | Open the site in Chrome/Safari, or paste the photo into the paste box. |
