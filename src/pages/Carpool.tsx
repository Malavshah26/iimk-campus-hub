import { useState } from 'react'
import { useMe } from '../lib/auth'
import { compat, mapsUrl, PLACE, PLACES } from '../lib/places'
import { explain, supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useLive, useTick } from '../lib/useLive'
import type { Ride } from '../lib/types'
import { dayLabel, dstr, local, mins, nowMin, pad, saveLocal, today, waLink } from '../lib/util'
import { Chips, Empty, ErrorNote, Loading, Seg } from '../components/Bits'

const SELECT = '*, poster:profiles!rides_user_id_fkey(name,phone), ride_members(user_id, member:profiles!ride_members_user_id_fkey(name,phone))'
type Mode = 'city' | 'airport'
type Dir = 'to_airport' | 'from_airport'
const AIRPORT = 'ccj'
const hm = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return `${pad(Math.floor(x / 60))}:${pad(x % 60)}` }
const isAirport = (r: Ride) => r.trip === 'to_airport' || r.trip === 'from_airport' || r.dest === AIRPORT
const dirOf = (r: Ride): Dir => (r.trip === 'from_airport' ? 'from_airport' : 'to_airport')
const telOf = (p?: string | null) => String(p || '').replace(/[^\d+]/g, '')

export function Carpool() {
  useTick()
  const { uid, profile } = useMe()
  const toast = useToast()
  const { data: rides, loading, error, reload } = useLive<Ride>('rides',
    () => supabase.from('rides').select(SELECT).gte('ride_date', dstr(new Date(Date.now() - 864e5))).order('ride_date').order('ride_time') as never,
    ['rides', 'ride_members'])

  const [mode, setModeRaw] = useState<Mode>(() => local<Mode>('hub.rideMode', 'city'))
  const setMode = (m: Mode) => { setModeRaw(m); saveLocal('hub.rideMode', m) }
  const soon = new Date(Date.now() + 3600000)
  const [dest, setDest] = useState('rly')
  const [destText, setDestText] = useState('')
  const [date, setDate] = useState(today())
  const [time, setTime] = useState(`${pad(soon.getHours())}:${pad(Math.floor(soon.getMinutes() / 15) * 15)}`)
  const [free, setFree] = useState(3)
  const [flex, setFlex] = useState(60)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  // Airport cabs
  const [dir, setDir] = useState<Dir>('to_airport')
  const [flightTime, setFlightTime] = useState('')
  const [flight, setFlight] = useState('')
  const [timeTouched, setTimeTouched] = useState(false)
  // Suggest when to leave campus (3 h before a departure) or be picked up (40 min after landing).
  const suggest = (ft: string, d: Dir) => ft ? hm(mins(ft) + (d === 'to_airport' ? -180 : 40)) : ''
  const onFlightTime = (v: string) => { setFlightTime(v); if (!timeTouched && v) setTime(suggest(v, dir)) }
  const onDir = (d: Dir) => { setDir(d); if (!timeTouched && flightTime) setTime(suggest(flightTime, d)) }

  const post = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'city' && dest === 'other' && !destText.trim()) return
    setBusy(true)
    const row = mode === 'airport'
      ? { dest: AIRPORT, dest_text: null, trip: dir, flight: flight.trim().toUpperCase().slice(0, 20) || null, flight_time: flightTime || null }
      : { dest, dest_text: dest === 'other' ? destText.trim().slice(0, 80) : null }
    // `seats` counts everyone in the cab: you plus the seats you're offering.
    const { error } = await supabase.from('rides').insert({ ...row, ride_date: date, ride_time: time, seats: free + 1, note: note.trim().slice(0, 200) || null })
    setBusy(false)
    if (error) return toast('Couldn’t post: ' + explain(error.message))
    setNote(''); setTimeTouched(false)
    toast(mode === 'airport' ? 'Airport cab posted. People on nearby flights will see it.' : 'Ride posted. People heading your way will see it.')
    reload()
  }

  const act = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p
    if (error) toast(explain(error.message))
    reload()
  }

  const t = today()
  const mm = mins(time)
  const upcoming = rides.filter(r => r.ride_date > t || (r.ride_date === t && mins(r.ride_time) >= nowMin() - 30))
  const pool = upcoming.filter(r => (mode === 'airport') === isAirport(r))
  const scored = pool.map(r => {
    const c = mode === 'airport'
      ? { ok: dirOf(r) === dir, extra: 0, label: dirOf(r) === dir ? 'Same direction' : '', stops: [] }
      : compat(dest, destText, r.dest, r.dest_text)
    const dt = r.ride_date === date ? Math.abs(mins(r.ride_time) - mm) : 1e9
    return { r, c, dt, match: c.ok && dt <= flex && r.user_id !== uid }
  })
  const matches = scored.filter(x => x.match).sort((a, b) => a.dt / 60 + a.c.extra / 5 - (b.dt / 60 + b.c.extra / 5))
  const others = scored.filter(x => !x.match)

  const card = (x: (typeof scored)[number], isMatch: boolean) => {
    const r = x.r
    const air = isAirport(r)
    const p = PLACE[r.dest]
    const title = air ? (dirOf(r) === 'from_airport' ? 'From Calicut Airport' : 'To Calicut Airport') : p ? p.name : r.dest_text || 'Somewhere'
    const left = Math.max(0, r.seats - 1 - r.ride_members.length)
    const mine = r.user_id === uid
    const inRide = r.ride_members.some(m => m.user_id === uid)
    const url = !air && isMatch && x.c.stops.length ? mapsUrl(x.c.stops) : mapsUrl([p || { q: (r.dest_text || '') + ', Kozhikode' }])
    const phone = r.poster?.phone
    const wa = waLink(phone)
    const first = r.poster?.name?.split(' ')[0] || ''
    const when = air
      ? (dirOf(r) === 'from_airport'
        ? <>Pick-up at the airport <b>{r.ride_time}</b>{r.flight_time ? ` · lands ${r.flight_time}` : ''}</>
        : <>Leaves campus <b>{r.ride_time}</b>{r.flight_time ? ` · flight ${r.flight_time}` : ''}</>)
      : <>at <b>{r.ride_time}</b></>
    return (
      <div className="card" key={r.id}>
        <div className="ch"><h3>{air && <span aria-hidden="true">✈ </span>}{title}</h3>
          {mine ? <span className="tag t-mut">Your ride</span> : isMatch ? <span className="tag t-ok">{x.c.label}</span>
            : left ? <span className="tag t-mut">{left} seat{left > 1 ? 's' : ''} left</span> : <span className="tag t-red">Full</span>}</div>
        <div className="meta">{dayLabel(r.ride_date)} · {when}{r.flight ? ` · ${r.flight}` : ''}{isMatch && x.dt > 0 ? ` · ${x.dt} min ${mins(r.ride_time) > mm ? 'after' : 'before'} you` : ''} · posted by {r.poster?.name || 'Someone'}</div>
        {r.note && <p>{r.note}</p>}
        {r.ride_members.length > 0 && <div className="meta">Riding: {r.ride_members.map(m => m.member?.name || 'Someone').join(', ')}</div>}
        <div className="acts">
          {!mine && (inRide
            ? <button className="btn" onClick={() => act(supabase.from('ride_members').delete().eq('ride_id', r.id).eq('user_id', uid))}>Leave ride</button>
            : left > 0 && <button className="btn" onClick={() => act(supabase.from('ride_members').insert({ ride_id: r.id }))}>Join ride</button>)}
          {!mine && phone && <a className="btn" href={'tel:' + telOf(phone)}>Call{first ? ' ' + first : ''}</a>}
          {!mine && wa && <a className="btn" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          {!air && <a className="btn" href={url} target="_blank" rel="noopener noreferrer">Route in Google Maps</a>}
          {mine && <button className="btn" onClick={() => act(supabase.from('rides').delete().eq('id', r.id))}>Remove</button>}
        </div>
        {!mine && !phone && <p className="note" style={{ marginTop: 8 }}>{first || 'The poster'} hasn’t added a phone number. Join the ride and they’ll see you’re in.</p>}
        {mine && r.ride_members.length > 0 && <div className="riders">
          {r.ride_members.map(m => {
            const w = waLink(m.member?.phone)
            return <span key={m.user_id} className="rider"><b>{m.member?.name || 'Someone'}</b>
              {m.member?.phone ? <><a href={'tel:' + telOf(m.member.phone)}>Call</a>{w && <a href={w} target="_blank" rel="noopener noreferrer">WhatsApp</a>}</> : <span className="meta">no number</span>}</span>
          })}
        </div>}
      </div>
    )
  }

  return (
    <div>
      <Chips label="Carpool" value={mode} onChange={setMode} options={[['city', 'Rides around Kozhikode'], ['airport', '✈ Airport cabs']]} />
      <div className="grid">
        <form className="panel stick" onSubmit={post}>
          {mode === 'airport' ? <>
            <h2>Share an airport cab</h2>
            <p className="sub">Calicut International Airport (CCJ). Others on flights around the same time can join.</p>
            <Seg value={dir} onChange={onDir} options={[['to_airport', 'To the airport'], ['from_airport', 'From the airport']]} />
            <div className="row2">
              <div><label htmlFor="r-date">Date</label><input id="r-date" type="date" required min={t} value={date} onChange={e => setDate(e.target.value)} /></div>
              <div><label htmlFor="r-ft">{dir === 'to_airport' ? 'Flight departs' : 'Flight lands'}</label><input id="r-ft" type="time" value={flightTime} onChange={e => onFlightTime(e.target.value)} /></div>
            </div>
            <div className="row2">
              <div><label htmlFor="r-time">{dir === 'to_airport' ? 'Leave campus at' : 'Pick-up at'}</label><input id="r-time" type="time" required step={300} value={time} onChange={e => { setTime(e.target.value); setTimeTouched(true) }} /></div>
              <div><label htmlFor="r-fl">Flight no. (optional)</label><input id="r-fl" maxLength={20} value={flight} onChange={e => setFlight(e.target.value)} placeholder="6E 123" /></div>
            </div>
            {flightTime && !timeTouched && <p className="note" style={{ marginTop: 4 }}>{dir === 'to_airport' ? 'Suggested: 3 hours before the flight.' : 'Suggested: 40 minutes after landing.'} Change it if you like.</p>}
          </> : <>
            <h2>Where are you headed?</h2>
            <p className="sub">Matches update as you type. Post it so others can find you.</p>
            <label htmlFor="r-dest">Destination</label>
            <select id="r-dest" value={dest} onChange={e => setDest(e.target.value)}>
              {PLACES.filter(p => p.k !== AIRPORT).map(p => <option key={p.k} value={p.k}>{p.name}</option>)}
              <option value="other">Somewhere else…</option>
            </select>
            {dest === 'other' && <><label htmlFor="r-other">Place name</label><input id="r-other" maxLength={80} value={destText} onChange={e => setDestText(e.target.value)} placeholder="e.g. Mananchira" /></>}
            <div className="row2">
              <div><label htmlFor="r-date">Date</label><input id="r-date" type="date" required value={date} onChange={e => setDate(e.target.value)} /></div>
              <div><label htmlFor="r-time">Leaving at</label><input id="r-time" type="time" required step={300} value={time} onChange={e => setTime(e.target.value)} /></div>
            </div>
          </>}
          <div className="row2">
            <div><label htmlFor="r-seats">Seats free for others</label><select id="r-seats" value={free} onChange={e => setFree(+e.target.value)}>{[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}</select></div>
            <div><label htmlFor="r-flex">Flexible by</label><select id="r-flex" value={flex} onChange={e => setFlex(+e.target.value)}><option value={30}>30 min</option><option value={60}>1 hour</option><option value={120}>2 hours</option></select></div>
          </div>
          <label htmlFor="r-note">Note (optional)</label>
          <input id="r-note" maxLength={200} value={note} onChange={e => setNote(e.target.value)} placeholder={mode === 'airport' ? 'Two big suitcases…' : 'Train at 18:10, big suitcase…'} />
          <button className="btn pri" type="submit" disabled={busy}>{busy ? 'Posting…' : mode === 'airport' ? 'Post airport cab' : 'Post my ride'}</button>
          {!profile.phone && <p className="note">Add your WhatsApp number in <a href="#profile">Profile</a> so riders can call or message you.</p>}
          {mode === 'city' && <p className="note">“On the way” matching uses approximate distances from campus.</p>}
        </form>
        <div>
          <ErrorNote error={error} />
          <div className="hd"><h3>{mode === 'airport' ? (dir === 'to_airport' ? 'Going to the airport around then' : 'Coming from the airport around then') : 'Going your way'}</h3><span className="tag t-ok">{matches.length} match{matches.length === 1 ? '' : 'es'}</span></div>
          <div className="list">{loading ? <Loading /> : matches.length ? matches.map(x => card(x, true)) : <Empty>{mode === 'airport' ? `No airport cabs within ${flex < 60 ? flex + ' min' : flex / 60 + ' h'} of your time yet. Post yours and others will find it.` : `Nobody is going your way within ${flex < 60 ? flex + ' min' : flex / 60 + ' h'} yet. Post your ride and others will find you.`}</Empty>}</div>
          <div className="gap" />
          <div className="hd"><h3>{mode === 'airport' ? 'All upcoming airport cabs' : 'All upcoming rides'}</h3></div>
          <div className="list">{loading ? null : others.length ? others.map(x => card(x, false)) : <Empty>{mode === 'airport' ? 'No other airport cabs.' : 'No other upcoming rides.'}</Empty>}</div>
        </div>
      </div>
    </div>
  )
}
