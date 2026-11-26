// Vercel runs this once a day (see "crons" in vercel.json). A free Supabase project pauses
// after about a week with no activity, e.g. over vacations; this small request keeps it awake.
// It uses the same public URL and publishable key as the website, so it needs no extra setup.
export async function GET() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return Response.json({ ok: false, reason: 'Supabase environment variables are not set' }, { status: 500 })
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/ping`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    const body = await res.text()
    return Response.json({ ok: res.ok, status: res.status, body: body.slice(0, 200), at: new Date().toISOString() }, { status: res.ok ? 200 : 502 })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 502 })
  }
}
