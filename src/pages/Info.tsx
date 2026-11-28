import { useState } from 'react'
import { hashId, useFocusItem } from '../lib/focus'
import { useRef_ } from '../lib/ref'
import { useTick } from '../lib/useLive'
import { DAYS, inFmt, isWeekend, local, mins, norm, nowMin, saveLocal } from '../lib/util'
import { HOP_MIN, legsFrom, runsToday, showTime, stopsOf, timeAt } from '../lib/shuttle'
import type { ShuttleTrip } from '../lib/types'
import { Chips, Empty } from '../components/Bits'
import { MealVote, useMealFeedback } from '../components/MealFeedback'
import { AUTO_GROUP, waMobile } from '../lib/autos'
import type { Contact } from '../lib/types'

/** Transport → Shuttle: the campus shuttle, then city buses if the council has added any. */
export function Bus() {
  const { ref } = useRef_()
  if (!ref.shuttle.length && !ref.bus.length) return <section><div className="hd"><h2>Shuttle</h2></div><Empty>No bus timings yet. Council admins add them in Admin → Transport.</Empty></section>
  return <section>{ref.shuttle.length > 0 && <Shuttle />}{ref.bus.length > 0 && <CityBus />}</section>
}

/** Transport → Autos & taxis. */
export function Autos() {
  const { ref } = useRef_()
  const list = ref.contacts.filter(c => c.grp === AUTO_GROUP)
  const [copied, setCopied] = useState('')
  useFocusItem(true)
  return (
    <section>
      <div className="hd"><div><h2>Autos & taxis</h2><p className="sub">Drivers who take students to and from campus. Call or WhatsApp them; agree the fare before you set off.</p></div></div>
      {list.length ? <div className="ctc">
        {list.map(c => <PhoneCard key={c.id} c={c} copied={copied} onCopy={n => { setCopied(n); setTimeout(() => setCopied(''), 1500) }} wa />)}
      </div> : <Empty>No auto or taxi numbers yet. Council admins add them in Admin → Transport.</Empty>}
      <p className="note">Going the same way as others? Post it in <a href="#rides">Carpool</a> and split the fare.</p>
    </section>
  )
}

function PhoneCard({ c, copied, onCopy, wa }: { c: Contact; copied: string; onCopy: (n: string) => void; wa?: boolean }) {
  const w = wa ? waMobile(c.number) : ''
  return <div id={'it-' + c.id} className={'crd' + (c.emergency ? ' em' : '') + (w ? ' stack' : '')}>
    <div><h4>{c.name}</h4><span className="num">{c.number}</span>{c.note && <span className="meta">{c.note}</span>}
      {emails(c.email).map(e => <a key={e} className="mail" href={'mailto:' + e}>{e}</a>)}</div>
    <div className="acts">
      <a className="btn" href={'tel:' + c.number.replace(/[^\d+]/g, '')}>Call</a>
      {w && <a className="btn" href={w} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
      <button className="btn" type="button" onClick={() => navigator.clipboard?.writeText(c.number).then(() => onCopy(c.number), () => {})}>{copied === c.number ? 'Copied' : 'Copy'}</button>
    </div>
  </div>
}

function Shuttle() {
  useTick()
  const { ref } = useRef_()
  const line = lineOf(ref.shuttle)
  const [from, setFromRaw] = useState(() => { const s = local('hub.shFrom', ''); return line.includes(s) ? s : '' })
  const [to, setToRaw] = useState(() => { const s = local('hub.shTo', ''); return line.includes(s) ? s : '' })
  const setFrom = (s: string) => { setFromRaw(s); saveLocal('hub.shFrom', s); if (s) saveLocal('hub.stop', s); if (s && s === to) setTo('') }
  const setTo = (s: string) => { setToRaw(s); saveLocal('hub.shTo', s) }
  const swap = () => { const f = from; setFrom(to); setTo(f) }
  const nm = nowMin()
  const todays = ref.shuttle.filter(t => runsToday(t))
  // Trips that go from `from` to `to` (either can be "anywhere"), with the time at the boarding stop.
  type L = { trip: ShuttleTrip; i: number; at: string; est: boolean }
  const legs: L[] = (from
    ? legsFrom(todays, from, to).map(l => ({ trip: l.trip, i: l.i, at: l.at, est: l.est }))
    : todays.flatMap(t => {
      const i = to ? t.stops.findIndex((_, k) => k < t.stops.length - 1 && t.stops.slice(k + 1).includes(to)) : 0
      if (i < 0) return []
      const x = timeAt(t, i)
      return [{ trip: t, i, at: x.t, est: x.est }]
    })).sort((a, b) => mins(a.at) - mins(b.at))
  const ahead = legs.filter(l => mins(l.at) >= nm)
  const next = ahead[0]
  const serves = (t: ShuttleTrip) => {
    if (!from && !to) return true
    const i = from ? t.stops.findIndex((s, k) => s === from && k < t.stops.length - 1) : 0
    return i >= 0 && (!to || t.stops.slice(i + 1).includes(to))
  }
  const dirs = directions(ref.shuttle, line)

  return (
    <div className="shuttle2">
      <div className="hd"><div><h2>Campus shuttle</h2><p className="sub">Times marked ≈ are estimates (about {HOP_MIN} min between stops).</p></div></div>
      <div className="shpick">
        <div><label className="lab" htmlFor="sh-from">From</label>
          <select id="sh-from" value={from} onChange={e => setFrom(e.target.value)}><option value="">Anywhere</option>{line.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        <button type="button" className="btn swap" aria-label="Swap from and to" onClick={swap}>⇄</button>
        <div><label className="lab" htmlFor="sh-to">To</label>
          <select id="sh-to" value={to} onChange={e => setTo(e.target.value)}><option value="">Anywhere</option>{line.filter(s => s !== from).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
      </div>

      {next ? <div className="shnext">
        <div className="when"><span>Next shuttle{from ? ` from ${short(from)}` : ''}</span><b>{next.est ? '≈' : ''}{showTime(next.at)}</b><span>{mins(next.at) - nm <= 0 ? 'leaving now' : 'in ' + inFmt(mins(next.at) - nm)}</span></div>
        <ol className="stopline">
          {next.trip.stops.map((s, k) => {
            const tk = timeAt(next.trip, k)
            const passed = k < next.i
            return <li key={k} className={(k === next.i ? 'here' : '') + (passed ? ' passed' : '') + (to && s === to ? ' dest' : '')}>
              <span className="dot" /><b>{short(s)}</b><small>{tk.est ? '≈' : ''}{showTime(tk.t)}</small></li>
          })}
        </ol>
        {ahead.length > 1 && <div className="later"><span className="meta">Then</span>{ahead.slice(1, 7).map(l => <span key={l.trip.id + l.at} className="tag t-mut">{l.est ? '≈' : ''}{showTime(l.at)}</span>)}</div>}
      </div> : <div className="empty">{legs.length ? 'No more shuttles this way today.' : 'No shuttle goes that way.'}</div>}

      <h3 style={{ margin: '22px 0 4px' }}>{from || to ? `Timetable: ${from ? short(from) : 'anywhere'} → ${to ? short(to) : 'anywhere'}` : 'Full timetable'}</h3>
      <p className="note" style={{ margin: '0 0 10px' }}>{from || to ? <>Only shuttles that go this way. <button className="linkbtn" type="button" onClick={() => { setFrom(''); setTo('') }}>Show all shuttles</button></> : 'Every shuttle, in both directions. Pick From / To above to narrow it down.'}</p>
      {dirs.map(d => {
        const rows = d.trips.filter(serves)
        if (!rows.length) return null
        const nextRow = rows.find(t => runsToday(t) && mins(timeAt(t, Math.max(0, from ? t.stops.indexOf(from) : 0)).t) >= nm)
        return <div key={d.title} className="shdir">
          <h4>{d.title}</h4>
          <div className="scroll"><table className="shgrid">
            <thead><tr>{d.cols.map(s => <th key={s} className={s === from ? 'from' : s === to ? 'to' : ''}>{short(s)}</th>)}<th /></tr></thead>
            <tbody>{rows.map(t => {
              const lastT = mins(timeAt(t, t.stops.length - 1).t)
              const past = runsToday(t) && lastT < nm
              return <tr key={t.id} className={(t === nextRow ? 'next' : '') + (past ? ' past' : '')}>
                {d.cols.map(s => {
                  const k = t.stops.indexOf(s)
                  if (k < 0) return <td key={s} className="none">–</td>
                  const tk = timeAt(t, k)
                  return <td key={s} className={(k === 0 ? 'start ' : '') + (s === from ? 'from' : s === to ? 'to' : '')}>{tk.est ? <span className="est">≈</span> : null}{showTime(tk.t)}</td>
                })}
                <td className="nt">{t === nextRow ? <span className="tag t-ok">Next</span> : null}{t.note ? <small>{t.note}</small> : null}{t.days !== 'all' ? <small>{t.days === 'weekday' ? 'Mon–Fri' : 'Sat–Sun'}</small> : null}</td>
              </tr>
            })}</tbody>
          </table></div>
        </div>
      })}
    </div>
  )
}

/** Stop names short enough for table headers. */
const SHORT: Record<string, string> = { 'PGP Auditorium': 'PGP', 'Phase V Campus': 'Phase V', 'C&D Housing': 'C&D', Maingate: 'Main gate' }
const short = (s: string) => SHORT[s] || (s.length > 12 ? s.split(' ').slice(0, 2).join(' ') : s)

/** The shuttle's line: stops in order along the route, from the trip that visits the most of them. */
function lineOf(trips: ShuttleTrip[]): string[] {
  const best = [...trips].sort((a, b) => new Set(b.stops).size - new Set(a.stops).size)[0]
  const line = best ? [...new Set(best.stops)] : []
  for (const s of stopsOf(trips)) if (!line.includes(s)) line.push(s)
  for (const t of trips) for (const s of t.stops) if (!line.includes(s)) line.push(s)
  return line
}

/** Trips split by direction along the line, each with its columns in travel order. */
function directions(trips: ShuttleTrip[], line: string[]) {
  const down: ShuttleTrip[] = [], up: ShuttleTrip[] = []
  for (const t of trips) (line.indexOf(t.stops[1]) > line.indexOf(t.stops[0]) ? down : up).push(t)
  const byTime = (a: ShuttleTrip, b: ShuttleTrip) => mins(a.depart) - mins(b.depart)
  const rev = [...line].reverse()
  return [
    { title: `${short(line[0])} → ${short(line[line.length - 1])}`, cols: line, trips: down.sort(byTime) },
    { title: `${short(rev[0])} → ${short(rev[rev.length - 1])}`, cols: rev, trips: up.sort(byTime) },
  ].filter(d => d.trips.length)
}

function CityBus() {
  useTick()
  const { ref } = useRef_()
  const todayType = isWeekend() ? 'weekend' : 'weekday'
  const [type, setType] = useState<'weekday' | 'weekend'>(todayType)
  const nm = nowMin()
  const col = (dir: 'out' | 'in', title: string) => {
    const list = ref.bus.filter(b => b.day_type === type && b.direction === dir).map(b => b.time).sort()
    const next = type === todayType ? list.find(x => mins(x) >= nm) : undefined
    return (
      <div>
        <div className="hd"><h3>{title}</h3></div>
        {list.length ? list.map(x => {
          const past = type === todayType && mins(x) < nm
          return <div key={dir + x} className={'dep' + (past ? ' past' : '') + (x === next ? ' next' : '')}>
            <b>{x}</b><small>{x === next ? 'Next · in ' + inFmt(mins(x) - nm) : past ? 'Departed' : ''}</small></div>
        }) : <Empty>No buses listed.</Empty>}
      </div>
    )
  }
  return (
    <div style={{ marginTop: 28 }}>
      <div className="hd wrap"><div><h2>City bus</h2><p className="sub">Campus ↔ city, from the main gate.</p></div>
        <Chips label="Days" value={type} onChange={setType} options={[['weekday', 'Mon–Fri'], ['weekend', 'Sat–Sun']]} /></div>
      <div className="cols">{col('out', 'Campus → City')}{col('in', 'City → Campus')}</div>
    </div>
  )
}

export function Mess() {
  useTick()
  const { ref } = useRef_()
  const todayName = DAYS[new Date().getDay()]
  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const [day, setDay] = useState<string>(() => (order.includes(hashId()) ? hashId() : todayName))
  useFocusItem(true, d => { if (order.includes(d)) setDay(d) })
  const nm = nowMin()
  const cur = ref.meals.find(m => nm >= mins(m.starts) && nm < mins(m.ends)) || ref.meals.find(m => mins(m.starts) > nm)
  const fb = useMealFeedback()
  return (
    <section>
      <div className="hd"><div><h2>Mess menu</h2><p className="sub">Rate today’s meals once they’re served. Totals help the mess committee.</p></div></div>
      <Chips label="Day" value={day} onChange={setDay} options={order.map(d => [d, d === todayName ? d + ' (today)' : d] as [string, string])} />
      {ref.meals.map(m => {
        const items = ref.menu.find(r => r.day === day && r.meal === m.meal)?.items || '—'
        const isCur = day === todayName && cur?.meal === m.meal
        return <div key={m.meal} className={'meal' + (isCur ? ' cur' : '')}>
          <div><b>{m.label}</b><small>{m.starts}–{m.ends}</small>
            {isCur && <div><span className="tag t-ok" style={{ marginTop: 6 }}>{nm >= mins(m.starts) ? 'Serving now' : 'Up next'}</span></div>}</div>
          <div>{items}{day === todayName && nm >= mins(m.starts) && items !== '—' && <MealVote meal={m.meal} fb={fb} />}</div>
        </div>
      })}
    </section>
  )
}

const emails = (s: string | null | undefined) => (s || '').split(',').map(e => e.trim()).filter(Boolean)

export function Contacts() {
  const { ref } = useRef_()
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState('')
  useFocusItem(true, () => setQ(''))
  const term = norm(q)
  // Auto drivers have their own page (Transport); they still turn up when searching.
  const groups = Array.from(new Set(ref.contacts.map(c => c.grp))).filter(g => term || g !== AUTO_GROUP)
  const autos = ref.contacts.some(c => c.grp === AUTO_GROUP)
  return (
    <section>
      <div className="hd"><div><h2>Important contacts</h2><p className="sub">Tap to call or email, or copy the number.</p></div></div>
      <input type="search" placeholder="Search contacts" aria-label="Search contacts" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 420, marginBottom: 16 }} />
      {groups.map(g => {
        const items = ref.contacts.filter(c => c.grp === g && (!term || norm(`${c.name} ${c.number} ${c.note} ${c.email} ${g}`).includes(term)))
        if (!items.length) return null
        return <div className="cgrp" key={g}><h3>{g}</h3><div className="ctc">
          {items.map(c => <PhoneCard key={c.id} c={c} copied={copied} onCopy={n => { setCopied(n); setTimeout(() => setCopied(''), 1500) }} wa={g === AUTO_GROUP} />)}
        </div></div>
      })}
      {!ref.contacts.length && <Empty>No contacts yet.</Empty>}
      {autos && !term && <p className="note">Auto and taxi drivers’ numbers are under <a href="#autos">Transport → Autos & taxis</a>.</p>}
    </section>
  )
}
