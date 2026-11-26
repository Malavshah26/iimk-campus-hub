import { useState } from 'react'
import { useMe } from '../lib/auth'
import { deletePhoto, uploadPhoto, useSignedUrls } from '../lib/photos'
import { useRef_ } from '../lib/ref'
import { explain, supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useLive } from '../lib/useLive'
import type { Complaint, ComplaintStatus } from '../lib/types'
import { dayLabel, dstr, norm } from '../lib/util'
import { Chips, Empty, ErrorNote, Loading } from '../components/Bits'
import { PhotoPicker } from '../components/PhotoPicker'
import { Lightbox, Pic } from '../components/Pic'
import { Text } from '../components/Text'

export const CATEGORIES = ['Hostel', 'Wi-Fi', 'Mess', 'Laundry', 'Classrooms', 'Transport', 'Other'] as const
const LABEL: Record<ComplaintStatus, string> = { open: 'Open', progress: 'In progress', fixed: 'Fixed' }
const TAG: Record<ComplaintStatus, string> = { open: 't-red', progress: 't-sun', fixed: 't-ok' }
type Filter = 'active' | 'open' | 'progress' | 'fixed' | 'mine'

const ago = (iso: string) => dayLabel(dstr(new Date(iso)))

export function Complaints() {
  const { uid, isAdmin, profile } = useMe()
  const { ref } = useRef_()
  const toast = useToast()
  const { data, loading, error, reload } = useLive<Complaint>('complaints',
    () => supabase.from('complaints').select('*, poster:profiles!complaints_user_id_fkey(name,phone), complaint_votes!complaint_votes_complaint_id_fkey(user_id)')
      .order('created_at', { ascending: false }).limit(400) as never,
    ['complaints', 'complaint_votes'])
  const url = useSignedUrls(data.map(d => d.photo_path))

  const [category, setCategory] = useState<string>('Hostel')
  const [hostel, setHostel] = useState(profile.hostel || '')
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState('')
  const [filter, setFilter] = useState<Filter>('active')
  const [cat, setCat] = useState('All')
  const [q, setQ] = useState('')
  const [zoom, setZoom] = useState<Complaint | null>(null)
  const [replies, setReplies] = useState<Record<string, string>>({})
  const needsHostel = category === 'Hostel' || category === 'Laundry'

  const post = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    // Nudge towards "me too" instead of duplicates.
    const dupe = data.find(c => c.status !== 'fixed' && c.category === category && norm(c.title) === norm(title))
    if (dupe) { setFilter('active'); setQ(title); return toast('Someone has already reported this. Tap “Me too” on it instead.') }
    let photo_path: string | null = null
    try {
      if (photo) { setBusy('Uploading photo…'); photo_path = await uploadPhoto(uid, photo) }
    } catch (err) { setBusy(''); return toast((err as Error).message) }
    setBusy('Sending…')
    const { error } = await supabase.from('complaints').insert({
      category, hostel: needsHostel ? hostel || null : null, title: title.trim().slice(0, 100), details: details.trim().slice(0, 800) || null, photo_path,
    })
    setBusy('')
    if (error) { await deletePhoto(photo_path); return toast(explain(error.message)) }
    setTitle(''); setDetails(''); setPhoto(null)
    toast('Complaint sent to the council. You’ll get an update here.')
    reload()
  }

  const run = async (p: PromiseLike<{ error: { message: string } | null }>, ok?: string) => {
    const { error } = await p
    if (error) toast(explain(error.message))
    else if (ok) toast(ok)
    reload()
  }
  const setStatus = (c: Complaint, status: ComplaintStatus) => {
    const reply = (replies[c.id] ?? c.response ?? '').trim().slice(0, 400)
    run(supabase.from('complaints').update(isAdmin ? { status, response: reply || null } : { status }).eq('id', c.id), `Marked ${LABEL[status].toLowerCase()}.`)
  }
  const remove = async (c: Complaint) => {
    if (!confirm('Delete this complaint?')) return
    const { error } = await supabase.from('complaints').delete().eq('id', c.id)
    if (error) return toast(explain(error.message))
    if (c.user_id === uid) await deletePhoto(c.photo_path)
    reload()
  }

  const term = norm(q)
  const list = data
    .filter(c => filter === 'active' ? c.status !== 'fixed' : filter === 'mine' ? c.user_id === uid : c.status === filter)
    .filter(c => cat === 'All' || c.category === cat)
    .filter(c => !term || norm(`${c.title} ${c.details} ${c.hostel} ${c.category}`).includes(term))
    .sort((a, b) => (filter === 'active' ? b.complaint_votes.length - a.complaint_votes.length : 0) || b.created_at.localeCompare(a.created_at))
  const counts = { open: data.filter(c => c.status === 'open').length, progress: data.filter(c => c.status === 'progress').length }

  return (
    <div className="grid listfirst">
      <form className="panel stick" onSubmit={post}>
        <h2>Report a problem</h2>
        <p className="sub">Goes to the council. Others can add “me too”, so the biggest problems rise to the top.</p>
        <label htmlFor="c-cat">What about?</label>
        <select id="c-cat" value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
        {needsHostel && <>
          <label htmlFor="c-h">Hostel</label>
          <select id="c-h" value={hostel} onChange={e => setHostel(e.target.value)}>
            <option value="">Choose…</option>
            {ref.hostels.map(h => <option key={h.code} value={h.code}>Hostel {h.code}</option>)}
          </select>
        </>}
        <label htmlFor="c-title">Problem</label>
        <input id="c-title" required maxLength={100} value={title} onChange={e => setTitle(e.target.value)} placeholder="No hot water on 2nd floor" />
        <label htmlFor="c-det">Details</label>
        <textarea id="c-det" maxLength={800} value={details} onChange={e => setDetails(e.target.value)} placeholder="Since when, room number, what you’ve tried…" />
        <span className="lab">Photo (optional)</span>
        <PhotoPicker file={photo} onChange={setPhoto} />
        <button className="btn pri" type="submit" disabled={!!busy}>{busy || 'Send complaint'}</button>
        <p className="note">Your name is shown with the complaint.</p>
      </form>
      <div>
        <ErrorNote error={error} />
        <Chips label="Status" value={filter} onChange={setFilter} options={[['active', `Not fixed (${counts.open + counts.progress})`], ['open', 'Open'], ['progress', 'In progress'], ['fixed', 'Fixed'], ['mine', 'Mine']]} />
        <div className="sel">
          <div><label className="lab" htmlFor="c-f">Category</label>
            <select id="c-f" value={cat} onChange={e => setCat(e.target.value)}><option>All</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
          <div style={{ flex: 1 }}><label className="lab" htmlFor="c-q">Search</label>
            <input id="c-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Wi-Fi, K1, water…" /></div>
        </div>
        <div className="list">
          {loading ? <Loading /> : list.length ? list.map(c => {
            const voted = c.complaint_votes.some(v => v.user_id === uid)
            const own = c.user_id === uid
            return (
              <div className={'card' + (c.photo_path ? ' lcard' : '') + (c.status === 'fixed' ? ' closed' : '')} key={c.id}>
                {c.photo_path && <button type="button" className="th" aria-label={'View photo: ' + c.title} onClick={() => setZoom(c)}><Pic url={url(c.photo_path)} art="box" alt={c.title} /></button>}
                <div>
                  <div className="ch"><h3>{c.title}</h3><span className={'tag ' + TAG[c.status]}>{LABEL[c.status]}</span></div>
                  <div className="meta">{c.category}{c.hostel ? ' · Hostel ' + c.hostel : ''} · {c.poster?.name || 'Someone'} · {ago(c.created_at)}{c.complaint_votes.length ? ` · ${c.complaint_votes.length + 1} affected` : ''}</div>
                  {c.details && <Text text={c.details} />}
                  {c.response && <div className="reply"><b>Council:</b> {c.response}</div>}
                  {isAdmin && c.status !== 'fixed' && <textarea className="replybox" aria-label="Reply from the council" maxLength={400} placeholder="Reply (shown to everyone)…"
                    value={replies[c.id] ?? c.response ?? ''} onChange={e => setReplies({ ...replies, [c.id]: e.target.value })} />}
                  <div className="acts">
                    {!own && c.status !== 'fixed' && <button className={'btn' + (voted ? ' on' : '')} type="button" aria-pressed={voted}
                      onClick={() => run(voted ? supabase.from('complaint_votes').delete().eq('complaint_id', c.id).eq('user_id', uid) : supabase.from('complaint_votes').insert({ complaint_id: c.id }))}>
                      {voted ? '✓ Me too' : 'Me too'}</button>}
                    {isAdmin && c.status !== 'progress' && c.status !== 'fixed' && <button className="btn" type="button" onClick={() => setStatus(c, 'progress')}>Mark in progress</button>}
                    {isAdmin && c.status !== 'fixed' && replies[c.id] !== undefined && <button className="btn" type="button" onClick={() => setStatus(c, c.status)}>Save reply</button>}
                    {(own || isAdmin) && c.status !== 'fixed' && <button className="btn" type="button" onClick={() => setStatus(c, 'fixed')}>Mark fixed</button>}
                    {isAdmin && c.status === 'fixed' && <button className="btn" type="button" onClick={() => setStatus(c, 'open')}>Reopen</button>}
                    {(own || isAdmin) && <button className="btn" type="button" onClick={() => remove(c)}>Delete</button>}
                  </div>
                </div>
              </div>
            )
          }) : <Empty>{filter === 'active' ? 'Nothing reported. Everything works, apparently.' : 'Nothing here.'}</Empty>}
        </div>
      </div>
      {zoom && <Lightbox title={zoom.title} caption={[zoom.category, zoom.hostel && 'Hostel ' + zoom.hostel].filter(Boolean).join(' · ')} url={url(zoom.photo_path)} art="box" onClose={() => setZoom(null)} />}
    </div>
  )
}
