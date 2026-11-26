import { useCallback, useEffect, useState } from 'react'
import { useMe } from '../lib/auth'
import { useRef_ } from '../lib/ref'
import { explain, supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useLive } from '../lib/useLive'
import type { Facility, MealSummary, Year } from '../lib/types'
import { dayLabel, dstr, today } from '../lib/util'
import { Empty, ErrorNote, Loading } from '../components/Bits'

type Res = PromiseLike<{ error: { message: string } | null }>

/* ---------------------------------------------------------------- Timetable import */

const DAYMAP: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
interface ParsedRow { year: Year; section: string; weekday: number; slot: number; course_code: string; course_name: string; room: string | null }

/** Paste rows from Excel / Google Sheets: Year, Section, Day, Period (or start time), Code, Course, Room. */
export function TimetableImport() {
  const { ref, reload } = useRef_()
  const toast = useToast()
  const [text, setText] = useState('')
  const [replace, setReplace] = useState(true)
  const [busy, setBusy] = useState(false)

  const secs = new Map(ref.sections.map(s => [s.code.toLowerCase(), s.code]))
  const slotByStart = new Map(ref.slots.map(s => [s.starts, s.slot]))
  const rows: ParsedRow[] = []
  const errors: string[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return
    const c = (line.includes('\t') ? line.split('\t') : line.split(',')).map(x => x.trim().replace(/^"|"$/g, ''))
    if (i === 0 && /year/i.test(c[0])) return // header
    const n = i + 1
    const year = c[0]?.replace(/\D/g, '') as Year
    const section = secs.get((c[1] || '').toLowerCase().replace(/^section\s+/, ''))
    const weekday = /^\d$/.test(c[2] || '') ? +c[2] : DAYMAP[(c[2] || '').toLowerCase().slice(0, 3)]
    const p = (c[3] || '').trim()
    const slot = /^\d{1,2}$/.test(p) ? +p : slotByStart.get(p.padStart(5, '0'))
    if (year !== '1' && year !== '2') return errors.push(`Line ${n}: year must be 1 or 2`)
    if (!section) return errors.push(`Line ${n}: unknown section “${c[1]}”`)
    if (!weekday || weekday > 6) return errors.push(`Line ${n}: day “${c[2]}” should be Mon–Sat`)
    if (!slot || !ref.slots.some(s => s.slot === slot)) return errors.push(`Line ${n}: period “${c[3]}” isn’t a class period (use 1–${ref.slots.length} or a start time like 09:15)`)
    if (!c[4] || !c[5]) return errors.push(`Line ${n}: course code and name are needed`)
    rows.push({ year, section, weekday, slot, course_code: c[4].slice(0, 12), course_name: c[5].slice(0, 80), room: (c[6] || '').slice(0, 20) || null })
  })
  const groups = [...new Set(rows.map(r => r.year + '|' + r.section))]

  const run = async () => {
    if (!rows.length) return
    if (replace && !confirm(`Replace the whole timetable for ${groups.length} year/section group(s) with these ${rows.length} classes?`)) return
    setBusy(true)
    let err: string | null = null
    if (replace) for (const g of groups) {
      const [y, s] = g.split('|')
      const { error } = await supabase.from('timetable').delete().match({ year: y, section: s })
      if (error) { err = error.message; break }
    }
    // Last row wins if the paste has the same class twice.
    const uniq = [...new Map(rows.map(r => [`${r.year}${r.section}${r.weekday}-${r.slot}`, r])).values()]
    for (let i = 0; !err && i < uniq.length; i += 500) {
      const { error } = await supabase.from('timetable').upsert(uniq.slice(i, i + 500), { onConflict: 'year,section,weekday,slot' })
      if (error) err = error.message
    }
    setBusy(false)
    toast(err ? 'Error: ' + explain(err) : `Imported ${uniq.length} classes.`)
    if (!err) setText('')
    reload()
  }

  const exportCsv = () => {
    const names = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const q = (s: string) => (/[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
    const lines = ['Year,Section,Day,Period,Code,Course,Room', ...[...ref.timetable]
      .sort((a, b) => a.year.localeCompare(b.year) || a.section.localeCompare(b.section) || a.weekday - b.weekday || a.slot - b.slot)
      .map(r => [r.year, r.section, names[r.weekday], String(r.slot), r.course_code, r.course_name, r.room || ''].map(q).join(','))]
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'timetable.csv'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }

  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <h3>Import from a spreadsheet</h3>
      <p className="note">Copy rows from Excel or Google Sheets and paste here. Columns: <b>Year, Section, Day, Period, Code, Course, Room</b>. Period is 1–{ref.slots.length} or the start time (e.g. 09:15). A header row is fine.</p>
      <div className="acts" style={{ marginTop: 8 }}><button className="btn" type="button" onClick={exportCsv}>Download current timetable (CSV)</button></div>
      <textarea aria-label="Pasted timetable rows" rows={7} style={{ marginTop: 10, fontFamily: 'ui-monospace,monospace', fontSize: 14 }} value={text} onChange={e => setText(e.target.value)}
        placeholder={'1\tA\tMon\t1\tFM-I\tFinancial Management I\tCR1\n1\tA\tMon\t2\tMKT-I\tMarketing Management I\tCR1'} />
      {text.trim() && <p className="note">{rows.length} classes for {groups.length} group(s){errors.length ? `, ${errors.length} line(s) skipped:` : '. Looks good.'}</p>}
      {errors.length > 0 && <ul className="note err">{errors.slice(0, 8).map(e => <li key={e}>{e}</li>)}{errors.length > 8 && <li>…and {errors.length - 8} more</li>}</ul>}
      <label className="ck" style={{ marginTop: 10 }}><input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} /> Replace everything for these sections (untick to only add or update)</label>
      <button className="btn pri inline" style={{ marginTop: 12 }} type="button" disabled={busy || !rows.length} onClick={run}>{busy ? 'Importing…' : `Import ${rows.length || ''} classes`}</button>
    </div>
  )
}

/* ---------------------------------------------------------------- Facilities */

export function FacilitiesAdmin() {
  const toast = useToast()
  const { data, loading, error, reload } = useLive<Facility>('fac-admin', () => supabase.from('facilities').select('*').order('sort').order('name') as never, ['facilities'])
  const [rows, setRows] = useState<Facility[]>([])
  useEffect(() => setRows(data), [data])
  const blank = { name: '', kind: 'Discussion room', location: '', opens: '08:00', closes: '23:00', max_minutes: 120 }
  const [n, setN] = useState(blank)
  const run = async (p: Res, ok: string) => { const { error } = await p; toast(error ? 'Error: ' + explain(error.message) : ok); reload() }
  const upd = (i: number, f: Partial<Facility>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...f } : r)))
  if (loading) return <Loading />
  return (
    <div>
      <ErrorNote error={error} />
      <p className="note">Rooms and courts students can book. Untick “Bookable” to pause one without losing its bookings.</p>
      <div className="list" style={{ marginTop: 10 }}>
        {rows.map((f, i) => <div className="card adm-row" key={f.id}>
          <input aria-label="Name" value={f.name} onChange={e => upd(i, { name: e.target.value })} />
          <input aria-label="Type" value={f.kind} onChange={e => upd(i, { kind: e.target.value })} />
          <input aria-label="Location" value={f.location || ''} onChange={e => upd(i, { location: e.target.value })} placeholder="Location" />
          <input aria-label="Opens" type="time" value={f.opens} onChange={e => upd(i, { opens: e.target.value })} />
          <input aria-label="Closes" type="time" value={f.closes} onChange={e => upd(i, { closes: e.target.value })} />
          <label className="ck">Max <input type="number" min={15} max={480} step={15} aria-label="Max minutes" value={f.max_minutes} onChange={e => upd(i, { max_minutes: +e.target.value })} style={{ width: '5.5em' }} /> min</label>
          <label className="ck"><input type="checkbox" checked={f.active} onChange={e => upd(i, { active: e.target.checked })} /> Bookable</label>
          <div className="acts" style={{ margin: 0 }}>
            <button className="btn" type="button" onClick={() => run(supabase.from('facilities').update({ name: f.name.trim(), kind: f.kind.trim() || 'Room', location: f.location?.trim() || null, opens: f.opens, closes: f.closes, max_minutes: f.max_minutes, active: f.active }).eq('id', f.id), 'Saved.')}>Save</button>
            <button className="btn" type="button" onClick={() => { if (confirm(`Delete ${f.name} and all its bookings?`)) run(supabase.from('facilities').delete().eq('id', f.id), 'Deleted.') }}>Delete</button>
          </div>
        </div>)}
        {!rows.length && <Empty>No facilities yet.</Empty>}
      </div>
      <h3 style={{ marginTop: 20 }}>Add a facility</h3>
      <form className="card adm-row" onSubmit={e => { e.preventDefault(); if (n.name.trim()) run(supabase.from('facilities').insert({ ...n, name: n.name.trim(), location: n.location.trim() || null, sort: rows.length + 1 }), 'Facility added.').then(() => setN(blank)) }}>
        <input aria-label="Name" placeholder="Name" required value={n.name} onChange={e => setN({ ...n, name: e.target.value })} />
        <input aria-label="Type" placeholder="Type" value={n.kind} onChange={e => setN({ ...n, kind: e.target.value })} />
        <input aria-label="Location" placeholder="Location" value={n.location} onChange={e => setN({ ...n, location: e.target.value })} />
        <input aria-label="Opens" type="time" value={n.opens} onChange={e => setN({ ...n, opens: e.target.value })} />
        <input aria-label="Closes" type="time" value={n.closes} onChange={e => setN({ ...n, closes: e.target.value })} />
        <label className="ck">Max <input type="number" min={15} max={480} step={15} aria-label="Max minutes" value={n.max_minutes} onChange={e => setN({ ...n, max_minutes: +e.target.value })} style={{ width: '5.5em' }} /> min</label>
        <button className="btn pri inline" type="submit">Add</button>
      </form>
    </div>
  )
}

/* ---------------------------------------------------------------- Mess feedback */

export function FeedbackAdmin() {
  const { ref } = useRef_()
  const [days, setDays] = useState(14)
  const [rows, setRows] = useState<MealSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setRows(null)
    supabase.rpc('meal_summary', { p_from: dstr(new Date(Date.now() - (days - 1) * 864e5)), p_to: today() }).then(({ data, error }) => {
      setError(error?.message || null)
      setRows((data as MealSummary[] | null) || [])
    })
  }, [days])
  if (!rows) return error ? <ErrorNote error={error} /> : <Loading />
  const label = (m: string) => ref.meals.find(x => x.meal === m)?.label || m
  const pct = (r: { up: number; down: number }) => (r.up + r.down ? Math.round((r.up * 100) / (r.up + r.down)) : 0)
  const byMeal = ref.meals.map(m => {
    const rs = rows.filter(r => r.meal === m.meal)
    return { meal: m.meal, up: rs.reduce((s, r) => s + r.up, 0), down: rs.reduce((s, r) => s + r.down, 0) }
  })
  const dates = [...new Set(rows.map(r => r.day))].sort().reverse()
  return (
    <div>
      <ErrorNote error={error} />
      <div className="sel"><div><label className="lab" htmlFor="fb-d">Period</label>
        <select id="fb-d" value={days} onChange={e => setDays(+e.target.value)}><option value={7}>Last 7 days</option><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option></select></div></div>
      <div className="cols">{byMeal.map(m => <div key={m.meal} className="card">
        <div className="ch"><h3>{label(m.meal)}</h3><b>{m.up + m.down ? pct(m) + '%' : '–'}</b></div>
        <div className="bar"><i className={pct(m) < 60 ? 'low' : ''} style={{ width: pct(m) + '%' }} /></div>
        <div className="meta">👍 {m.up} · 👎 {m.down}</div>
      </div>)}</div>
      <h3 style={{ marginTop: 20 }}>Day by day</h3>
      {dates.length ? <div className="list" style={{ marginTop: 8 }}>{dates.map(d => <div className="card" key={d}>
        <h3>{dayLabel(d)}</h3>
        {rows.filter(r => r.day === d).map(r => <div key={r.meal} className="crow">
          <div className="ch"><span>{label(r.meal)}</span><b>👍 {r.up} · 👎 {r.down} · {pct(r)}%</b></div>
          {r.comments?.length ? <ul className="comments">{r.comments.map((c, i) => <li key={i}>{c}</li>)}</ul> : null}
        </div>)}
      </div>)}</div> : <Empty>No ratings yet. Students rate meals on the Mess menu tab once they’re served.</Empty>}
    </div>
  )
}

/* ---------------------------------------------------------------- Admins */

export function AdminsAdmin() {
  const { uid } = useMe()
  const toast = useToast()
  const [list, setList] = useState<{ user_id: string; email: string; name: string | null; added_at: string }[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const load = useCallback(() => supabase.rpc('admin_list').then(({ data, error }) => { setError(error?.message || null); setList((data as never) || []) }), [])
  useEffect(() => { load() }, [load])
  const run = async (p: Res, ok: string) => { const { error } = await p; toast(error ? explain(error.message) : ok); load() }
  if (!list) return error ? <ErrorNote error={error} /> : <Loading />
  return (
    <div style={{ maxWidth: 620 }}>
      <ErrorNote error={error} />
      <p className="note">Admins can edit timetables and menus, post notices, reply to complaints and remove any post.</p>
      <div className="list" style={{ marginTop: 10 }}>{list.map(a => <div className="card ch" key={a.user_id}>
        <span><b>{a.name || a.email}</b><br /><span className="meta">{a.email}{a.user_id === uid ? ' · you' : ''}</span></span>
        <button className="btn" type="button" onClick={() => { if (confirm(`Remove ${a.email} as admin?`)) run(supabase.rpc('admin_remove', { p_user: a.user_id }), 'Removed.') }}>Remove</button>
      </div>)}</div>
      <form className="sel" style={{ marginTop: 16 }} onSubmit={e => { e.preventDefault(); if (email.trim()) run(supabase.rpc('admin_add', { p_email: email.trim() }), 'Admin added. They’ll see the Admin button after reloading.').then(() => setEmail('')) }}>
        <div style={{ flex: 1 }}><label className="lab" htmlFor="ad-e">Add an admin by email</label>
          <input id="ad-e" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@iimk.ac.in" /></div>
        <button className="btn pri inline" type="submit">Add</button>
      </form>
      <p className="note">They must have signed in to Campus Hub at least once.</p>
    </div>
  )
}

/* ---------------------------------------------------------------- Usage and clean-up */

const MB = (b: number) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB'

export function UsageAdmin() {
  const toast = useToast()
  const [s, setS] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(60)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => supabase.rpc('admin_stats').then(({ data, error }) => { setError(error?.message || null); setS((data as never) || {}) }), [])
  useEffect(() => { load() }, [load])

  const clean = async () => {
    if (!confirm(`Delete returned/sold/fixed posts older than ${days} days, and rides, events and bookings that ended more than ${days} days ago? This can’t be undone.`)) return
    setBusy(true)
    const { data, error } = await supabase.rpc('admin_cleanup', { p_days: days })
    if (error) { setBusy(false); return toast(explain(error.message)) }
    const r = data as Record<string, number> & { photos: string[] }
    let removed = 0
    for (let i = 0; i < r.photos.length; i += 100) {
      const { data: gone } = await supabase.storage.from('photos').remove(r.photos.slice(i, i + 100))
      removed += gone?.length || 0
    }
    setBusy(false)
    const posts = r.lost + r.listings + r.complaints + r.rides + r.events + r.bookings
    toast(`Cleaned up ${posts} old posts and ${removed} photos.`)
    load()
  }

  if (!s) return error ? <ErrorNote error={error} /> : <Loading />
  const meter = (label: string, used: number, cap: number) => {
    const p = Math.min(100, Math.round((used * 100) / cap))
    return <div className="crow"><div className="ch"><span>{label}</span><b>{MB(used)} of {MB(cap)} · {p}%</b></div>
      <div className="bar"><i className={p > 80 ? 'low' : ''} style={{ width: Math.max(p, 1) + '%' }} /></div></div>
  }
  return (
    <div style={{ maxWidth: 680 }}>
      <ErrorNote error={error} />
      <div className="panel">
        <h3>Free plan limits</h3>
        {meter('Database', s.db_bytes || 0, 500 * 1048576)}
        {meter(`Photos (${s.photos || 0} files)`, s.photo_bytes || 0, 1024 * 1048576)}
        <p className="note">Supabase’s free plan allows 500 MB of data and 1 GB of files. Bars turn red above 80%; clean up below, or move to the Pro plan.</p>
      </div>
      <div className="cols" style={{ marginTop: 16, gap: 10 }}>
        {[['People', s.people], ['Rides', s.rides], ['Lost & found', s.lost], ['Buy & sell', s.listings], ['Events', s.events], ['Complaints open', s.open_complaints], ['Bookings', s.bookings], ['Meal ratings', s.ratings]]
          .map(([k, v]) => <div className="card" key={k as string}><div className="meta" style={{ marginTop: 0 }}>{k}</div><div className="big">{v ?? 0}</div></div>)}
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <h3>Clean up old posts</h3>
        <p className="note">Removes lost &amp; found items marked returned, listings marked sold, and complaints marked fixed (with their photos), plus rides, events and bookings that are over. Open posts are never touched.</p>
        <div className="sel" style={{ marginTop: 10 }}>
          <div><label className="lab" htmlFor="cl-d">Older than</label>
            <select id="cl-d" value={days} onChange={e => setDays(+e.target.value)}><option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option><option value={180}>180 days</option></select></div>
          <button className="btn pri inline" type="button" disabled={busy} onClick={clean}>{busy ? 'Cleaning…' : 'Clean up now'}</button>
        </div>
      </div>
    </div>
  )
}
