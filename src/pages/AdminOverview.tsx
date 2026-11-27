import { useCallback, useEffect, useState } from 'react'
import { useRef_ } from '../lib/ref'
import { explain, supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { AUTO_GROUP } from '../lib/autos'
import { sectionLabel } from '../lib/util'
import { ErrorNote, Loading } from '../components/Bits'

/** Where a checklist item's "Fix" goes: an Admin tab, or a page/link. */
export type FixTab = 'timetable' | 'mess' | 'feedback' | 'bus' | 'contacts' | 'hostels' | 'facilities' | 'slots' | 'admins' | 'usage'

type Overview = {
  students: number; new7: number; active1: number; active7: number; active30: number; admins: number
  sections: { year: string; section: string; students: number; active7: number; shared: boolean }[]
  notices_live: number; notices_pinned: number; events_soon: number; polls_open: number
  lost_open: number; listings_open: number; complaints_open: number; calendars: number
}
type Item = { id: string; title: string; done: boolean; auto: boolean; detail: string; fix?: { label: string; tab?: FixTab; href?: string } }

// What seed.sql and 0002 put in, so the checklist can tell sample data from real data.
const SAMPLE_MEALS: Record<string, [string, string]> = { b: ['07:30', '09:30'], l: ['12:30', '14:30'], d: ['19:30', '22:00'] }
const SAMPLE_MENU = 'Idli, sambar, coconut chutney, bread omelette'
const SAMPLE_FACILITIES = ['Discussion room 1', 'Discussion room 2', 'Discussion room 3', 'Badminton court 1', 'Badminton court 2', 'Tennis court']
const CONTACT_NEEDS: [string, RegExp][] = [
  ['Security / main gate', /security|main gate/i], ['Medical centre', /medical|health|clinic|hospital|doctor/i],
  ['Library', /library/i], ['Mess office', /mess|catering|dining/i], ['Computer centre / Wi-Fi help', /computer|wi-?fi|network|\bIT\b/i],
]
const SMTP_DOCS = 'https://github.com/Malavshah26/iimk-campus-hub/blob/main/docs/SETUP.md#4-sign-in-emails'
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function AdminOverview({ onTab }: { onTab: (t: FixTab) => void }) {
  const { ref } = useRef_()
  const toast = useToast()
  const [o, setO] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ticks, setTicks] = useState<Set<string>>(new Set())
  const [facilities, setFacilities] = useState<string[] | null>(null)

  const load = useCallback(async () => {
    const [ov, ch, fa] = await Promise.all([
      supabase.rpc('admin_overview'),
      supabase.from('admin_checks').select('item'),
      supabase.from('facilities').select('name'),
    ])
    setError(ov.error?.message || null)
    if (ov.data) setO(ov.data as Overview)
    setTicks(new Set(((ch.data as { item: string }[] | null) || []).map(r => r.item)))
    setFacilities(((fa.data as { name: string }[] | null) || []).map(f => f.name))
  }, [])
  useEffect(() => { load() }, [load])

  const tick = async (id: string, done: boolean) => {
    const { error } = done ? await supabase.from('admin_checks').insert({ item: id }) : await supabase.from('admin_checks').delete().eq('item', id)
    if (error) return toast(explain(error.message))
    setTicks(t => { const n = new Set(t); if (done) n.add(id); else n.delete(id); return n })
  }

  if (!o) return error ? <ErrorNote error={error} /> : <Loading />

  // ------------------------------------------------------------ checklist
  const contactText = ref.contacts.filter(c => c.grp !== AUTO_GROUP).map(c => `${c.name} ${c.note || ''} ${c.grp}`).join(' | ')
  const missingContacts = CONTACT_NEEDS.filter(([, re]) => !re.test(contactText)).map(([n]) => n)
  const mealsSample = ref.meals.length > 0 && ref.meals.every(m => SAMPLE_MEALS[m.meal]?.[0] === m.starts && SAMPLE_MEALS[m.meal]?.[1] === m.ends)
  const menuGaps = DAYS.flatMap(d => ref.meals.filter(m => !ref.menu.find(r => r.day === d && r.meal === m.meal)?.items?.trim()).map(m => `${d} ${m.label}`))
  const menuSample = ref.menu.some(r => r.items === SAMPLE_MENU)
  const washersSample = ref.hostels.length > 0 && ref.hostels.every(h => h.machines === 3)
  const facSample = facilities !== null && SAMPLE_FACILITIES.every(n => facilities.includes(n))
  const autos = ref.contacts.filter(c => c.grp === AUTO_GROUP).length
  const withStudents = o.sections.filter(s => s.students > 0)
  const shared = withStudents.filter(s => s.shared).length

  const items: Item[] = [
    { id: 'smtp', title: 'Sign-in emails come from your own sender (SMTP)', auto: false, done: false,
      detail: 'Supabase’s built-in sender only manages a few emails an hour. When a whole batch signs in at once, emails fail without SMTP. Tick this once a test sign-in email arrives from your sender.',
      fix: { label: 'How to set it up', href: SMTP_DOCS } },
    { id: 'menu', title: 'Mess menu is the real one, for every day', auto: true, done: !menuSample && !menuGaps.length,
      detail: menuSample ? 'The sample menu from setup is still there.' : menuGaps.length ? `Missing: ${menuGaps.slice(0, 6).join(', ')}${menuGaps.length > 6 ? '…' : ''}.` : 'Update it each month from the mess committee’s Excel.',
      fix: { label: 'Mess menu', tab: 'mess' } },
    { id: 'meals', title: 'Meal timings match the mess', auto: true, done: !mealsSample,
      detail: mealsSample ? 'Still the guessed times from setup. If they happen to be right, tick it.' : ref.meals.map(m => `${m.label} ${m.starts}–${m.ends}`).join(' · '),
      fix: { label: 'Meal timings', tab: 'mess' } },
    { id: 'washers', title: 'Washing machines per hostel', auto: true, done: !washersSample,
      detail: washersSample ? 'Every hostel still shows the placeholder of 3 machines.' : 'Counts set.', fix: { label: 'Hostels', tab: 'hostels' } },
    { id: 'facilities', title: 'Rooms and courts students can book', auto: true, done: facilities !== null && !facSample,
      detail: facSample ? 'Still the 6 sample rooms and courts from setup. Rename them, add real ones, or untick Bookable.' : `${facilities?.length ?? 0} bookable places listed.`,
      fix: { label: 'Facilities', tab: 'facilities' } },
    { id: 'contacts', title: 'Campus contacts', auto: true, done: !missingContacts.length,
      detail: missingContacts.length ? `Missing: ${missingContacts.join(', ')}.` : 'Security, medical centre, library, mess and IT help are listed.',
      fix: { label: 'Contacts', tab: 'contacts' } },
    { id: 'autos', title: 'Auto & taxi drivers', auto: true, done: autos > 0,
      detail: autos ? `${autos} drivers listed under Transport.` : 'None yet. Paste the drivers’ list in Admin → Transport.', fix: { label: 'Transport', tab: 'bus' } },
    { id: 'shuttle', title: 'Campus shuttle timetable', auto: true, done: ref.shuttle.length > 0,
      detail: ref.shuttle.length ? `${ref.shuttle.length} trips. Paste the new sheet when the timings change.` : 'No shuttle trips yet.', fix: { label: 'Transport', tab: 'bus' } },
    { id: 'admins', title: 'At least two council admins', auto: true, done: o.admins >= 2,
      detail: o.admins >= 2 ? `${o.admins} admins.` : 'Only one admin. Add another so the app isn’t stuck if you’re away.', fix: { label: 'Admins', tab: 'admins' } },
    { id: 'notice', title: 'A pinned welcome notice for launch', auto: true, done: o.notices_pinned > 0,
      detail: o.notices_pinned ? 'A pinned notice is showing at the top of everyone’s app.' : 'Pin a short notice: what Campus Hub is, how to install it, who to contact.', fix: { label: 'Post a notice', href: '#notices' } },
    { id: 'timetables', title: 'Every section has a shared timetable', auto: true, done: withStudents.length > 0 && shared === withStudents.length,
      detail: withStudents.length ? `${shared} of ${withStudents.length} sections with students have one. One student per section syncing their Google Calendar (Classes tab) fills it for the whole section.` : 'No students yet.' },
  ]
  const isDone = (it: Item) => it.done || ticks.has(it.id)
  const doneCount = items.filter(isDone).length
  const todo = items.filter(it => !isDone(it)), done = items.filter(isDone)

  const row = (it: Item) => {
    const d = isDone(it), byHand = !it.done && ticks.has(it.id)
    return <div key={it.id} className={'chk' + (d ? ' ok' : '')}>
      <span className="chkmark" aria-hidden="true">{d ? '✓' : ''}</span>
      <div style={{ minWidth: 0 }}>
        <b>{it.title}</b>
        <p className="note" style={{ margin: '2px 0 0' }}>{byHand ? 'Marked done by an admin.' : it.detail}</p>
      </div>
      <div className="chkacts">
        {!d && it.fix && (it.fix.tab
          ? <button className="btn" type="button" onClick={() => onTab(it.fix!.tab!)}>{it.fix.label}</button>
          : <a className="btn" href={it.fix.href} {...(it.fix.href!.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{it.fix.label}</a>)}
        {!it.done && (byHand
          ? <button className="linkbtn small" type="button" onClick={() => tick(it.id, false)}>undo</button>
          : <button className="btn" type="button" onClick={() => tick(it.id, true)}>Mark done</button>)}
      </div>
    </div>
  }

  // ------------------------------------------------------------ numbers
  const pct = (n: number) => (o.students ? Math.round((n * 100) / o.students) + '%' : '–')
  const none = (['1', '2'] as const).flatMap(y => ref.sections.filter(s => !o.sections.some(x => x.year === y && x.section === s.code)).map(s => `Y${y} ${s.label.replace('Section ', '')}`))

  return (
    <div className="ovw">
      <ErrorNote error={error} />
      <div className="panel">
        <div className="hd wrap"><div><h3>Launch checklist</h3><p className="sub" style={{ marginBottom: 0 }}>{doneCount} of {items.length} done{todo.length ? '' : '. Ready for the whole batch.'}</p></div>
          <button className="linkbtn" type="button" onClick={load}>refresh</button></div>
        <div className="bar" style={{ margin: '4px 0 14px' }}><i style={{ width: Math.max(2, Math.round((doneCount * 100) / items.length)) + '%' }} /></div>
        <div className="list" style={{ gap: 8 }}>{todo.map(row)}</div>
        {done.length > 0 && <details style={{ marginTop: 12 }}><summary className="lab" style={{ cursor: 'pointer' }}>Done ({done.length})</summary>
          <div className="list" style={{ gap: 8, marginTop: 8 }}>{done.map(row)}</div></details>}
      </div>

      <h3 style={{ margin: '22px 0 10px' }}>Sign-ups and activity</h3>
      <div className="cols ovtiles">
        {([['Students signed up', o.students, ''], ['New this week', o.new7, ''], ['Opened the app today', o.active1, pct(o.active1)],
          ['Active this week', o.active7, pct(o.active7)], ['Active this month', o.active30, pct(o.active30)]] as [string, number, string][])
          .map(([k, v, p]) => <div className="card" key={k}><div className="meta" style={{ marginTop: 0 }}>{k}</div><div className="big">{v}</div>{p && <div className="meta">{p} of students</div>}</div>)}
      </div>
      <p className="note">“Active” counts students who opened Campus Hub (counted from this update on). Admins see totals only, never who.</p>

      <div className="scroll" style={{ marginTop: 12 }}>
        <table className="adm ovtable">
          <thead><tr><th>Section</th><th>Students</th><th>Active this week</th><th>Shared timetable</th></tr></thead>
          <tbody>{o.sections.map(s => <tr key={s.year + s.section}>
            <td><b>Year {s.year}</b> · {sectionLabel(s.section)}</td><td>{s.students}</td>
            <td>{s.active7}{s.students ? <span className="meta"> · {Math.round((s.active7 * 100) / s.students)}%</span> : null}</td>
            <td>{s.shared ? <span className="tag t-ok">Yes</span> : <span className="tag t-mut">Not yet</span>}</td></tr>)}</tbody>
        </table>
      </div>
      {none.length > 0 && o.students > 0 && <p className="note">No sign-ups yet from: {none.join(', ')}.</p>}

      <h3 style={{ margin: '22px 0 10px' }}>Right now</h3>
      <div className="chips">
        {([[o.notices_live, 'live notices', '#notices'], [o.polls_open, 'open polls', '#polls'], [o.events_soon, 'events in the next 2 weeks', '#events'],
          [o.lost_open, 'open lost & found posts', '#lost'], [o.listings_open, 'open buy & sell listings', '#market'], [o.complaints_open, 'open complaints', '#complaints'],
          [o.calendars, 'students sharing their section’s timetable', '#classes']] as [number, string, string][])
          .map(([n, t, h]) => <a key={t} className="chip" href={h}><b>{n}</b> {t}</a>)}
      </div>
    </div>
  )
}
