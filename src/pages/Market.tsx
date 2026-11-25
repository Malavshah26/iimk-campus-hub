import { useState } from 'react'
import { useMe } from '../lib/auth'
import { CATEGORY_ICON } from '../lib/icons'
import { deletePhoto, uploadPhoto, useSignedUrls } from '../lib/photos'
import { useRef_ } from '../lib/ref'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useLive } from '../lib/useLive'
import type { Listing, ListingKind } from '../lib/types'
import { dayLabel, norm, rupee, waLink } from '../lib/util'
import { Chips, Empty, ErrorNote, Loading, Seg } from '../components/Bits'
import { PhotoPicker } from '../components/PhotoPicker'
import { Lightbox, Pic } from '../components/Pic'

const CATS = ['Books', 'Electronics', 'Appliances', 'Cycles', 'Furniture & room', 'Clothing', 'Other']
type Unit = 'day' | 'week' | 'month' | 'term'

export function Market() {
  const { uid, profile, isAdmin } = useMe()
  const { ref } = useRef_()
  const toast = useToast()
  const { data, loading, error, reload } = useLive<Listing>('listings',
    () => supabase.from('listings').select('*, poster:profiles!listings_user_id_fkey(name,phone)').order('created_at', { ascending: false }).limit(300) as never,
    ['listings'])
  const url = useSignedUrls(data.map(d => d.photo_path))

  const [kind, setKind] = useState<ListingKind>('sell')
  const [title, setTitle] = useState('')
  const [price, setPrice] = useState('')
  const [unit, setUnit] = useState<Unit>('month')
  const [cat, setCat] = useState('Books')
  const [cond, setCond] = useState('Like new')
  const [hostel, setHostel] = useState(profile.hostel || '')
  const [desc, setDesc] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState('')
  const [filter, setFilter] = useState<'all' | ListingKind>('all')
  const [catF, setCatF] = useState('')
  const [q, setQ] = useState('')
  const [zoom, setZoom] = useState<Listing | null>(null)

  const post = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    let photo_path: string | null = null
    try {
      if (photo) { setBusy('Uploading photo…'); photo_path = await uploadPhoto(uid, photo) }
    } catch (err) { setBusy(''); return toast((err as Error).message) }
    setBusy('Posting…')
    const { error } = await supabase.from('listings').insert({
      kind, title: title.trim().slice(0, 80), price: Math.max(0, Math.round(+price || 0)), unit: kind === 'rent' ? unit : null,
      category: cat, condition: kind === 'want' ? 'Any' : cond, hostel: hostel || null, description: desc.trim().slice(0, 400) || null, photo_path,
    })
    setBusy('')
    if (error) { await deletePhoto(photo_path); return toast('Couldn’t post: ' + error.message) }
    setTitle(''); setPrice(''); setDesc(''); setPhoto(null)
    toast(photo_path ? 'Listed with photo.' : 'Listed.')
    reload()
  }

  const toggle = async (m: Listing) => {
    const { error } = await supabase.from('listings').update({ status: m.status === 'done' ? 'open' : 'done' }).eq('id', m.id)
    if (error) toast(error.message)
    reload()
  }
  const remove = async (m: Listing) => {
    const { error } = await supabase.from('listings').delete().eq('id', m.id)
    if (error) return toast(error.message)
    if (m.user_id === uid) await deletePhoto(m.photo_path)
    reload()
  }

  const term = norm(q)
  const list = data
    .filter(m => (filter === 'all' || m.kind === filter) && (!catF || m.category === catF) && (!term || norm(`${m.title} ${m.description} ${m.category}`).includes(term)))
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done'))

  return (
    <div className="grid">
      <form className="panel stick" onSubmit={post}>
        <h2>Buy, sell or rent</h2>
        <p className="sub">Books, cycles, coolers, room stuff. Deal directly on WhatsApp.</p>
        <Seg value={kind} onChange={setKind} options={[['sell', 'Sell'], ['rent', 'Rent out'], ['want', 'Want']]} />
        <label htmlFor="m-title">What is it?</label>
        <input id="m-title" required maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder="Kotler, Marketing Management" />
        <div className="row2">
          <div><label htmlFor="m-price">{kind === 'want' ? 'Budget (₹)' : kind === 'rent' ? 'Rent (₹)' : 'Price (₹)'}</label>
            <input id="m-price" type="number" inputMode="numeric" min={0} step={10} value={price} onChange={e => setPrice(e.target.value)} placeholder="450" /></div>
          {kind === 'rent' && <div><label htmlFor="m-unit">Per</label>
            <select id="m-unit" value={unit} onChange={e => setUnit(e.target.value as Unit)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option><option value="term">Term</option></select></div>}
        </div>
        <div className="row2">
          <div><label htmlFor="m-cat">Category</label><select id="m-cat" value={cat} onChange={e => setCat(e.target.value)}>{CATS.map(c => <option key={c}>{c}</option>)}</select></div>
          {kind !== 'want' && <div><label htmlFor="m-cond">Condition</label><select id="m-cond" value={cond} onChange={e => setCond(e.target.value)}><option>New</option><option>Like new</option><option>Used</option></select></div>}
        </div>
        <label htmlFor="m-hostel">Your hostel</label>
        <select id="m-hostel" value={hostel} onChange={e => setHostel(e.target.value)}>
          <option value="">Not given</option>{ref.hostels.map(h => <option key={h.code} value={h.code}>Hostel {h.code}</option>)}
        </select>
        <label htmlFor="m-desc">Details</label>
        <textarea id="m-desc" maxLength={400} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Edition, age, what’s included, pickup time…" />
        <span className="lab">Photo (optional)</span>
        <PhotoPicker file={photo} onChange={setPhoto} />
        <button className="btn pri" type="submit" disabled={!!busy}>{busy || 'Post listing'}</button>
      </form>
      <div>
        <ErrorNote error={error} />
        <Chips label="Filter" value={filter} onChange={setFilter} options={[['all', 'All'], ['sell', 'For sale'], ['rent', 'For rent'], ['want', 'Wanted']]} />
        <div className="row2" style={{ marginBottom: 12 }}>
          <input type="search" placeholder="Search listings" aria-label="Search listings" value={q} onChange={e => setQ(e.target.value)} />
          <select aria-label="Category" value={catF} onChange={e => setCatF(e.target.value)}><option value="">All categories</option>{CATS.map(c => <option key={c}>{c}</option>)}</select>
        </div>
        <div className="list">
          {loading ? <Loading /> : list.length ? list.map(m => {
            const mine = m.user_id === uid || isAdmin
            const done = m.status === 'done'
            const wa = waLink(m.poster?.phone)
            return (
              <div className={'card lcard' + (done ? ' closed' : '')} key={m.id}>
                <button type="button" className="th" aria-label={'View photo of ' + m.title} onClick={() => setZoom(m)}><Pic url={url(m.photo_path)} art={CATEGORY_ICON[m.category] || 'box'} alt={m.title} /></button>
                <div>
                  <div className="ch"><h3>{m.title}</h3>
                    {done ? <span className="tag t-mut">{m.kind === 'rent' ? 'Rented' : m.kind === 'want' ? 'Found' : 'Sold'}</span>
                      : m.kind === 'want' ? <span className="tag t-sun">Wanted</span> : <span className="tag t-ok">{m.kind === 'rent' ? 'For rent' : 'For sale'}</span>}</div>
                  <div className="price">{m.price ? <>{m.kind === 'want' && <small>up to </small>}{rupee(m.price)}{m.unit && <small> / {m.unit}</small>}</> : <small>Price on request</small>}</div>
                  <div className="meta">{m.category}{m.condition && m.condition !== 'Any' ? ` · ${m.condition}` : ''}{m.hostel ? ` · Hostel ${m.hostel}` : ''} · {m.poster?.name || 'Someone'} · {dayLabel(m.created_at.slice(0, 10))}</div>
                  {m.description && <p>{m.description}</p>}
                  <div className="acts">
                    {wa && !done && m.user_id !== uid && <a className="btn" href={wa} target="_blank" rel="noopener noreferrer">{m.kind === 'want' ? 'I have one' : 'I’m interested'}: WhatsApp</a>}
                    {mine && <><button className="btn" onClick={() => toggle(m)}>{done ? 'Relist' : m.kind === 'rent' ? 'Mark rented' : m.kind === 'want' ? 'Mark found' : 'Mark sold'}</button>
                      <button className="btn" onClick={() => remove(m)}>Remove</button></>}
                  </div>
                </div>
              </div>
            )
          }) : <Empty>No listings match. Post the first one.</Empty>}
        </div>
      </div>
      {zoom && <Lightbox title={zoom.title} caption={`${zoom.category}${zoom.price ? ' · ' + rupee(zoom.price) : ''}`} url={url(zoom.photo_path)} art={CATEGORY_ICON[zoom.category] || 'box'} onClose={() => setZoom(null)} />}
    </div>
  )
}
