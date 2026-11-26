import { useMemo, useState } from 'react'
import { useMe } from '../lib/auth'
import { classesFor, useRef_, type RefData } from '../lib/ref'
import { explain, supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useLive } from '../lib/useLive'
import type { CampusEvent } from '../lib/types'
import { dayLabel, downloadIcs, dstr, googleCal, norm, overlaps, sectionLabel, today, waLink } from '../lib/util'
import { Chips, Empty, ErrorNote, Loading } from '../components/Bits'
import { Text } from '../components/Text'

type Filter = 'up' | 'going' | 'mine' | 'past'

/** Which year/section groups have a class during this time (for organisers picking a slot). */
export function classClashes(ref: RefData, date: string, starts: string, ends: string): string[] {
  const wd = new Date(date + 'T00:00').getDay()
  if (!date || wd === 0 || !(starts < ends)) return []
  const slots = new Map(ref.slots.map(s => [s.slot, s]))
  const hit = new Map<string, Set<string>>()
  for (const r of ref.timetable) {
    const s = slots.get(r.slot)
    if (r.weekday !== wd || !s || !overlaps(starts, ends, s.starts, s.ends)) continue
    if (!hit.has(r.year)) hit.set(r.year, new Set())
    hit.get(r.year)!.add(r.section)
  }
  const order = new Map(ref.sections.map(s => [s.code, s.sort]))
  return [...hit.entries()].sort().map(([y, secs]) =>
    `Year ${y}: ${[...secs].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99)).join(', ')}`)
}

export function Events() {
  const { uid, isAdmin, profile } = useMe()
  const { ref } = useRef_()
  const toast = useToast()
  const from = dstr(new Date(Date.now() - 60 * 864e5))
  const { data, loading, error, reload } = useLive<CampusEvent>('events',
    () => supabase.from('events').select('*, poster:profiles!events_user_id_fkey(name,phone), event_rsvps!event_rsvps_event_id_fkey(user_id)')
      .gte('event_date', from).order('event_date').order('starts').limit(500) as never,
    ['events', 'event_rsvps'])

  const [f, setF] = useState({ title: '', organiser: '', venue: '', date: today(), starts: '18:00', ends: '19:30', link: '', description: '' })
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<Filter>('up')
  const [q, setQ] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const formClasses = useMemo(() => classClashes(ref, f.date, f.starts, f.ends), [ref, f.date, f.starts, f.ends])
  const formEvents = data.filter(e => e.event_date === f.date && overlaps(f.starts, f.ends, e.starts, e.ends))

  const post = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.title.trim()) return
    if (!(f.starts < f.ends)) return toast('The event must end after it starts.')
    const link = f.link.trim()
    if (link && !/^https?:\/\//i.test(link)) return toast('Links must start with http:// or https://')
    setBusy(true)
    const { error } = await supabase.from('events').insert({
      title: f.title.trim().slice(0, 100), organiser: f.organiser.trim().slice(0, 60) || null, venue: f.venue.trim().slice(0, 80) || null,
      event_date: f.date, starts: f.starts, ends: f.ends, link: link || null, description: f.description.trim().slice(0, 600) || null,
    })
    setBusy(false)
    if (error) return toast(explain(error.message))
    setF({ ...f, title: '', venue: '', link: '', description: '' })
    toast('Event posted.')
    reload()
  }

  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p
    if (error) toast(explain(error.message))
    reload()
  }

  const t = today()
  const term = norm(q)
  const list = data
    .filter(e => filter === 'past' ? e.event_date < t : e.event_date >= t)
    .filter(e => filter !== 'going' || e.event_rsvps.some(r => r.user_id === uid))
    .filter(e => filter !== 'mine' || e.user_id === uid)
    .filter(e => !term || norm(`${e.title} ${e.organiser} ${e.venue} ${e.description}`).includes(term))
  if (filter === 'past') list.reverse()
  const days = [...new Set(list.map(e => e.event_date))]

  return (
    <div className="grid listfirst">
      <form className="panel stick" onSubmit={post}>
        <h2>Post an event</h2>
        <p className="sub">Club sessions, talks, matches, parties. Clashes show as you type.</p>
        <label htmlFor="e-title">What</label>
        <input id="e-title" required maxLength={100} value={f.title} onChange={set('title')} placeholder="Finance Club: valuation workshop" />
        <div className="row2">
          <div><label htmlFor="e-org">Organiser</label><input id="e-org" maxLength={60} value={f.organiser} onChange={set('organiser')} placeholder="Club or person" /></div>
          <div><label htmlFor="e-venue">Where</label><input id="e-venue" maxLength={80} value={f.venue} onChange={set('venue')} placeholder="CR 4" /></div>
        </div>
        <label htmlFor="e-date">Date</label>
        <input id="e-date" type="date" required min={t} value={f.date} onChange={set('date')} />
        <div className="row2">
          <div><label htmlFor="e-s">Starts</label><input id="e-s" type="time" required value={f.starts} onChange={set('starts')} /></div>
          <div><label htmlFor="e-e">Ends</label><input id="e-e" type="time" required value={f.ends} onChange={set('ends')} /></div>
        </div>
        <div className={'clash ' + (formClasses.length || formEvents.length ? 'warn' : 'ok')} aria-live="polite">
          {formClasses.length ? <><b>Classes at this time</b>{formClasses.map(c => <div key={c}>{c}</div>)}</> : <b>No classes at this time.</b>}
          {formEvents.length > 0 && <div style={{ marginTop: 6 }}><b>Other events:</b> {formEvents.map(e => `${e.title} (${e.starts}–${e.ends})`).join('; ')}</div>}
        </div>
        <label htmlFor="e-link">Link (optional)</label>
        <input id="e-link" type="url" maxLength={300} value={f.link} onChange={set('link')} placeholder="Registration form, poster…" />
        <label htmlFor="e-desc">Details</label>
        <textarea id="e-desc" maxLength={600} value={f.description} onChange={set('description')} />
        <button className="btn pri" type="submit" disabled={busy}>{busy ? 'Posting…' : 'Post event'}</button>
      </form>
      <div>
        <ErrorNote error={error} />
        <Chips label="Filter" value={filter} onChange={setFilter} options={[['up', 'Upcoming'], ['going', 'I’m going'], ['mine', 'Posted by me'], ['past', 'Past']]} />
        <input type="search" placeholder="Search events" aria-label="Search events" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 12 }} />
        {loading ? <Loading /> : days.length ? days.map(d => {
          const dayEvents = list.filter(e => e.event_date === d)
          const myClasses = classesFor(ref, new Date(d + 'T00:00'), profile.year, profile.section)
          return (
            <div key={d} className="evday">
              <h3>{dayLabel(d)}</h3>
              <div className="list">
                {dayEvents.map(e => {
                  const going = e.event_rsvps.some(r => r.user_id === uid)
                  const others = data.filter(o => o.id !== e.id && o.event_date === e.event_date && overlaps(e.starts, e.ends, o.starts, o.ends))
                  const mine = myClasses.filter(c => overlaps(e.starts, e.ends, c.starts, c.ends))
                  const wa = waLink(e.poster?.phone)
                  const cal = { title: e.title, date: e.event_date, starts: e.starts, ends: e.ends, place: e.venue, details: [e.organiser, e.description, e.link].filter(Boolean).join('\n') }
                  return (
                    <div className={'card' + (e.event_date < t ? ' closed' : '')} key={e.id}>
                      <div className="ch"><h3>{e.title}</h3><b className="when">{e.starts}–{e.ends}</b></div>
                      <div className="meta">{[e.venue, e.organiser || e.poster?.name].filter(Boolean).join(' · ')}{e.event_rsvps.length ? ` · ${e.event_rsvps.length} going` : ''}</div>
                      {mine.length > 0 && <div className="flag">Clashes with your class: {mine.map(c => `${c.name} (${c.starts}–${c.ends})`).join(', ')}</div>}
                      {others.length > 0 && <div className="flag soft">Overlaps with: {others.map(o => o.title).join(', ')}</div>}
                      {e.description && <Text text={e.description} />}
                      <div className="acts">
                        {e.event_date >= t && <button className={'btn' + (going ? ' on' : '')} type="button" aria-pressed={going}
                          onClick={() => run(going ? supabase.from('event_rsvps').delete().eq('event_id', e.id).eq('user_id', uid) : supabase.from('event_rsvps').insert({ event_id: e.id }))}>
                          {going ? '✓ Going' : 'I’m going'}</button>}
                        {e.event_date >= t && <a className="btn" href={googleCal(cal)} target="_blank" rel="noopener noreferrer">Google Calendar</a>}
                        {e.event_date >= t && <button className="btn" type="button" onClick={() => downloadIcs(cal)}>.ics</button>}
                        {e.link && <a className="btn" href={e.link} target="_blank" rel="noopener noreferrer">Link</a>}
                        {wa && e.user_id !== uid && <a className="btn" href={wa} target="_blank" rel="noopener noreferrer">Ask on WhatsApp</a>}
                        {(e.user_id === uid || isAdmin) && <button className="btn" type="button" onClick={() => { if (confirm('Remove this event?')) run(supabase.from('events').delete().eq('id', e.id)) }}>Remove</button>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        }) : <Empty>{filter === 'up' ? 'No upcoming events yet. Post the first one.' : 'Nothing here.'}</Empty>}
        <p className="note">Class clashes use {sectionLabel(profile.section)}, Year {profile.year} (from your profile).</p>
      </div>
    </div>
  )
}
