// Fetches a student's calendar (.ics) for the Classes tab. Browsers can't read Google's calendar
// files directly (no CORS), so this small function does it.
// - Only signed-in campus accounts may use it (checked with Supabase).
// - Only Google Calendar / Outlook calendar links are fetched, so it can't be used as an open proxy.
// - The secret link arrives in the request body (not the URL), so it doesn't end up in access logs,
//   and nothing is stored.
const HOSTS = ['calendar.google.com', 'outlook.office365.com', 'outlook.live.com', 'outlook.office.com']
const MAX_BYTES = 5 * 1024 * 1024

const json = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request) {
  const sb = (process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const key = process.env.VITE_SUPABASE_ANON_KEY
  const domain = (process.env.VITE_ALLOWED_EMAIL_DOMAIN || 'iimk.ac.in').toLowerCase()
  if (!sb || !key) return json({ error: 'The site isn’t connected to Supabase.' }, 500)

  const auth = request.headers.get('authorization') || ''
  if (!/^Bearer\s+\S+/.test(auth)) return json({ error: 'Sign in first.' }, 401)
  const who = await fetch(`${sb}/auth/v1/user`, { headers: { apikey: key, Authorization: auth } }).catch(() => null)
  if (!who || !who.ok) return json({ error: 'Your sign-in has expired. Reload the page.' }, 401)
  const email = String((await who.json()).email || '').toLowerCase()
  const host = email.split('@')[1] || ''
  if (host !== domain && !host.endsWith('.' + domain)) return json({ error: 'Only campus accounts can sync a calendar.' }, 403)

  let url
  try {
    const raw = String((await request.json()).url || '').trim().replace(/^webcals?:\/\//i, 'https://')
    url = new URL(raw)
  } catch {
    return json({ error: 'That doesn’t look like a link.' }, 400)
  }
  if (url.protocol !== 'https:' || !HOSTS.includes(url.hostname)) {
    return json({ error: 'Paste the “Secret address in iCal format” from Google Calendar. It starts with https://calendar.google.com/calendar/ical/' }, 400)
  }

  let res
  try {
    res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10000) })
  } catch {
    return json({ error: 'Google Calendar didn’t answer. Try again in a minute.' }, 504)
  }
  if (!HOSTS.includes(new URL(res.url || url).hostname)) return json({ error: 'That link redirected somewhere unexpected.' }, 400)
  if (!res.ok) {
    return json({ error: res.status === 404 || res.status === 403 || res.status === 401
      ? 'Google says this calendar link isn’t valid. Copy the secret iCal address again (if you reset it, the old one stops working).'
      : `Google Calendar returned an error (${res.status}).` }, 502)
  }
  const text = await res.text()
  if (text.length > MAX_BYTES) return json({ error: 'That calendar is too large to sync.' }, 413)
  if (!text.trimStart().startsWith('BEGIN:VCALENDAR')) {
    return json({ error: 'That link didn’t return a calendar. Use the secret iCal address, not the public or embed link.' }, 400)
  }
  return new Response(text, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' } })
}
