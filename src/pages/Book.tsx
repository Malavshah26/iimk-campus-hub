import { useState } from 'react'
import { useMe } from '../lib/auth'
import { explain, supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useLive, useTick } from '../lib/useLive'
import type { Booking, Facility } from '../lib/types'
import { dayLabel, dstr, mins, nowMin, pad, today, waLink } from '../lib/util'
import { Chips, Empty, ErrorNote, Loading } from '../components/Bits'

const hm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
const addDays = (n: number) => dstr(new Date(Date.now() + n * 864e5))

/** Free windows of at least 30 minutes between bookings, from now onwards if it's today. */
function gaps(f: Facility, list: Booking[], day: string): [number, number][] {
  let cur = mins(f.opens)
  if (day === today()) cur = Math.max(cur, Math.ceil(nowMin() / 15) * 15)
  const end = mins(f.closes)
  const out: [number, number][] = []
  for (const b of [...list].sort((a, b) => a.starts.localeCompare(b.starts))) {
    if (mins(b.starts) - cur >= 30) out.push([cur, mins(b.starts)])
    cur = Math.max(cur, mins(b.ends))
  }
  if (end - cur >= 30) out.push([cur, end])
  return out
}

export function Book() {
  useTick(60000)
  const { uid, isAdmin } = useMe()
  const toast = useToast()
  const facilities = useLive<Facility>('facilities', () => supabase.from('facilities').select('*').eq('active', true).order('sort').order('name') as never, ['facilities'])
  const bookings = useLive<Booking>('bookings',
    () => supabase.from('bookings').select('*, who:profiles!bookings_user_id_fkey(name,phone)').gte('day', today()).lte('day', addDays(15)).order('day').order('starts') as never,
    ['bookings'])

  const [day, setDay] = useState(today())
  const [kind, setKind] = useState('All')
  const [form, setForm] = useState({ facility: 0, starts: '', ends: '', purpose: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const kinds = ['All', ...new Set(facilities.data.map(f => f.kind))]
  const shown = facilities.data.filter(f => kind === 'All' || f.kind === kind)
  const fac = facilities.data.find(f => f.id === form.facility)
  const mine = bookings.data.filter(b => b.user_id === uid)
  const dayChips: [string, string][] = Array.from({ length: 7 }, (_, i) => { const d = addDays(i); return [d, dayLabel(d)] })
  if (!dayChips.some(c => c[0] === day)) dayChips.push([day, dayLabel(day)])

  const pick = (f: Facility, start: number, gapEnd: number) => {
    setForm({ ...form, facility: f.id, starts: hm(start), ends: hm(Math.min(gapEnd, start + Math.min(60, f.max_minutes))) })
    setMsg('')
    document.getElementById('bk-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const book = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    if (!fac) return setMsg('Choose what to book.')
    if (!(form.starts < form.ends)) return setMsg('End time must be after the start time.')
    setBusy(true)
    const { error } = await supabase.from('bookings').insert({ facility_id: fac.id, day, starts: form.starts, ends: form.ends, purpose: form.purpose.trim().slice(0, 80) || null })
    setBusy(false)
    if (error) return setMsg(explain(error.message))
    toast(`Booked ${fac.name}, ${dayLabel(day)} ${form.starts}–${form.ends}.`)
    setForm({ ...form, starts: '', ends: '', purpose: '' })
    bookings.reload()
  }

  const cancel = async (b: Booking) => {
    if (!confirm('Cancel this booking?')) return
    const { error } = await supabase.from('bookings').delete().eq('id', b.id)
    if (error) toast(explain(error.message))
    else toast('Booking cancelled.')
    bookings.reload()
  }

  const facName = (id: number) => facilities.data.find(f => f.id === id)?.name || 'Facility'

  return (
    <div className="grid">
      <div>
        <form className="panel stick" id="bk-form" onSubmit={book}>
          <h2>Book a room or court</h2>
          <p className="sub">Tap a free slot on the right, or fill this in.</p>
          <label htmlFor="bk-f">What</label>
          <select id="bk-f" value={form.facility} onChange={e => setForm({ ...form, facility: +e.target.value })}>
            <option value={0}>Choose…</option>
            {facilities.data.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <label htmlFor="bk-d">Day</label>
          <input id="bk-d" type="date" min={today()} max={addDays(14)} value={day} onChange={e => e.target.value && setDay(e.target.value)} />
          <div className="row2">
            <div><label htmlFor="bk-s">From</label><input id="bk-s" type="time" step={900} required value={form.starts} onChange={e => setForm({ ...form, starts: e.target.value })} /></div>
            <div><label htmlFor="bk-e">To</label><input id="bk-e" type="time" step={900} required value={form.ends} onChange={e => setForm({ ...form, ends: e.target.value })} /></div>
          </div>
          <label htmlFor="bk-p">Purpose (optional)</label>
          <input id="bk-p" maxLength={80} value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} placeholder="Group project, practice…" />
          {fac && <p className="note">{fac.name}: {fac.opens}–{fac.closes}, up to {fac.max_minutes} min. Up to 14 days ahead, 4 upcoming bookings each.</p>}
          <button className="btn pri" type="submit" disabled={busy}>{busy ? 'Booking…' : 'Book'}</button>
          {msg && <p className="note err" role="alert">{msg}</p>}
        </form>
        {mine.length > 0 && <div className="panel" style={{ marginTop: 16 }}>
          <h3>Your bookings</h3>
          <div className="list" style={{ marginTop: 10 }}>
            {mine.map(b => <div className="ch mybk" key={b.id}>
              <span><b>{facName(b.facility_id)}</b><br /><span className="meta">{dayLabel(b.day)} · {b.starts}–{b.ends}</span></span>
              <button className="btn" type="button" onClick={() => cancel(b)}>Cancel</button>
            </div>)}
          </div>
        </div>}
      </div>
      <div>
        <ErrorNote error={facilities.error || bookings.error} />
        <Chips label="Day" value={day} onChange={setDay} options={dayChips} />
        {kinds.length > 2 && <Chips label="Type" value={kind} onChange={setKind} options={kinds.map(k => [k, k] as [string, string])} />}
        <div className="list">
          {facilities.loading || bookings.loading ? <Loading /> : shown.length ? shown.map(f => {
            const list = bookings.data.filter(b => b.facility_id === f.id && b.day === day)
            const o = mins(f.opens), span = Math.max(1, mins(f.closes) - o)
            const free = gaps(f, list, day)
            return (
              <div className="card" key={f.id}>
                <div className="ch"><h3>{f.name}</h3><span className="meta" style={{ margin: 0 }}>{f.opens}–{f.closes}</span></div>
                {f.location && <div className="meta">{f.location}</div>}
                <div className="tl" aria-hidden="true">
                  {day === today() && nowMin() > o && <i className="past" style={{ width: Math.min(100, ((nowMin() - o) / span) * 100) + '%' }} />}
                  {list.map(b => <i key={b.id} className={'bk' + (b.user_id === uid ? ' me' : '')} style={{ left: ((mins(b.starts) - o) / span) * 100 + '%', width: ((mins(b.ends) - mins(b.starts)) / span) * 100 + '%' }} />)}
                </div>
                {list.length > 0 && <div className="bks">{list.map(b => {
                  const wa = waLink(b.who?.phone)
                  return <div key={b.id} className="meta">
                    <b>{b.starts}–{b.ends}</b> · {b.user_id === uid ? 'You' : b.who?.name || 'Someone'}{b.purpose ? ` · ${b.purpose}` : ''}
                    {wa && b.user_id !== uid && <> · <a href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a></>}
                    {(b.user_id === uid || isAdmin) && <> · <button className="linkbtn" type="button" onClick={() => cancel(b)}>cancel</button></>}
                  </div>
                })}</div>}
                <div className="chips" style={{ margin: '10px 0 0' }}>
                  {free.length ? free.map(([a, z]) => <button key={a} type="button" className="chip" onClick={() => pick(f, a, z)}>Free {hm(a)}–{hm(z)}</button>)
                    : <span className="meta">Fully booked{day === today() ? ' for the rest of today' : ''}.</span>}
                </div>
              </div>
            )
          }) : <Empty>No facilities to book yet. Council admins can add them in Admin → Facilities.</Empty>}
        </div>
      </div>
    </div>
  )
}
