import { useState } from 'react'
import { useMe } from '../lib/auth'
import { deletePhoto, uploadPhoto, useSignedUrls } from '../lib/photos'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useLive } from '../lib/useLive'
import type { LostItem } from '../lib/types'
import { dayLabel, norm, today, waLink } from '../lib/util'
import { Chips, Empty, ErrorNote, Loading, Seg } from '../components/Bits'
import { PhotoPicker } from '../components/PhotoPicker'
import { Lightbox, Pic } from '../components/Pic'

type Filter = 'open' | 'lost' | 'found' | 'done'

export function LostFound() {
  const { uid, isAdmin } = useMe()
  const toast = useToast()
  const { data, loading, error, reload } = useLive<LostItem>('lost',
    () => supabase.from('lost_items').select('*, poster:profiles!lost_items_user_id_fkey(name,phone)').order('created_at', { ascending: false }).limit(300) as never,
    ['lost_items'])
  const url = useSignedUrls(data.map(d => d.photo_path))

  const [kind, setKind] = useState<'lost' | 'found'>('lost')
  const [item, setItem] = useState('')
  const [place, setPlace] = useState('')
  const [date, setDate] = useState(today())
  const [desc, setDesc] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState('')
  const [filter, setFilter] = useState<Filter>('open')
  const [q, setQ] = useState('')
  const [zoom, setZoom] = useState<LostItem | null>(null)

  const post = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!item.trim()) return
    let photo_path: string | null = null
    try {
      if (photo) { setBusy('Uploading photo…'); photo_path = await uploadPhoto(uid, photo) }
    } catch (err) { setBusy(''); return toast((err as Error).message) }
    setBusy('Posting…')
    const { error } = await supabase.from('lost_items').insert({
      kind, item: item.trim().slice(0, 80), place: place.trim().slice(0, 80) || null, item_date: date, description: desc.trim().slice(0, 400) || null, photo_path,
    })
    setBusy('')
    if (error) { await deletePhoto(photo_path); return toast('Couldn’t post: ' + error.message) }
    setItem(''); setPlace(''); setDesc(''); setPhoto(null)
    toast(photo_path ? 'Posted with photo.' : 'Posted.')
    reload()
  }

  const toggle = async (l: LostItem) => {
    const { error } = await supabase.from('lost_items').update({ status: l.status === 'done' ? 'open' : 'done' }).eq('id', l.id)
    if (error) toast(error.message)
    reload()
  }
  const remove = async (l: LostItem) => {
    const { error } = await supabase.from('lost_items').delete().eq('id', l.id)
    if (error) return toast(error.message)
    if (l.user_id === uid) await deletePhoto(l.photo_path)
    reload()
  }

  const term = norm(q)
  const list = data.filter(l => (filter === 'open' ? l.status !== 'done' : filter === 'done' ? l.status === 'done' : l.kind === filter && l.status !== 'done'))
    .filter(l => !term || norm(`${l.item} ${l.place} ${l.description}`).includes(term))

  return (
    <div className="grid">
      <form className="panel stick" onSubmit={post}>
        <h2>Lost or found something?</h2>
        <p className="sub">Post it once. Mark it returned when it’s sorted.</p>
        <Seg value={kind} onChange={setKind} options={[['lost', 'I lost'], ['found', 'I found']]} />
        <label htmlFor="l-item">What is it?</label>
        <input id="l-item" required maxLength={80} value={item} onChange={e => setItem(e.target.value)} placeholder="Blue steel water bottle" />
        <label htmlFor="l-place">Where?</label>
        <input id="l-place" maxLength={80} value={place} onChange={e => setPlace(e.target.value)} placeholder="Library, 2nd floor" />
        <label htmlFor="l-date">When?</label>
        <input id="l-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
        <label htmlFor="l-desc">Details</label>
        <textarea id="l-desc" maxLength={400} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Sticker on the lid, name inside…" />
        <span className="lab">Photo (optional)</span>
        <PhotoPicker file={photo} onChange={setPhoto} />
        <button className="btn pri" type="submit" disabled={!!busy}>{busy || 'Post'}</button>
      </form>
      <div>
        <ErrorNote error={error} />
        <Chips label="Filter" value={filter} onChange={setFilter} options={[['open', 'Open'], ['lost', 'Lost'], ['found', 'Found'], ['done', 'Returned']]} />
        <input type="search" placeholder="Search items or places" aria-label="Search lost and found" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 12 }} />
        <div className="list">
          {loading ? <Loading /> : list.length ? list.map(l => {
            const mine = l.user_id === uid || isAdmin
            const wa = waLink(l.poster?.phone)
            const done = l.status === 'done'
            return (
              <div className="card lcard" key={l.id}>
                <button type="button" className="th" aria-label={'View photo of ' + l.item} onClick={() => setZoom(l)}><Pic url={url(l.photo_path)} art="box" alt={l.item} /></button>
                <div>
                  <div className="ch"><h3>{l.item}</h3>{done ? <span className="tag t-mut">Returned</span> : l.kind === 'found' ? <span className="tag t-ok">Found</span> : <span className="tag t-red">Lost</span>}</div>
                  <div className="meta">{l.place || 'Place not given'} · {dayLabel(l.item_date)} · {l.poster?.name || 'Someone'}</div>
                  {l.description && <p>{l.description}</p>}
                  <div className="acts">
                    {wa && !done && l.user_id !== uid && <a className="btn" href={wa} target="_blank" rel="noopener noreferrer">{l.kind === 'found' ? 'It’s mine' : 'I found it'}: WhatsApp</a>}
                    {mine && <><button className="btn" onClick={() => toggle(l)}>{done ? 'Reopen' : 'Mark returned'}</button><button className="btn" onClick={() => remove(l)}>Remove</button></>}
                  </div>
                </div>
              </div>
            )
          }) : <Empty>Nothing here. Good news, probably.</Empty>}
        </div>
      </div>
      {zoom && <Lightbox title={zoom.item} caption={[zoom.place, dayLabel(zoom.item_date)].filter(Boolean).join(' · ')} url={url(zoom.photo_path)} art="box" onClose={() => setZoom(null)} />}
    </div>
  )
}
