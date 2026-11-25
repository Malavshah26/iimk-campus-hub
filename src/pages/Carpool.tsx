import { useState } from 'react'
import { useMe } from '../lib/auth'
import { compat, mapsUrl, PLACE, PLACES } from '../lib/places'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useLive, useTick } from '../lib/useLive'
import type { Ride } from '../lib/types'
import { dayLabel, dstr, mins, nowMin, pad, today, waLink } from '../lib/util'
import { Empty, ErrorNote, Loading } from '../components/Bits'

const SELECT = '*, poster:profiles!rides_user_id_fkey(name,phone), ride_members(user_id, member:profiles!ride_members_user_id_fkey(name))'

export function Carpool() {
  useTick()
  const { uid } = useMe()
  const toast = useToast()
  const { data: rides, loading, error, reload } = useLive<Ride>('rides',
    () => supabase.from('rides').select(SELECT).gte('ride_date', dstr(new Date(Date.now() - 864e5))).order('ride_date').order('ride_time') as never,
    ['rides', 'ride_members'])

  const soon = new Date(Date.now() + 3600000)
  const [dest, setDest] = useState('rly')
  const [destText, setDestText] = useState('')
  const [date, setDate] = useState(today())
  const [time, setTime] = useState(`${pad(soon.getHours())}:${pad(Math.floor(soon.getMinutes() / 15) * 15)}`)
  const [seats, setSeats] = useState(4)
  const [flex, setFlex] = useState(60)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const post = async (e: React.FormEvent) => {
    e.preventDefault()
    if (dest === 'other' && !destText.trim()) return
    setBusy(true)
    const { error } = await supabase.from('rides').insert({
      dest, dest_text: dest === 'other' ? destText.trim().slice(0, 80) : null, ride_date: date, ride_time: time, seats, note: note.trim().slice(0, 200) || null,
    })
    setBusy(false)
    if (error) return toast('Couldn’t post: ' + error.message)
    setNote('')
    toast('Ride posted. People heading your way will see it.')
    reload()
  }

  const act = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p
    if (error) toast(error.message)
    reload()
  }

  const t = today()
  const mm = mins(time)
  const upcoming = rides.filter(r => r.ride_date > t || (r.ride_date === t && mins(r.ride_time) >= nowMin() - 30))
  const scored = upcoming.map(r => {
    const c = compat(dest, destText, r.dest, r.dest_text)
    const dt = r.ride_date === date ? Math.abs(mins(r.ride_time) - mm) : 1e9
    return { r, c, dt, match: c.ok && dt <= flex && r.user_id !== uid }
  })
  const matches = scored.filter(x => x.match).sort((a, b) => a.dt / 60 + a.c.extra / 5 - (b.dt / 60 + b.c.extra / 5))
  const others = scored.filter(x => !x.match)

  const card = (x: (typeof scored)[number], isMatch: boolean) => {
    const r = x.r
    const p = PLACE[r.dest]
    const title = p ? p.name : r.dest_text || 'Somewhere'
    const left = Math.max(0, r.seats - 1 - r.ride_members.length)
    const mine = r.user_id === uid
    const inRide = r.ride_members.some(m => m.user_id === uid)
    const url = isMatch && x.c.stops.length ? mapsUrl(x.c.stops) : mapsUrl([p || { q: (r.dest_text || '') + ', Kozhikode' }])
    const wa = waLink(r.poster?.phone)
    return (
      <div className="card" key={r.id}>
        <div className="ch"><h3>{title}</h3>
          {mine ? <span className="tag t-mut">Your ride</span> : isMatch ? <span className="tag t-ok">{x.c.label}</span>
            : left ? <span className="tag t-mut">{left} seat{left > 1 ? 's' : ''} left</span> : <span className="tag t-red">Full</span>}</div>
        <div className="meta">{dayLabel(r.ride_date)} at <b>{r.ride_time}</b>{isMatch && x.dt > 0 ? ` · ${x.dt} min ${mins(r.ride_time) > mm ? 'after' : 'before'} you` : ''} · posted by {r.poster?.name || 'Someone'}</div>
        {r.note && <p>{r.note}</p>}
        {r.ride_members.length > 0 && <div className="meta">Riding: {r.ride_members.map(m => m.member?.name || 'Someone').join(', ')}</div>}
        <div className="acts">
          {!mine && (inRide
            ? <button className="btn" onClick={() => act(supabase.from('ride_members').delete().eq('ride_id', r.id).eq('user_id', uid))}>Leave ride</button>
            : left > 0 && <button className="btn" onClick={() => act(supabase.from('ride_members').insert({ ride_id: r.id }))}>Join ride</button>)}
          <a className="btn" href={url} target="_blank" rel="noopener noreferrer">Route in Google Maps</a>
          {wa && !mine && <a className="btn" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp {r.poster?.name?.split(' ')[0]}</a>}
          {mine && <button className="btn" onClick={() => act(supabase.from('rides').delete().eq('id', r.id))}>Remove</button>}
        </div>
      </div>
    )
  }

  return (
    <div className="grid">
      <form className="panel stick" onSubmit={post}>
        <h2>Where are you headed?</h2>
        <p className="sub">Matches update as you type. Post it so others can find you.</p>
        <label htmlFor="r-dest">Destination</label>
        <select id="r-dest" value={dest} onChange={e => setDest(e.target.value)}>
          {PLACES.map(p => <option key={p.k} value={p.k}>{p.name}</option>)}
          <option value="other">Somewhere else…</option>
        </select>
        {dest === 'other' && <><label htmlFor="r-other">Place name</label><input id="r-other" maxLength={80} value={destText} onChange={e => setDestText(e.target.value)} placeholder="e.g. Mananchira" /></>}
        <div className="row2">
          <div><label htmlFor="r-date">Date</label><input id="r-date" type="date" required value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><label htmlFor="r-time">Leaving at</label><input id="r-time" type="time" required step={300} value={time} onChange={e => setTime(e.target.value)} /></div>
        </div>
        <div className="row2">
          <div><label htmlFor="r-seats">Cab seats</label><select id="r-seats" value={seats} onChange={e => setSeats(+e.target.value)}><option value={3}>3</option><option value={4}>4</option><option value={6}>6</option></select></div>
          <div><label htmlFor="r-flex">Flexible by</label><select id="r-flex" value={flex} onChange={e => setFlex(+e.target.value)}><option value={30}>30 min</option><option value={60}>1 hour</option><option value={120}>2 hours</option></select></div>
        </div>
        <label htmlFor="r-note">Note (optional)</label>
        <input id="r-note" maxLength={200} value={note} onChange={e => setNote(e.target.value)} placeholder="Train at 18:10, big suitcase…" />
        <button className="btn pri" type="submit" disabled={busy}>{busy ? 'Posting…' : 'Post my ride'}</button>
        <p className="note">“On the way” matching uses approximate distances from campus.</p>
      </form>
      <div>
        <ErrorNote error={error} />
        <div className="hd"><h3>Going your way</h3><span className="tag t-ok">{matches.length} match{matches.length === 1 ? '' : 'es'}</span></div>
        <div className="list">{loading ? <Loading /> : matches.length ? matches.map(x => card(x, true)) : <Empty>Nobody is going your way within {flex < 60 ? flex + ' min' : flex / 60 + ' h'} yet. Post your ride and others will find you.</Empty>}</div>
        <div className="gap" />
        <div className="hd"><h3>All upcoming rides</h3></div>
        <div className="list">{loading ? null : others.length ? others.map(x => card(x, false)) : <Empty>No other upcoming rides.</Empty>}</div>
      </div>
    </div>
  )
}
