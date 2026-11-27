import { useEffect, useMemo, useRef, useState } from 'react'
import { useMe } from '../lib/auth'
import { useRef_ } from '../lib/ref'
import { supabase } from '../lib/supabase'
import { AUTO_GROUP } from '../lib/autos'
import { AREAS, CATS } from '../lib/lostfound'
import { DAYS, dayLabel, dstr, norm, rupee } from '../lib/util'
import { Modal } from './Modal'

/** Pages, with words people might type for them. */
const PAGES: [string, string, string][] = [
  ['classes', 'Classes', 'timetable attendance schedule calendar session lecture'],
  ['notices', 'Notices', 'announcements council news'],
  ['polls', 'Polls & elections', 'vote voting election'],
  ['events', 'Events', 'club talk fest workshop'],
  ['mess', 'Mess menu', 'food breakfast lunch dinner meal'],
  ['laundry', 'Laundry', 'washing machine washer clothes'],
  ['bus', 'Shuttle', 'bus timings transport'],
  ['autos', 'Autos & taxis', 'auto taxi cab driver rickshaw'],
  ['rides', 'Carpool', 'ride share cab airport station'],
  ['market', 'Buy & sell', 'marketplace sell buy rent'],
  ['lost', 'Lost & found', 'lost found missing'],
  ['book', 'Book a room', 'discussion room court badminton tennis booking facility'],
  ['complaints', 'Complaints', 'issue problem wifi hostel report'],
  ['contacts', 'Contacts', 'phone number helpline emergency office email'],
  ['profile', 'Profile & settings', 'settings theme dark light mode notifications birthday install account sign out'],
]
const MEAL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const FULL: Record<string, string> = { Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' }

type Hit = { to: string; title: string; meta: string; score: number }
type Group = { name: string; to: string; hits: Hit[] }
type Rows = Record<'notices' | 'events' | 'lost' | 'listings' | 'polls', Record<string, unknown>[]>

const words = (q: string) => norm(q).split(/\s+/).filter(Boolean)
/** 0 = not a match. Every word must appear somewhere; title matches rank higher. */
function score(ws: string[], title: string, rest = '') {
  const t = norm(title), all = t + ' ' + norm(rest)
  if (!ws.length || !ws.every(w => all.includes(w))) return 0
  return 1 + (ws.every(w => t.includes(w)) ? 2 : 0) + (t.startsWith(ws[0]) ? 1 : 0)
}
const s = (v: unknown) => (v == null ? '' : String(v))

/** One search box over pages, notices, polls, events, lost & found, buy & sell, contacts and the mess menu. */
export function Search({ onClose }: { onClose: () => void }) {
  const { isAdmin } = useMe()
  const { ref } = useRef_()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Rows | null>(null)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    const since = dstr(new Date(Date.now() - 60 * 864e5))
    const get = (p: PromiseLike<{ data: unknown; error: unknown }>) => Promise.resolve(p).then(r => (r.error ? [] : (r.data as Record<string, unknown>[]) || []), () => [])
    Promise.all([
      get(supabase.from('notices').select('id,title,body,created_at').order('created_at', { ascending: false }).limit(150)),
      get(supabase.from('events').select('id,title,organiser,venue,event_date,starts,description').gte('event_date', since).order('event_date').limit(300)),
      get(supabase.from('lost_items').select('*').order('created_at', { ascending: false }).limit(400)),
      get(supabase.from('listings').select('id,kind,title,description,category,price,status').order('created_at', { ascending: false }).limit(300)),
      get(supabase.from('polls').select('id,title,details,closes_at,secret').order('created_at', { ascending: false }).limit(100)),
    ]).then(([notices, events, lost, listings, polls]) => setRows({ notices, events, lost, listings, polls }))
  }, [])

  const ws = words(q)
  const groups = useMemo<Group[]>(() => {
    if (!ws.length) return []
    const g = (name: string, to: string, hits: Hit[]): Group => ({ name, to, hits: hits.filter(h => h.score).sort((a, b) => b.score - a.score) })
    const pages = PAGES.concat(isAdmin ? [['admin', 'Council admin', 'admin settings manage']] : [])
    const r = rows || { notices: [], events: [], lost: [], listings: [], polls: [] }
    const today = DAYS[new Date().getDay()]
    const order = [...MEAL_DAYS.slice(MEAL_DAYS.indexOf(today)), ...MEAL_DAYS.slice(0, MEAL_DAYS.indexOf(today))]
    const menu: Hit[] = []
    for (const day of order) for (const m of ref.meals) {
      const items = ref.menu.find(x => x.day === day && x.meal === m.meal)?.items || ''
      const dishes = items.split(',').map(x => x.trim()).filter(d => ws.every(w => norm(d).includes(w)))
      if (dishes.length) menu.push({ to: 'mess/' + day, title: `${day === today ? 'Today' : FULL[day]} · ${m.label}`, meta: dishes.join(', '), score: 1 })
    }
    return [
      g('Go to', '', pages.map(([to, label, kw]) => ({ to, title: label, meta: '', score: score(ws, label, kw) }))),
      g('Notices', 'notices', r.notices.map(n => ({ to: 'notices/' + n.id, title: s(n.title), meta: s(n.body).slice(0, 90), score: score(ws, s(n.title), s(n.body)) }))),
      g('Polls', 'polls', r.polls.map(p => ({ to: 'polls/' + p.id, title: s(p.title), meta: new Date(s(p.closes_at)).getTime() > Date.now() ? 'Open now' : 'Closed', score: score(ws, s(p.title), s(p.details)) }))),
      g('Events', 'events', r.events.map(e => ({ to: 'events/' + e.id, title: s(e.title), meta: [dayLabel(s(e.event_date)), s(e.starts), s(e.venue), s(e.organiser)].filter(Boolean).join(' · '), score: score(ws, s(e.title), `${s(e.organiser)} ${s(e.venue)} ${s(e.description)}`) }))),
      g('Lost & found', 'lost', r.lost.filter(l => !l.hidden).map(l => ({
        to: 'lost/' + l.id, title: s(l.item), score: score(ws, s(l.item), `${s(l.description)} ${s(l.place)} ${s(l.ref)} ${CATS[s(l.category)] || ''} ${AREAS[s(l.area)] || ''} ${s(l.kind)}`),
        meta: [l.kind === 'found' ? 'Found' : 'Lost', l.status === 'open' ? '' : l.status === 'closed' ? 'closed' : 'reunited', s(l.ref), AREAS[s(l.area)] || s(l.place)].filter(Boolean).join(' · '),
      }))),
      g('Buy & sell', 'market', r.listings.map(m => ({ to: 'market/' + m.id, title: s(m.title), meta: [m.kind === 'want' ? 'Wanted' : m.kind === 'rent' ? 'For rent' : 'For sale', rupee(Number(m.price)), s(m.category), m.status === 'done' ? 'done' : ''].filter(Boolean).join(' · '), score: score(ws, s(m.title), `${s(m.description)} ${s(m.category)}`) }))),
      g('Contacts', 'contacts', ref.contacts.map(c => ({ to: (c.grp === AUTO_GROUP ? 'autos/' : 'contacts/') + c.id, title: c.name, meta: [c.number, c.grp].join(' · '), score: score(ws, c.name, `${c.number} ${c.note || ''} ${c.email || ''} ${c.grp}`) }))),
      g('Mess menu', 'mess', menu),
    ].filter(x => x.hits.length)
  }, [q, rows, ref, isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  const flat = groups.flatMap(x => x.hits.slice(0, 5))
  useEffect(() => setActive(0), [q])
  const go = (to: string) => { onClose(); window.location.hash = '#' + to }
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, flat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && flat[active]) { e.preventDefault(); go(flat[active].to) }
  }
  let i = -1

  return (
    <Modal label="Search Campus Hub" onClose={onClose} top head={
      <input ref={input} className="sbox" type="search" value={q} onChange={e => setQ(e.target.value)} onKeyDown={key}
        placeholder="Search notices, events, lost & found, menu, contacts…" aria-label="Search everything" autoComplete="off" enterKeyHint="go" />}>
      <div className="sres" role="listbox" aria-label="Results">
        {!ws.length ? <p className="note">Try “biryani”, “charger”, “quiz”, “security” or a code like “LF-2611”.</p>
          : !groups.length ? <p className="note">{rows ? `Nothing found for “${q}”.` : 'Searching…'}</p>
          : groups.map(gr => <div key={gr.name} className="sgrp">
            <h4>{gr.name}</h4>
            {gr.hits.slice(0, 5).map(h => {
              i++
              const on = i === active
              return <button key={h.to} type="button" role="option" aria-selected={on} className={'shit' + (on ? ' on' : '')} onClick={() => go(h.to)} onMouseEnter={() => setActive(flat.indexOf(h))}>
                <b>{h.title}</b>{h.meta && <span>{h.meta}</span>}
              </button>
            })}
            {gr.to && gr.hits.length > 5 && <button type="button" className="linkbtn small" onClick={() => go(gr.to)}>All {gr.hits.length} in {gr.name} →</button>}
          </div>)}
      </div>
    </Modal>
  )
}
