import { useState } from 'react'
import { useRef_ } from '../lib/ref'
import { useTick } from '../lib/useLive'
import { DAYS, inFmt, isWeekend, local, mins, norm, nowMin, saveLocal } from '../lib/util'
import { DEFAULT_STOP, legsFrom, runsToday, showTime, stopsOf, type Leg } from '../lib/shuttle'
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
  return <div className={'crd' + (c.emergency ? ' em' : '') + (w ? ' stack' : '')}>
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
  const stops = stopsOf(ref.shuttle)
  const [from, setFromRaw] = useState(() => { const s = local('hub.stop', DEFAULT_STOP); return stops.includes(s) ? s : stops[0] })
  const [to, setTo] = useState('')
  const [early, setEarly] = useState(false)
  const [table, setTable] = useState(false)
  const setFrom = (s: string) => { setFromRaw(s); saveLocal('hub.stop', s); if (s === to) setTo('') }
  const nm = nowMin()
  const legs = legsFrom(ref.shuttle.filter(t => runsToday(t)), from, to)
  const past = legs.filter(l => mins(l.at) < nm)
  const next = legs.find(l => mins(l.at) >= nm)
  const shown = early ? legs : legs.filter(l => mins(l.at) >= nm)
  const extra = (l: Leg, isNext: boolean, gone: boolean) => [
    isNext ? 'Next · in ' + inFmt(mins(l.at) - nm) : gone ? 'Gone' : '',
    l.trip.note || '',
    l.i > 0 ? `starts at ${l.trip.stops[0]} ${showTime(l.trip.depart)}` : '',
  ].filter(Boolean).join(' · ')
  return (
    <div>
      <div className="hd"><div><h2>Campus shuttle</h2><p className="sub">Pick your stop; the next shuttle is highlighted. Times marked ≈ are estimates (about 5 min between stops).</p></div></div>
      <span className="lab">I’m at</span>
      <Chips label="From stop" value={from} onChange={setFrom} options={stops.map(s => [s, s] as [string, string])} />
      <span className="lab">Going to</span>
      <Chips label="To stop" value={to} onChange={setTo} options={[['', 'Anywhere'] as [string, string], ...stops.filter(s => s !== from).map(s => [s, s] as [string, string])]} />
      {past.length > 0 && <p style={{ margin: '0 0 8px' }}><button className="linkbtn" type="button" onClick={() => setEarly(!early)}>{early ? 'Hide' : 'Show'} earlier today ({past.length})</button></p>}
      <div>
        {shown.length ? shown.map(l => {
          const gone = mins(l.at) < nm, isNext = l === next
          return <div key={l.trip.id} className={'dep shuttle' + (gone ? ' past' : '') + (isNext ? ' next' : '')}>
            <b>{l.est ? '≈' : ''}{showTime(l.at)}</b>
            <div>
              <div className="route">{l.rest.map((r, k) => <span key={k}>→ {r.stop} <small>{r.est ? '≈' : ''}{showTime(r.t)}</small> </span>)}</div>
              <small>{extra(l, isNext, gone)}</small>
            </div>
          </div>
        }) : <Empty>{legs.length ? 'No more shuttles from here today.' : 'No shuttle goes that way.'}</Empty>}
      </div>
      <button className="btn inline" type="button" style={{ marginTop: 14 }} onClick={() => setTable(!table)}>{table ? 'Hide' : 'Show'} full timetable</button>
      {table && <div className="scroll" style={{ marginTop: 10 }}><table className="adm shtable"><thead><tr><th>Leaves</th><th>Route</th></tr></thead><tbody>
        {ref.shuttle.map(t => <tr key={t.id}><td className="tm"><b>{showTime(t.depart)}</b></td><td>{t.stops.map((s, i) => <span key={i}>{i ? ' → ' : ''}{s}{i && t.at[i] ? ` (${showTime(t.at[i])})` : ''}</span>)}{t.note ? <small className="meta"> · {t.note}</small> : null}</td></tr>)}
      </tbody></table></div>}
    </div>
  )
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
  const [day, setDay] = useState<string>(todayName)
  const nm = nowMin()
  const cur = ref.meals.find(m => nm >= mins(m.starts) && nm < mins(m.ends)) || ref.meals.find(m => mins(m.starts) > nm)
  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
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
