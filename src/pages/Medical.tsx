import { useEffect, useState } from 'react'
import { useMe } from '../lib/auth'
import { useRef_ } from '../lib/ref'
import { explain, supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useLive } from '../lib/useLive'
import { MEDICAL_GROUP } from '../lib/autos'
import { dayLabel, dstr, hhmm, waLink } from '../lib/util'
import { Empty, ErrorNote, Loading, Seg } from '../components/Bits'

interface Req {
  id: string; user_id: string; items: string; notes: string | null; urgency: 'now' | 'today' | 'tomorrow'
  deliver_to: string | null; phone: string | null; status: Status; response: string | null; created_at: string; updated_at: string
  who?: { name: string } | null
}
type Status = 'requested' | 'ready' | 'delivered' | 'unavailable' | 'cancelled'
const STATUS: Record<Status, [string, string]> = {
  requested: ['Sent to the medical desk', 't-sun'], ready: ['Ready', 't-ok'], delivered: ['Delivered', 't-ok'],
  unavailable: ['Not available', 't-red'], cancelled: ['Cancelled', 't-mut'],
}
const URGENCY: Record<string, string> = { now: 'Now (urgent)', today: 'Today', tomorrow: 'Tomorrow is fine' }
const tel = (n: string) => 'tel:' + n.replace(/[^\d+]/g, '')
const when = (iso: string) => `${dayLabel(dstr(new Date(iso)))} ${hhmm(iso)}`

export function Medical() {
  const { uid, isAdmin } = useMe()
  const { ref } = useRef_()
  const med = ref.contacts.filter(c => c.grp === MEDICAL_GROUP)
  const ambulance = med.find(c => /ambulance/i.test(c.name))
  const dispensary = med.find(c => /dispensary|medical cent|health cent|clinic|doctor/i.test(c.name))
  const [desk, setDesk] = useState(false)
  useEffect(() => { supabase.from('medical_desk').select('user_id').eq('user_id', uid).maybeSingle().then(({ data }) => setDesk(!!data)) }, [uid])

  return (
    <section className="medical">
      <div className="hd"><div><h2>Medical</h2><p className="sub">Emergency calls, and medicines delivered or kept ready at the dispensary.</p></div></div>
      <div className="emerg">
        {ambulance ? <a className="btn em" href={tel(ambulance.number)}><b>Call IIMK ambulance</b><span>{ambulance.number}</span></a>
          : <span className="btn em off"><b>Call IIMK ambulance</b><span>Number not added yet</span></span>}
        {dispensary ? <a className="btn em soft" href={tel(dispensary.number)}><b>Call the dispensary</b><span>{dispensary.number}</span></a>
          : <span className="btn em soft off"><b>Call the dispensary</b><span>Number not added yet</span></span>}
        <a className="btn em soft" href="tel:108"><b>Kerala ambulance</b><span>108</span></a>
      </div>
      {(!ambulance || !dispensary) && <p className="note">{isAdmin ? <>Add the numbers in <a href="#admin">Admin → Contacts</a> with group “{MEDICAL_GROUP}” and names containing “Ambulance” and “Dispensary”.</> : 'The council is adding the campus numbers.'}</p>}
      {med.filter(c => c !== ambulance && c !== dispensary).length > 0 && <div className="ctc" style={{ marginTop: 12 }}>
        {med.filter(c => c !== ambulance && c !== dispensary).map(c => <div key={c.id} className="crd"><div><h4>{c.name}</h4><span className="num">{c.number}</span>{c.note && <span className="meta">{c.note}</span>}</div>
          <div className="acts"><a className="btn" href={tel(c.number)}>Call</a></div></div>)}
      </div>}
      <div className="grid" style={{ marginTop: 22 }}>
        <RequestForm />
        <div>
          <MyRequests uid={uid} />
          {desk && <DeskQueue />}
          {isAdmin && <DeskAdmin />}
        </div>
      </div>
    </section>
  )
}

function RequestForm() {
  const { profile } = useMe()
  const toast = useToast()
  const [items, setItems] = useState('')
  const [notes, setNotes] = useState('')
  const [urgency, setUrgency] = useState<'now' | 'today' | 'tomorrow'>('today')
  const [pickup, setPickup] = useState<'deliver' | 'pickup'>('deliver')
  const [room, setRoom] = useState(profile.hostel ? `Hostel ${profile.hostel}, room ` : '')
  const [phone, setPhone] = useState(profile.phone || '')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!items.trim()) return
    if (pickup === 'deliver' && room.trim().length < 4) return toast('Say where to deliver: hostel and room.')
    setBusy(true)
    const { error } = await supabase.from('medicine_requests').insert({
      items: items.trim().slice(0, 300), notes: notes.trim().slice(0, 300) || null, urgency,
      deliver_to: pickup === 'pickup' ? 'Pick up at the dispensary' : room.trim().slice(0, 120), phone: phone.trim().slice(0, 20) || null,
    })
    setBusy(false)
    if (error) return toast(explain(error.message))
    setItems(''); setNotes('')
    toast('Request sent to the medical desk. You’ll be notified when it’s ready.')
  }
  return (
    <form className="panel stick" onSubmit={submit}>
      <h3>Request medicines</h3>
      <p className="sub">Only you and the medical desk see your requests.</p>
      <label htmlFor="md-items">What do you need?</label>
      <textarea id="md-items" required rows={3} maxLength={300} value={items} onChange={e => setItems(e.target.value)} placeholder="Paracetamol 500 mg, 1 strip; ORS sachets x 4" />
      <label htmlFor="md-notes">Anything the desk should know (optional)</label>
      <input id="md-notes" maxLength={300} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Allergies, prescription photo shared on WhatsApp…" />
      <span className="lab">When</span>
      <Seg value={urgency} onChange={setUrgency} options={[['now', 'Now'], ['today', 'Today'], ['tomorrow', 'Tomorrow']]} />
      <span className="lab">How</span>
      <Seg value={pickup} onChange={setPickup} options={[['deliver', 'Deliver to my room'], ['pickup', 'I’ll pick up']]} />
      {pickup === 'deliver' && <><label htmlFor="md-room">Deliver to</label><input id="md-room" maxLength={120} value={room} onChange={e => setRoom(e.target.value)} placeholder="Hostel K1, room 214" /></>}
      <label htmlFor="md-phone">Phone</label>
      <input id="md-phone" inputMode="tel" maxLength={20} value={phone} onChange={e => setPhone(e.target.value)} placeholder="98xxx xxxxx" />
      <button className="btn pri" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
      <p className="note">For anything serious, call the ambulance or the dispensary above instead.</p>
    </form>
  )
}

function MyRequests({ uid }: { uid: string }) {
  const toast = useToast()
  const list = useLive<Req>('med-mine', () => supabase.from('medicine_requests').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(20) as never, ['medicine_requests'])
  const cancel = async (r: Req) => {
    const { error } = await supabase.from('medicine_requests').update({ status: 'cancelled' }).eq('id', r.id)
    toast(error ? explain(error.message) : 'Request cancelled.')
    list.reload()
  }
  return <div>
    <h3>Your requests</h3>
    <ErrorNote error={list.error} />
    {list.loading ? <Loading /> : list.data.length ? <div className="list" style={{ marginTop: 8 }}>{list.data.map(r => (
      <div className="card" key={r.id}>
        <div className="ch"><h3 style={{ fontSize: 16 }}>{r.items}</h3><span className={'tag ' + STATUS[r.status][1]}>{STATUS[r.status][0]}</span></div>
        <div className="meta">{when(r.created_at)} · {URGENCY[r.urgency]} · {r.deliver_to || ''}</div>
        {r.response && <p className="tip" style={{ marginTop: 8 }}><b>Medical desk:</b> {r.response}</p>}
        {r.status === 'requested' && <div className="acts"><button className="btn" type="button" onClick={() => cancel(r)}>Cancel request</button></div>}
      </div>))}</div> : <Empty>No requests yet.</Empty>}
  </div>
}

/** People on the medical desk: every open request, with status buttons and a reply. */
function DeskQueue() {
  const toast = useToast()
  const list = useLive<Req>('med-desk', () => supabase.from('medicine_requests').select('*, who:profiles!medicine_requests_user_id_fkey(name)')
    .order('created_at', { ascending: false }).limit(100) as never, ['medicine_requests'])
  const [reply, setReply] = useState<Record<string, string>>({})
  const set = async (r: Req, status: Status) => {
    const { error } = await supabase.from('medicine_requests').update({ status, response: (reply[r.id] ?? r.response ?? '').trim().slice(0, 300) || null }).eq('id', r.id)
    toast(error ? explain(error.message) : 'Updated. The student gets a notification.')
    list.reload()
  }
  const open = list.data.filter(r => r.status === 'requested' || r.status === 'ready')
  return <div style={{ marginTop: 24 }}>
    <h3>Medical desk: requests to handle</h3>
    <p className="note" style={{ marginTop: 2 }}>You see this because a council admin added you to the medical desk.</p>
    {open.length ? <div className="list" style={{ marginTop: 8 }}>{open.map(r => {
      const wa = waLink(r.phone)
      return <div className="card" key={r.id}>
        <div className="ch"><h3 style={{ fontSize: 16 }}>{r.items}</h3><span className={'tag ' + (r.urgency === 'now' ? 't-red' : STATUS[r.status][1])}>{r.urgency === 'now' ? 'Urgent' : STATUS[r.status][0]}</span></div>
        <div className="meta">{r.who?.name || 'A student'} · {when(r.created_at)} · {URGENCY[r.urgency]} · {r.deliver_to}</div>
        {r.notes && <p>{r.notes}</p>}
        <input aria-label="Reply to the student" maxLength={300} value={reply[r.id] ?? r.response ?? ''} onChange={e => setReply({ ...reply, [r.id]: e.target.value })} placeholder="Reply (e.g. ready at the dispensary after 5 pm)" style={{ marginTop: 8 }} />
        <div className="acts">
          {r.phone && <a className="btn" href={tel(r.phone)}>Call</a>}
          {wa && <a className="btn" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          <button className="btn" type="button" onClick={() => set(r, 'ready')}>Ready</button>
          <button className="btn" type="button" onClick={() => set(r, 'delivered')}>Delivered</button>
          <button className="btn" type="button" onClick={() => set(r, 'unavailable')}>Not available</button>
        </div>
      </div>
    })}</div> : <Empty>No open requests.</Empty>}
  </div>
}

/** Admins choose who is on the medical desk (requests are private to them and the student). */
function DeskAdmin() {
  const toast = useToast()
  const [rows, setRows] = useState<{ user_id: string; email: string; name: string | null }[] | null>(null)
  const [email, setEmail] = useState('')
  const load = () => supabase.rpc('medical_desk_list').then(({ data, error }) => setRows(error ? [] : (data as never) || []))
  useEffect(() => { load() }, [])
  const set = async (e: string, add: boolean) => {
    const { error } = await supabase.rpc('medical_desk_set', { p_email: e, p_add: add })
    toast(error ? explain(error.message) : add ? 'Added to the medical desk.' : 'Removed from the medical desk.')
    if (!error) setEmail('')
    load()
  }
  return <div className="panel" style={{ marginTop: 24 }}>
    <h3>Medical desk (admins only)</h3>
    <p className="note" style={{ marginTop: 2 }}>Medicine requests are private: only the student and the people listed here see them, not every admin. Add the dispensary staff or a council member who handles them (they must have signed in once).</p>
    {rows === null ? <Loading /> : rows.length ? <div className="list" style={{ margin: '10px 0', gap: 6 }}>{rows.map(r => <div className="ch" key={r.user_id}><span>{r.name || r.email} <span className="meta">· {r.email}</span></span><button className="linkbtn" type="button" onClick={() => set(r.email, false)}>remove</button></div>)}</div>
      : <p className="note err">Nobody is on the medical desk yet, so requests aren’t being seen. Add someone.</p>}
    <form className="sel" onSubmit={e => { e.preventDefault(); if (email.trim()) set(email.trim(), true) }}>
      <div style={{ flex: '1 1 14em' }}><label className="lab" htmlFor="md-desk">Add by email</label><input id="md-desk" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@iimk.ac.in" /></div>
      <button className="btn pri inline" type="submit">Add</button>
    </form>
  </div>
}
