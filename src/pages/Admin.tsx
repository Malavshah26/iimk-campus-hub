import { useEffect, useState } from 'react'
import { useMe } from '../lib/auth'
import { useRef_ } from '../lib/ref'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import type { BusTime, Contact, Hostel, Slot, Year } from '../lib/types'
import { Chips } from '../components/Bits'
import { AdminsAdmin, FacilitiesAdmin, FeedbackAdmin, ShuttleAdmin, TimetableImport, UsageAdmin } from './AdminMore'

type Tab = 'timetable' | 'mess' | 'feedback' | 'bus' | 'contacts' | 'hostels' | 'facilities' | 'slots' | 'admins' | 'usage'
const DAYNAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function Admin() {
  const { isAdmin } = useMe()
  const [tab, setTab] = useState<Tab>('timetable')
  if (!isAdmin) return <div className="panel narrow"><h2>Council admin</h2><p>You don’t have admin access. Ask an existing admin to add you (see docs/SETUP.md, step 6).</p></div>
  return (
    <section>
      <div className="hd"><div><h2>Council admin</h2><p className="sub">Changes apply for everyone as soon as you save.</p></div></div>
      <Chips label="Admin area" value={tab} onChange={setTab} options={[['timetable', 'Timetable'], ['mess', 'Mess menu'], ['feedback', 'Mess feedback'], ['bus', 'Bus'], ['contacts', 'Contacts'], ['hostels', 'Hostels'], ['facilities', 'Facilities'], ['slots', 'Class timings'], ['admins', 'Admins'], ['usage', 'Usage & clean-up']]} />
      <p className="note" style={{ margin: '0 0 12px' }}>Notices are posted from the Notices tab; complaint replies from the Complaints tab.</p>
      {tab === 'timetable' && <TimetableAdmin />}
      {tab === 'mess' && <MessAdmin />}
      {tab === 'bus' && <><ShuttleAdmin /><h3>City bus (campus ↔ city)</h3><BusAdmin /></>}
      {tab === 'contacts' && <ContactsAdmin />}
      {tab === 'hostels' && <HostelsAdmin />}
      {tab === 'slots' && <SlotsAdmin />}
      {tab === 'feedback' && <FeedbackAdmin />}
      {tab === 'facilities' && <FacilitiesAdmin />}
      {tab === 'admins' && <AdminsAdmin />}
      {tab === 'usage' && <UsageAdmin />}
    </section>
  )
}

function useSave() {
  const toast = useToast()
  const { reload } = useRef_()
  return async (ops: PromiseLike<{ error: { message: string } | null }>[], ok = 'Saved.') => {
    const res = await Promise.all(ops)
    const err = res.find(r => r.error)?.error
    toast(err ? 'Error: ' + err.message : ok)
    await reload()
    return !err
  }
}

type Cell = { code: string; name: string; room: string }
function TimetableAdmin() {
  const { ref } = useRef_()
  const save = useSave()
  const [year, setYear] = useState<Year>('1')
  const [section, setSection] = useState(ref.sections[0]?.code || 'A')
  const [cells, setCells] = useState<Record<string, Cell>>({})
  const key = (wd: number, slot: number) => `${wd}-${slot}`

  useEffect(() => {
    const m: Record<string, Cell> = {}
    for (const r of ref.timetable) if (r.year === year && r.section === section) m[key(r.weekday, r.slot)] = { code: r.course_code, name: r.course_name, room: r.room || '' }
    setCells(m)
  }, [ref.timetable, year, section])

  const set = (k: string, f: keyof Cell, v: string) => setCells(c => ({ ...c, [k]: { ...(c[k] || { code: '', name: '', room: '' }), [f]: v } }))
  const submit = () => {
    const upserts = [], dels: [number, number][] = []
    for (let wd = 1; wd <= 6; wd++) for (const s of ref.slots) {
      const c = cells[key(wd, s.slot)]
      if (c && c.code.trim() && c.name.trim()) upserts.push({ year, section, weekday: wd, slot: s.slot, course_code: c.code.trim().slice(0, 12), course_name: c.name.trim().slice(0, 80), room: c.room.trim().slice(0, 20) || null })
      else if (ref.timetable.some(r => r.year === year && r.section === section && r.weekday === wd && r.slot === s.slot)) dels.push([wd, s.slot])
    }
    const ops = [] as PromiseLike<{ error: { message: string } | null }>[]
    if (upserts.length) ops.push(supabase.from('timetable').upsert(upserts, { onConflict: 'year,section,weekday,slot' }))
    for (const [wd, sl] of dels) ops.push(supabase.from('timetable').delete().match({ year, section, weekday: wd, slot: sl }))
    save(ops, 'Timetable saved.')
  }

  return (
    <div>
      <div className="sel">
        <div><label className="lab" htmlFor="a-y">Year</label><select id="a-y" value={year} onChange={e => setYear(e.target.value as Year)}><option value="1">Year 1</option><option value="2">Year 2</option></select></div>
        <div><label className="lab" htmlFor="a-s">Section</label><select id="a-s" value={section} onChange={e => setSection(e.target.value)}>{ref.sections.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}</select></div>
        <button className="btn pri inline" type="button" onClick={submit}>Save timetable</button>
      </div>
      <p className="note">Fill course code and name for each class. Clear both to remove a class.</p>
      <div className="scroll">
        <table className="adm">
          <thead><tr><th>Time</th>{DAYNAMES.map(d => <th key={d}>{d}</th>)}</tr></thead>
          <tbody>{ref.slots.map(s => <tr key={s.slot}><td className="tm"><b>{s.starts}</b>{s.ends}</td>
            {DAYNAMES.map((_, i) => {
              const k = key(i + 1, s.slot), c = cells[k] || { code: '', name: '', room: '' }
              return <td key={k}><input aria-label="Code" placeholder="Code" value={c.code} onChange={e => set(k, 'code', e.target.value)} />
                <input aria-label="Course name" placeholder="Course" value={c.name} onChange={e => set(k, 'name', e.target.value)} />
                <input aria-label="Room" placeholder="Room" value={c.room} onChange={e => set(k, 'room', e.target.value)} /></td>
            })}</tr>)}</tbody>
        </table>
      </div>
      <TimetableImport />
    </div>
  )
}

function MessAdmin() {
  const { ref } = useRef_()
  const save = useSave()
  const [m, setM] = useState<Record<string, string>>({})
  useEffect(() => setM(Object.fromEntries(ref.menu.map(r => [`${r.day}|${r.meal}`, r.items]))), [ref.menu])
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const submit = () => save([supabase.from('mess_menu').upsert(days.flatMap(d => ref.meals.map(x => ({ day: d, meal: x.meal, items: (m[`${d}|${x.meal}`] || '').trim() }))))], 'Mess menu saved.')
  return (
    <div>
      <button className="btn pri inline" type="button" onClick={submit}>Save menu</button>
      <div className="scroll" style={{ marginTop: 12 }}>
        <table className="adm wide">
          <thead><tr><th>Day</th>{ref.meals.map(x => <th key={x.meal}>{x.label}</th>)}</tr></thead>
          <tbody>{days.map(d => <tr key={d}><td className="tm"><b>{d}</b></td>
            {ref.meals.map(x => <td key={x.meal}><textarea aria-label={`${d} ${x.label}`} value={m[`${d}|${x.meal}`] || ''} onChange={e => setM({ ...m, [`${d}|${x.meal}`]: e.target.value })} /></td>)}</tr>)}</tbody>
        </table>
      </div>
      <h3 style={{ marginTop: 20 }}>Meal timings</h3>
      <MealTimes />
    </div>
  )
}

function MealTimes() {
  const { ref } = useRef_()
  const save = useSave()
  const [rows, setRows] = useState(ref.meals)
  useEffect(() => setRows(ref.meals), [ref.meals])
  return <div className="list" style={{ maxWidth: 520 }}>
    {rows.map((r, i) => <div className="row3" key={r.meal}><b>{r.label}</b>
      <input type="time" aria-label="Starts" value={r.starts} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, starts: e.target.value } : x))} />
      <input type="time" aria-label="Ends" value={r.ends} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, ends: e.target.value } : x))} /></div>)}
    <button className="btn inline" type="button" onClick={() => save([supabase.from('meal_times').upsert(rows)], 'Meal timings saved.')}>Save timings</button>
  </div>
}

function BusAdmin() {
  const { ref } = useRef_()
  const save = useSave()
  const [n, setN] = useState<Pick<BusTime, 'day_type' | 'direction' | 'time'>>({ day_type: 'weekday', direction: 'out', time: '08:00' })
  const group = (t: 'weekday' | 'weekend', d: 'out' | 'in') => ref.bus.filter(b => b.day_type === t && b.direction === d).sort((a, b) => a.time.localeCompare(b.time))
  return (
    <div>
      <form className="sel" onSubmit={e => { e.preventDefault(); save([supabase.from('bus_times').insert(n)], 'Bus time added.') }}>
        <div><label className="lab" htmlFor="b-t">Days</label><select id="b-t" value={n.day_type} onChange={e => setN({ ...n, day_type: e.target.value as 'weekday' })}><option value="weekday">Mon–Fri</option><option value="weekend">Sat–Sun</option></select></div>
        <div><label className="lab" htmlFor="b-d">Direction</label><select id="b-d" value={n.direction} onChange={e => setN({ ...n, direction: e.target.value as 'out' })}><option value="out">Campus → City</option><option value="in">City → Campus</option></select></div>
        <div><label className="lab" htmlFor="b-time">Time</label><input id="b-time" type="time" required value={n.time} onChange={e => setN({ ...n, time: e.target.value })} /></div>
        <button className="btn pri inline" type="submit">Add</button>
      </form>
      <div className="cols">
        {(['weekday', 'weekend'] as const).flatMap(t => (['out', 'in'] as const).map(d => (
          <div key={t + d}><h3>{t === 'weekday' ? 'Mon–Fri' : 'Sat–Sun'} · {d === 'out' ? 'Campus → City' : 'City → Campus'}</h3>
            <div className="chips">{group(t, d).map(b => <span key={b.id} className="pchip">{b.time}<button type="button" aria-label={'Remove ' + b.time} onClick={() => save([supabase.from('bus_times').delete().eq('id', b.id)], 'Removed.')}>×</button></span>)}</div></div>)))}
      </div>
    </div>
  )
}

function ContactsAdmin() {
  const { ref } = useRef_()
  const save = useSave()
  const [rows, setRows] = useState<Contact[]>(ref.contacts)
  useEffect(() => setRows(ref.contacts), [ref.contacts])
  const blank = { grp: 'Campus', name: '', number: '', note: '', emergency: false, sort: (ref.contacts.at(-1)?.sort || 0) + 1 }
  const [n, setN] = useState(blank)
  const upd = (i: number, f: Partial<Contact>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...f } : r)))
  return (
    <div>
      <div className="list">
        {rows.map((c, i) => <div className="card adm-row" key={c.id}>
          <input aria-label="Group" value={c.grp} onChange={e => upd(i, { grp: e.target.value })} />
          <input aria-label="Name" value={c.name} onChange={e => upd(i, { name: e.target.value })} />
          <input aria-label="Number" value={c.number} onChange={e => upd(i, { number: e.target.value })} />
          <input aria-label="Note" value={c.note || ''} onChange={e => upd(i, { note: e.target.value })} />
          <input aria-label="Order" type="number" value={c.sort} onChange={e => upd(i, { sort: +e.target.value })} />
          <label className="ck"><input type="checkbox" checked={c.emergency} onChange={e => upd(i, { emergency: e.target.checked })} /> Emergency</label>
          <div className="acts" style={{ margin: 0 }}>
            <button className="btn" type="button" onClick={() => save([supabase.from('contacts').update({ grp: c.grp, name: c.name, number: c.number, note: c.note || null, emergency: c.emergency, sort: c.sort }).eq('id', c.id)])}>Save</button>
            <button className="btn" type="button" onClick={() => save([supabase.from('contacts').delete().eq('id', c.id)], 'Deleted.')}>Delete</button>
          </div>
        </div>)}
      </div>
      <h3 style={{ marginTop: 20 }}>Add a contact</h3>
      <form className="card adm-row" onSubmit={e => { e.preventDefault(); if (n.name && n.number) save([supabase.from('contacts').insert({ ...n, note: n.note || null })], 'Contact added.').then(ok => ok && setN(blank)) }}>
        <input aria-label="Group" placeholder="Group" value={n.grp} onChange={e => setN({ ...n, grp: e.target.value })} />
        <input aria-label="Name" placeholder="Name" required value={n.name} onChange={e => setN({ ...n, name: e.target.value })} />
        <input aria-label="Number" placeholder="Number" required value={n.number} onChange={e => setN({ ...n, number: e.target.value })} />
        <input aria-label="Note" placeholder="Note" value={n.note} onChange={e => setN({ ...n, note: e.target.value })} />
        <input aria-label="Order" type="number" value={n.sort} onChange={e => setN({ ...n, sort: +e.target.value })} />
        <label className="ck"><input type="checkbox" checked={n.emergency} onChange={e => setN({ ...n, emergency: e.target.checked })} /> Emergency</label>
        <button className="btn pri inline" type="submit">Add</button>
      </form>
    </div>
  )
}

function HostelsAdmin() {
  const { ref } = useRef_()
  const save = useSave()
  const [rows, setRows] = useState<Hostel[]>(ref.hostels)
  const [code, setCode] = useState('')
  useEffect(() => setRows(ref.hostels), [ref.hostels])
  return (
    <div style={{ maxWidth: 560 }}>
      <p className="note">Set how many washing machines each hostel has.</p>
      <div className="list">{rows.map((h, i) => <div className="row3" key={h.code}><b>Hostel {h.code}</b>
        <input type="number" min={0} max={30} aria-label={`Machines in ${h.code}`} value={h.machines} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, machines: +e.target.value } : x))} />
        <button className="btn" type="button" onClick={() => save([supabase.from('hostels').delete().eq('code', h.code)], 'Hostel removed.')}>Remove</button></div>)}</div>
      <button className="btn pri inline" type="button" style={{ marginTop: 12 }} onClick={() => save([supabase.from('hostels').upsert(rows)], 'Hostels saved.')}>Save machine counts</button>
      <form className="sel" style={{ marginTop: 16 }} onSubmit={e => { e.preventDefault(); const c = code.trim().toUpperCase(); if (/^[A-Z0-9]{1,4}$/.test(c)) save([supabase.from('hostels').insert({ code: c, machines: 3, sort: rows.length + 1 })], 'Hostel added.').then(() => setCode('')) }}>
        <div><label className="lab" htmlFor="h-new">New hostel code</label><input id="h-new" maxLength={4} value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. R" /></div>
        <button className="btn inline" type="submit">Add hostel</button>
      </form>
    </div>
  )
}

function SlotsAdmin() {
  const { ref } = useRef_()
  const save = useSave()
  const [rows, setRows] = useState<Slot[]>(ref.slots)
  useEffect(() => setRows(ref.slots), [ref.slots])
  return (
    <div style={{ maxWidth: 520 }}>
      <p className="note">Class periods used by every timetable.</p>
      <div className="list">{rows.map((s, i) => <div className="row3" key={s.slot}><b>Class {s.slot}</b>
        <input type="time" aria-label="Starts" value={s.starts} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, starts: e.target.value } : x))} />
        <input type="time" aria-label="Ends" value={s.ends} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, ends: e.target.value } : x))} /></div>)}</div>
      <div className="acts">
        <button className="btn pri inline" type="button" onClick={() => save([supabase.from('class_slots').upsert(rows)], 'Class timings saved.')}>Save timings</button>
        <button className="btn" type="button" onClick={() => { const last = rows.at(-1); setRows([...rows, { slot: (last?.slot || 0) + 1, starts: '19:15', ends: '20:30' }]) }}>Add a period</button>
      </div>
    </div>
  )
}
