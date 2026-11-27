import { useEffect, useRef, useState } from 'react'
import { useMe } from '../lib/auth'
import { deletePhoto, uploadPhoto, useSignedUrls } from '../lib/photos'
import { explain, supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useLive } from '../lib/useLive'
import type { LostFlag, LostItem, LostReply } from '../lib/types'
import { local, norm, saveLocal, today, waLink } from '../lib/util'
import { AREAS, CATS, HELD, KIND_LABEL, REASONS, REPLY_KINDS, TIMES, ago, fmtDate, isStale, matchesFor, placeText, whenText } from '../lib/lostfound'
import { Chips, Empty, ErrorNote, Loading, Seg } from '../components/Bits'
import { PhotoPicker } from '../components/PhotoPicker'
import { Pic } from '../components/Pic'
import { Text } from '../components/Text'

type View = 'board' | 'mine' | 'desk'
type Res = PromiseLike<{ error: { message: string } | null }>
type UrlOf = (p: string | null | undefined) => string | undefined
const DAY = 864e5
const SELECT = '*, poster:profiles!lost_items_user_id_fkey(name,phone)'

export function LostFound() {
  const { uid, isAdmin } = useMe()
  const toast = useToast()
  const items = useLive<LostItem>('lost', () => supabase.from('lost_items').select(SELECT).order('created_at', { ascending: false }).limit(500) as never, ['lost_items'])
  const flags = useLive<LostFlag>('lost-flags-' + isAdmin, () => (isAdmin ? supabase.from('lost_flags').select('*') : Promise.resolve({ data: [], error: null })) as never, isAdmin ? ['lost_flags'] : [])
  const url = useSignedUrls(items.data.map(d => d.photo_path))
  const [view, setView] = useState<View>('board')
  const [openId, setOpenId] = useState<string | null>(null)
  const [form, setForm] = useState<{ kind: 'lost' | 'found'; edit?: LostItem } | null>(null)

  const all = items.data
  const board = all.filter(i => !i.hidden)
  const now = Date.now()
  const nLost = board.filter(i => i.kind === 'lost' && i.status === 'open').length
  const nFound = board.filter(i => i.kind === 'found' && i.status === 'open').length
  const nBack = board.filter(i => i.status === 'done' && i.resolved_at && now - new Date(i.resolved_at).getTime() < 30 * DAY).length
  const mine = all.filter(i => i.user_id === uid)
  const mineMatched = mine.filter(i => matchesFor(i, board).length).length
  const reported = new Set(flags.data.filter(f => all.some(i => i.id === f.item_id)).map(f => f.item_id)).size
  const needsUpdate = all.length > 0 && all.every(i => i.ref === undefined)
  const open = openId ? all.find(i => i.id === openId) : undefined

  const run = async (p: Res, ok: string) => {
    const { error } = await p
    toast(error ? explain(error.message) : ok)
    items.reload(); flags.reload()
    return !error
  }
  const setStatus = (it: LostItem, status: LostItem['status']) =>
    run(supabase.from('lost_items').update({ status }).eq('id', it.id), status === 'done' ? 'Marked reunited. Nice work.' : status === 'closed' ? 'Closed as unclaimed.' : 'Reopened.')
  const setHidden = (it: LostItem, hidden: boolean) =>
    run(supabase.from('lost_items').update({ hidden, hidden_reason: hidden ? 'Hidden by the council' : null }).eq('id', it.id), hidden ? 'Hidden from the board.' : 'Back on the board.')
  const actions = { setStatus, setHidden, run }

  return (
    <section className="lf">
      <div className="lfhero">
        <div>
          <h2>Lost something? Found something?</h2>
          <p className="sub">One board for the whole campus, from the hostels to the library to the shuttle. Post it and the board points out lost and found reports that look like a match.</p>
          <div className="acts">
            <button className="btn lostb" type="button" onClick={() => setForm({ kind: 'lost' })}>I lost something</button>
            <button className="btn foundb" type="button" onClick={() => setForm({ kind: 'found' })}>I found something</button>
          </div>
        </div>
        <div className="ledger" aria-live="polite">
          <div className="l"><b>{items.loading ? '–' : nLost}</b><span>Still lost</span></div>
          <div className="f"><b>{items.loading ? '–' : nFound}</b><span>Found, waiting for owner</span></div>
          <div><b>{items.loading ? '–' : nBack}</b><span>Reunited in the last 30 days</span></div>
        </div>
      </div>
      {needsUpdate && isAdmin && <div className="status show">Lost &amp; found needs the latest database update: run <code>supabase/migrations/0007_lost_found.sql</code> in the Supabase SQL Editor.</div>}
      <Chips label="Lost & found view" value={view} onChange={setView} options={[
        ['board', 'Board'], ['mine', `My posts${mineMatched ? ` · ${mineMatched} with matches` : ''}`],
        ...(isAdmin ? [['desk', `Desk${reported ? ` · ${reported} reported` : ''}`] as [View, string]] : []),
      ]} />
      <ErrorNote error={items.error} />
      {view === 'board' && <Board items={board} loading={items.loading} url={url} onOpen={setOpenId} onPost={k => setForm({ kind: k })} />}
      {view === 'mine' && <Mine items={mine} board={board} url={url} onOpen={setOpenId} onPost={k => setForm({ kind: k })} act={actions} />}
      {view === 'desk' && isAdmin && <Desk items={all} flags={flags.data} url={url} onOpen={setOpenId} act={actions} />}
      {open && <ItemView it={open} board={board} url={url} onOpen={setOpenId} onClose={() => setOpenId(null)} act={actions}
        onEdit={() => { setOpenId(null); setForm({ kind: open.kind, edit: open }) }} />}
      {form && <PostForm kind={form.kind} edit={form.edit} url={url} onClose={() => setForm(null)}
        onSaved={id => { setForm(null); items.reload(); setOpenId(id) }} />}
    </section>
  )
}

/* ------------------------------------------------------------------ pieces */

const Pill = ({ kind }: { kind: 'lost' | 'found' }) => <span className={'pill ' + kind}>{kind === 'found' ? 'Found' : 'Lost'}</span>

function Photo({ it, url }: { it: LostItem; url: UrlOf }) {
  return <div className="lfph">{it.photo_path ? <Pic url={url(it.photo_path)} art="box" alt={it.item} /> : <span className="lftag">{CATS[it.category || 'other'] || 'Item'}</span>}</div>
}

function StatusChips({ it }: { it: LostItem }) {
  const c: [string, string][] = []
  if (it.status === 'done') c.push(['t-ok', 'Reunited'])
  if (it.status === 'closed') c.push(['t-mut', 'Closed, unclaimed'])
  if (it.kind === 'found' && it.status === 'open' && (it.held_at === 'security' || it.held_at === 'admin')) c.push(['t-ok', it.held_at === 'security' ? 'At security, main gate' : 'At the admin office'])
  if (isStale(it)) c.push(['t-sun', '30+ days'])
  if (it.hidden) c.push(['t-red', 'Hidden by the council'])
  return c.length ? <div className="lfchips">{c.map(([k, t]) => <span key={t} className={'tag ' + k}>{t}</span>)}</div> : null
}

/* ------------------------------------------------------------------ board */

function Board({ items, loading, url, onOpen, onPost }: { items: LostItem[]; loading: boolean; url: UrlOf; onOpen: (id: string) => void; onPost: (k: 'lost' | 'found') => void }) {
  const [q, setQ] = useState('')
  const [type, setType] = useState<'all' | 'lost' | 'found'>('all')
  const [cat, setCat] = useState('')
  const [area, setArea] = useState('')
  const [status, setStatus] = useState<'open' | 'done' | 'all'>('open')
  const words = norm(q).split(/\s+/).filter(Boolean)
  const list = items.filter(it =>
    (type === 'all' || it.kind === type) && (!cat || (it.category || 'other') === cat) && (!area || it.area === area)
    && (status === 'all' || it.status === status)
    && (!words.length || words.every(w => norm([it.item, it.description, it.place, it.ref, CATS[it.category || 'other'], it.area ? AREAS[it.area] : ''].join(' ')).includes(w))))
  const clear = () => { setQ(''); setType('all'); setCat(''); setArea(''); setStatus('open') }

  if (loading) return <Loading />
  if (!items.length) return <>
    <Empty>Nothing reported yet. Lost a charger in the library or picked up an ID card near the mess? Post it and it shows up here for everyone on campus.</Empty>
    <Steps />
  </>
  return (
    <div>
      <div className="lftools">
        <input type="search" aria-label="Search lost and found" placeholder="Search: AirPods, ID card, blue umbrella, LF-2611…" value={q} onChange={e => setQ(e.target.value)} />
        <Seg value={type} onChange={setType} options={[['all', 'All'], ['lost', 'Lost'], ['found', 'Found']]} />
        <select aria-label="Category" value={cat} onChange={e => setCat(e.target.value)}><option value="">All categories</option>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select aria-label="Place" value={area} onChange={e => setArea(e.target.value)}><option value="">Anywhere on campus</option>{Object.entries(AREAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select aria-label="Status" value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="open">Open only</option><option value="done">Reunited</option><option value="all">All posts</option></select>
      </div>
      {list.length ? <div className="lfgrid">{list.map(it => (
        <button key={it.id} type="button" className={'lfcard' + (it.status !== 'open' ? ' done' : '')} onClick={() => onOpen(it.id)} aria-label={(it.kind === 'found' ? 'Found: ' : 'Lost: ') + it.item}>
          <Photo it={it} url={url} />
          <div className="lfbody">
            <div className="ch"><Pill kind={it.kind} /><span className="ref">{it.ref}</span></div>
            <h3>{it.item}</h3>
            <p className="meta">{placeText(it)} · {whenText(it)}</p>
            <StatusChips it={it} />
            <p className="by">{it.poster?.name || 'Someone'} · {ago(it.created_at)}</p>
          </div>
        </button>))}</div>
        : <Empty>No posts match these filters. <button className="linkbtn" type="button" onClick={clear}>Clear filters</button></Empty>}
      {status === 'open' && list.length > 0 && list.length < 4 && <div className="acts"><button className="btn lostb" type="button" onClick={() => onPost('lost')}>I lost something</button><button className="btn foundb" type="button" onClick={() => onPost('found')}>I found something</button></div>}
    </div>
  )
}

const Steps = () => <div className="lfsteps">
  <div><b>STEP 1</b><h4>Post it</h4><p>Say what it is, where and when. Add a photo if you have one.</p></div>
  <div><b>STEP 2</b><h4>Check matches</h4><p>Each post lists lost or found reports that look similar. Respond, or WhatsApp the poster.</p></div>
  <div><b>STEP 3</b><h4>Verify and hand over</h4><p>Finders ask about a detail only the owner would know. Mark the post reunited once it’s back.</p></div>
</div>

/* ------------------------------------------------------------------ my posts & desk */

type Act = { setStatus: (it: LostItem, s: LostItem['status']) => Promise<boolean>; setHidden: (it: LostItem, h: boolean) => Promise<boolean>; run: (p: Res, ok: string) => Promise<boolean> }

function Row({ it, url, onOpen, children, extra }: { it: LostItem; url: UrlOf; onOpen: (id: string) => void; children: React.ReactNode; extra?: React.ReactNode }) {
  return <div className="lfrow">
    <Photo it={it} url={url} />
    <div style={{ minWidth: 0 }}>
      <h3><button type="button" className="linkbtn plain" onClick={() => onOpen(it.id)}>{it.item}</button></h3>
      <div className="meta lfmeta"><Pill kind={it.kind} /><span className="ref">{it.ref}</span><span>{placeText(it)} · {fmtDate(it.item_date)}</span>{extra}</div>
      <StatusChips it={it} />
    </div>
    <div className="racts">{children}</div>
  </div>
}

function Mine({ items, board, url, onOpen, onPost, act }: { items: LostItem[]; board: LostItem[]; url: UrlOf; onOpen: (id: string) => void; onPost: (k: 'lost' | 'found') => void; act: Act }) {
  if (!items.length) return <><Empty>You haven’t posted anything. When you report a lost or found item, you can track it here and see posts that might match it.</Empty>
    <div className="acts"><button className="btn lostb" type="button" onClick={() => onPost('lost')}>I lost something</button><button className="btn foundb" type="button" onClick={() => onPost('found')}>I found something</button></div></>
  const row = (it: LostItem) => {
    const m = matchesFor(it, board).length
    return <Row key={it.id} it={it} url={url} onOpen={onOpen} extra={m ? <span className="tag t-ok">{m} possible match{m > 1 ? 'es' : ''}</span> : null}>
      <button className="btn" type="button" onClick={() => onOpen(it.id)}>Open</button>
      {it.status === 'open'
        ? <button className="btn" type="button" onClick={() => act.setStatus(it, 'done')}>{it.kind === 'lost' ? 'Got it back' : 'Returned'}</button>
        : <button className="btn" type="button" onClick={() => act.setStatus(it, 'open')}>Reopen</button>}
    </Row>
  }
  const open = items.filter(i => i.status === 'open'), done = items.filter(i => i.status !== 'open')
  return <div>
    <div className="lfsect"><h3>Open</h3><p className="note">{open.length ? 'Check matches and responses on each post. Mark it once the item is back with its owner.' : 'Nothing open right now.'}</p><div className="list">{open.map(row)}</div></div>
    {done.length > 0 && <div className="lfsect"><h3>Closed</h3><div className="list">{done.map(row)}</div></div>}
  </div>
}

function Desk({ items, flags, url, onOpen, act }: { items: LostItem[]; flags: LostFlag[]; url: UrlOf; onOpen: (id: string) => void; act: Act }) {
  const byItem = new Map<string, LostFlag[]>()
  for (const f of flags) byItem.set(f.item_id, [...(byItem.get(f.item_id) || []), f])
  const reported = items.filter(i => byItem.has(i.id))
  const atDesk = items.filter(i => i.kind === 'found' && i.status === 'open' && !i.hidden && (i.held_at === 'security' || i.held_at === 'admin'))
  const old = items.filter(i => isStale(i) && !i.hidden)
  const hidden = items.filter(i => i.hidden && !byItem.has(i.id))
  const open = (it: LostItem) => <button className="btn" type="button" onClick={() => onOpen(it.id)}>Open</button>
  const sect = (title: string, desc: string, empty: string, rows: React.ReactNode[]) =>
    <div className="lfsect"><h3>{title}</h3><p className="note">{rows.length ? desc : empty}</p><div className="list">{rows}</div></div>
  return <div>
    {sect('Reported posts', 'Posts students flagged. Hide anything fake or that shares private details.', 'No reports. All clear.', reported.map(it => {
      const fs = byItem.get(it.id)!
      return <Row key={it.id} it={it} url={url} onOpen={onOpen} extra={<span className="tag t-red">{fs.length} report{fs.length > 1 ? 's' : ''}: {[...new Set(fs.map(f => REASONS[f.reason] || 'Other'))].join(', ')}</span>}>
        {open(it)}
        <button className="btn" type="button" onClick={() => act.setHidden(it, !it.hidden)}>{it.hidden ? 'Restore' : 'Hide'}</button>
        <button className="btn" type="button" onClick={() => act.run(supabase.from('lost_flags').delete().eq('item_id', it.id), 'Reports dismissed.')}>Dismiss reports</button>
      </Row>
    }))}
    {sect('Held at the desk', 'Found items handed to security or the admin office. Check ID before handing over.', 'Nothing handed in right now.', atDesk.map(it =>
      <Row key={it.id} it={it} url={url} onOpen={onOpen}>{open(it)}<button className="btn" type="button" onClick={() => act.setStatus(it, 'done')}>Handed to owner</button></Row>))}
    {sect('Open for 30+ days', 'Old posts. Close the ones nobody has claimed so the board stays useful.', 'No old posts.', old.map(it =>
      <Row key={it.id} it={it} url={url} onOpen={onOpen}>{open(it)}<button className="btn" type="button" onClick={() => act.setStatus(it, 'closed')}>Close as unclaimed</button></Row>))}
    {sect('Hidden posts', 'Hidden from the board but kept for the record.', 'No hidden posts.', hidden.map(it =>
      <Row key={it.id} it={it} url={url} onOpen={onOpen}>{open(it)}<button className="btn" type="button" onClick={() => act.setHidden(it, false)}>Restore</button></Row>))}
  </div>
}

/* ------------------------------------------------------------------ one post */

function Modal({ label, head, children, onClose, foot }: { label: string; head: React.ReactNode; children: React.ReactNode; onClose: () => void; foot?: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!box.current?.contains(document.activeElement)) box.current?.focus()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])
  return <div className="modal" role="dialog" aria-modal="true" aria-label={label} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="mcard" ref={box} tabIndex={-1}>
      <div className="mhead">{head}<button type="button" className="mx" aria-label="Close" onClick={onClose}>×</button></div>
      {children}
      {foot && <div className="mfoot">{foot}</div>}
    </div>
  </div>
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return <button type="button" className="btn tiny" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }, () => {})}>{done ? 'Copied' : 'Copy'}</button>
}

function ItemView({ it, board, url, onOpen, onClose, onEdit, act }: { it: LostItem; board: LostItem[]; url: UrlOf; onOpen: (id: string) => void; onClose: () => void; onEdit: () => void; act: Act }) {
  const { uid, isAdmin } = useMe()
  const toast = useToast()
  const [confirmDel, setConfirmDel] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('spam')
  useEffect(() => { setConfirmDel(false); setReporting(false) }, [it.id])
  const mine = it.user_id === uid, can = mine || isAdmin
  const wa = waLink(it.poster?.phone)
  const ms = matchesFor(it, board)

  const remove = async () => {
    if (await act.run(supabase.from('lost_items').delete().eq('id', it.id), 'Post deleted.')) {
      if (mine) await deletePhoto(it.photo_path)
      onClose()
    }
  }
  const report = async () => {
    const { error } = await supabase.from('lost_flags').upsert({ item_id: it.id, user_id: uid, reason }, { onConflict: 'item_id,user_id' })
    if (error) return toast(explain(error.message))
    setReporting(false)
    toast('Reported. The council will take a look.')
  }

  return (
    <Modal label={it.item} onClose={onClose} head={<span className="ref">{it.ref}{it.ref ? ' · ' : ''}posted {ago(it.created_at)}</span>}>
      <div className="mbody">
        {it.photo_path && <div className="lfbig"><Pic url={url(it.photo_path)} art="box" alt={it.item} /></div>}
        <div><div className="lfchips"><Pill kind={it.kind} /><StatusChips it={it} /></div><h2 style={{ marginTop: 6 }}>{it.item}</h2></div>
        {it.description && <Text text={it.description} />}
        <dl className="facts">
          <dt>Category</dt><dd>{CATS[it.category || 'other']}</dd>
          <dt>{it.kind === 'found' ? 'Found at' : 'Lost at'}</dt><dd>{placeText(it)}</dd>
          <dt>When</dt><dd>{whenText(it)}</dd>
          {it.kind === 'found' && <><dt>Now</dt><dd>{HELD[it.held_at || 'finder']}</dd></>}
          <dt>Posted by</dt><dd>{it.poster?.name || 'A campus member'}{mine ? ' (you)' : ''}
            {wa && !mine && <a className="btn tiny" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
            {it.poster?.phone && !mine && <Copy text={it.poster.phone} />}</dd>
          {it.contact && <><dt>Contact</dt><dd>{it.contact} <Copy text={it.contact} /></dd></>}
        </dl>
        {it.kind === 'found' && it.status === 'open' && mine && <p className="tip">Before handing it over, ask the person to describe a detail you left out of this post, like a sticker, the lock screen or what’s inside.</p>}
        <div className="acts" style={{ marginTop: 0 }}>
          {can && (it.status === 'open'
            ? <button className="btn" type="button" onClick={() => act.setStatus(it, 'done')}>{it.kind === 'lost' ? 'I got it back' : 'Returned to owner'}</button>
            : <button className="btn" type="button" onClick={() => act.setStatus(it, 'open')}>Reopen</button>)}
          {can && <button className="btn" type="button" onClick={onEdit}>Edit</button>}
          {can && (confirmDel
            ? <><button className="btn danger" type="button" onClick={remove}>Tap again to delete</button><button className="btn" type="button" onClick={() => setConfirmDel(false)}>Keep</button></>
            : <button className="btn" type="button" onClick={() => setConfirmDel(true)}>Delete</button>)}
          {isAdmin && <button className="btn" type="button" onClick={() => act.setHidden(it, !it.hidden)}>{it.hidden ? 'Restore to board' : 'Hide from board'}</button>}
          {!mine && !isAdmin && (reporting
            ? <span className="acts" style={{ margin: 0 }}>
                <select aria-label="Reason" value={reason} onChange={e => setReason(e.target.value)} style={{ width: 'auto' }}>{Object.entries(REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <button className="btn" type="button" onClick={report}>Send report</button>
                <button className="btn" type="button" onClick={() => setReporting(false)}>Cancel</button>
              </span>
            : <button className="linkbtn" type="button" onClick={() => setReporting(true)}>Report this post</button>)}
        </div>
        {it.status === 'open' && <div>
          <h3 className="lfh">{it.kind === 'lost' ? 'Found items that look similar' : 'Lost reports that look similar'}</h3>
          {ms.length ? <div className="list" style={{ gap: 6 }}>{ms.map(m => (
            <button key={m.id} type="button" className="mitem" onClick={() => onOpen(m.id)}>
              <Photo it={m} url={url} />
              <div style={{ minWidth: 0 }}><b>{m.item}</b><span>{m.kind === 'found' ? 'Found' : 'Lost'} · {placeText(m)} · {fmtDate(m.item_date)}</span></div>
            </button>))}</div>
            : <p className="note" style={{ marginTop: 0 }}>{it.kind === 'lost'
              ? 'No similar found items yet. New found posts are checked against yours, and you get a notification if one looks like it.'
              : 'No similar lost reports yet. The owner may not have posted; keep it safe or hand it to security.'}</p>}
        </div>}
      </div>
      <Replies it={it} />
    </Modal>
  )
}

function Replies({ it }: { it: LostItem }) {
  const { uid, isAdmin } = useMe()
  const toast = useToast()
  const list = useLive<LostReply>('lost-replies-' + it.id, () => supabase.from('lost_replies').select('*, who:profiles!lost_replies_user_id_fkey(name)').eq('item_id', it.id).order('created_at') as never, ['lost_replies'])
  // The poster can only comment on their own post ("This is mine" makes no sense there).
  const kinds: [string, string][] = it.user_id === uid ? [['note', 'Comment']] : REPLY_KINDS[it.kind]
  const [kind, setKind] = useState(kinds[0][0])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { setKind(kinds[0][0]); setBody('') }, [it.id, it.kind]) // eslint-disable-line react-hooks/exhaustive-deps
  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!body.trim()) return toast('Write something first.')
    setBusy(true)
    const { error } = await supabase.from('lost_replies').insert({ item_id: it.id, kind, body: body.trim().slice(0, 500) })
    setBusy(false)
    if (error) return toast(explain(error.message))
    setBody('')
    list.reload()
  }
  const del = async (id: string) => {
    const { error } = await supabase.from('lost_replies').delete().eq('id', id)
    if (error) toast(explain(error.message))
    list.reload()
  }
  const rs = [...list.data].sort((a, b) => a.created_at.localeCompare(b.created_at))
  return (
    <section className="thread">
      <h3 className="lfh">Responses {rs.length > 0 && <span className="meta">({rs.length})</span>}</h3>
      {list.error ? <p className="note">{explain(list.error)}</p> : rs.length ? rs.map(r => (
        <div key={r.id} className="reply">
          <div className="rh">{r.user_id === uid ? 'You' : r.who?.name || 'A campus member'}
            {KIND_LABEL[r.kind] && <span className={'tag ' + (r.kind === 'claim' || r.kind === 'found' ? 't-ok' : 't-mut')}>{KIND_LABEL[r.kind]}</span>}
            <span className="meta">{ago(r.created_at)}</span>
            {(r.user_id === uid || isAdmin) && <button type="button" className="linkbtn small" onClick={() => del(r.id)}>delete</button>}</div>
          <p>{r.body}</p>
        </div>)) : <p className="note" style={{ marginTop: 0 }}>No responses yet.</p>}
      {it.status === 'open' && !it.hidden && <form className="rform" onSubmit={send}>
        {kinds.length > 1 && <select aria-label="Response type" value={kind} onChange={e => setKind(e.target.value)}>{kinds.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>}
        <textarea aria-label="Your response" rows={2} maxLength={500} value={body} onChange={e => setBody(e.target.value)} placeholder="Write a response" />
        <p className="note" style={{ marginTop: 0 }}>{it.kind === 'found'
          ? 'If it’s yours, say so here, then contact the finder. Don’t post the identifying detail publicly; they’ll ask you.'
          : 'Seen it or picked it up? Say where, and contact the owner if you have it.'}</p>
        <button className="btn pri inline" type="submit" disabled={busy}>{busy ? 'Posting…' : 'Post response'}</button>
      </form>}
    </section>
  )
}

/* ------------------------------------------------------------------ post / edit */

function PostForm({ kind: k0, edit, url, onClose, onSaved }: { kind: 'lost' | 'found'; edit?: LostItem; url: UrlOf; onClose: () => void; onSaved: (id: string) => void }) {
  const { uid, profile } = useMe()
  const [kind, setKind] = useState<'lost' | 'found'>(edit?.kind || k0)
  const [item, setItem] = useState(edit?.item || '')
  const [category, setCategory] = useState(edit?.category || 'electronics')
  const [date, setDate] = useState(edit?.item_date || today())
  const [area, setArea] = useState(edit?.area || 'classrooms')
  const [time, setTime] = useState(edit?.time_of_day || 'unsure')
  const [spot, setSpot] = useState(edit?.place || '')
  const [desc, setDesc] = useState(edit?.description || '')
  const [held, setHeld] = useState(edit?.held_at || 'finder')
  const [contact, setContact] = useState(edit ? edit.contact || '' : local('hub.lfContact', ''))
  const [photo, setPhoto] = useState<File | null>(null)
  const [dropOld, setDropOld] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const found = kind === 'found'

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const fail = (m: string) => { setErr(m); return undefined }
    if (item.trim().length < 3) return fail('Say what the item is, for example “Blue Milton bottle”.')
    if (!date) return fail('Pick the date, or your best guess.')
    if (date > today()) return fail('The date can’t be in the future.')
    if (!profile.phone && contact.trim().length < 4) return fail('Add a way for people to reach you: a phone number or hostel room (or add your WhatsApp number in Profile).')
    setErr('')
    let photo_path = edit && !dropOld ? edit.photo_path : null
    try {
      if (photo) { setBusy('Uploading photo…'); photo_path = await uploadPhoto(uid, photo) }
    } catch (ex) { setBusy(''); return fail((ex as Error).message) }
    setBusy('Saving…')
    const row = {
      kind, item: item.trim().slice(0, 80), category, item_date: date, area, time_of_day: time, place: spot.trim().slice(0, 80) || null,
      description: desc.trim().slice(0, 600) || null, held_at: found ? held : null, contact: contact.trim().slice(0, 120) || null, photo_path,
    }
    const res = edit
      ? await supabase.from('lost_items').update(row).eq('id', edit.id).select('id').single()
      : await supabase.from('lost_items').insert(row).select('id').single()
    setBusy('')
    if (res.error) {
      if (photo) await deletePhoto(photo_path)
      return fail(explain(res.error.message))
    }
    if (edit?.photo_path && edit.photo_path !== photo_path && edit.user_id === uid) await deletePhoto(edit.photo_path)
    saveLocal('hub.lfContact', contact.trim())
    onSaved((res.data as { id: string } | null)?.id || edit?.id || '')
  }

  return (
    <Modal label={edit ? 'Edit post' : found ? 'Report a found item' : 'Report a lost item'} onClose={onClose}
      head={<h2 className="mh">{edit ? 'Edit post' : found ? 'Report a found item' : 'Report a lost item'}</h2>}>
      <form onSubmit={submit} id="lf-form">
        <div className="mbody">
          <div className="typepick"><Seg value={kind} onChange={setKind} options={[['lost', 'I lost something'], ['found', 'I found something']]} /></div>
          <label htmlFor="lf-item">What is it?</label>
          <input id="lf-item" required maxLength={80} value={item} onChange={e => setItem(e.target.value)} placeholder="Black JBL earphones in a grey case" autoFocus />
          <div className="row2">
            <div><label htmlFor="lf-cat">Category</label><select id="lf-cat" value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label htmlFor="lf-date">{found ? 'When did you find it?' : 'When did you lose it?'}</label><input id="lf-date" type="date" max={today()} value={date} onChange={e => setDate(e.target.value)} /></div>
          </div>
          <div className="row2">
            <div><label htmlFor="lf-area">{found ? 'Where did you find it?' : 'Where did you lose it?'}</label><select id="lf-area" value={area} onChange={e => setArea(e.target.value)}>{Object.entries(AREAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><label htmlFor="lf-time">Time of day</label><select id="lf-time" value={time} onChange={e => setTime(e.target.value)}>{Object.entries(TIMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          </div>
          <label htmlFor="lf-spot">Exact spot <span className="meta">(optional)</span></label>
          <input id="lf-spot" maxLength={80} value={spot} onChange={e => setSpot(e.target.value)} placeholder="Classroom B1, back row" />
          <label htmlFor="lf-desc">Description</label>
          <textarea id="lf-desc" rows={3} maxLength={600} value={desc} onChange={e => setDesc(e.target.value)}
            placeholder={found ? 'Colour, brand, condition. Leave out one detail so you can check the real owner.' : 'Colour, brand, stickers, what was inside. More detail means better matches.'} />
          <p className="note" style={{ marginTop: 4 }}>{found ? 'Keep one identifying detail to yourself. Ask whoever claims it to describe it before you hand it over.' : 'Mention anything distinctive: a case, a name tag, a scratch.'}</p>
          {found && <><label htmlFor="lf-held">Where is it now?</label>
            <select id="lf-held" value={held} onChange={e => setHeld(e.target.value as typeof held)}>{Object.entries(HELD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></>}
          <span className="lab">Photo <span className="meta">(optional)</span></span>
          {edit?.photo_path && !dropOld && !photo && <div className="acts" style={{ marginTop: 0, alignItems: 'center' }}>
            <span className="lfthumb"><Pic url={url(edit.photo_path)} art="box" alt="Current photo" /></span>
            <button className="btn" type="button" onClick={() => setDropOld(true)}>Remove photo</button></div>}
          <PhotoPicker file={photo} onChange={setPhoto} />
          <label htmlFor="lf-contact">{profile.phone ? 'Another way to reach you (optional)' : 'How can people reach you?'}</label>
          <input id="lf-contact" maxLength={120} value={contact} onChange={e => setContact(e.target.value)} placeholder="Hostel K1, room 214" />
          <p className="note" style={{ marginTop: 4 }}>{profile.phone ? 'Your name and the WhatsApp number from your profile are shown on the post.' : 'Shown to everyone on campus. Or add your WhatsApp number in Profile.'}</p>
          {err && <p className="note err" role="alert">{err}</p>}
        </div>
        <div className="mfoot">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn pri inline" type="submit" disabled={!!busy}>{busy || (edit ? 'Save changes' : 'Post')}</button>
        </div>
      </form>
    </Modal>
  )
}
