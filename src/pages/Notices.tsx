import { useEffect, useState } from 'react'
import { useMe } from '../lib/auth'
import { explain, supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import type { Notice } from '../lib/types'
import { dayLabel, dstr, today } from '../lib/util'
import { isLive, markSeen, useNotices } from '../lib/notices'
import { Text } from '../components/Text'
import { Empty, ErrorNote, Loading } from '../components/Bits'
import { useFocusItem } from '../lib/focus'
import { AudiencePicker } from '../components/AudiencePicker'
import { audienceLabel, EVERYONE, isEveryone, type Audience } from '../lib/audience'

const posted = (iso: string) => dayLabel(dstr(new Date(iso)))

export function NoticeCard({ n, admin, onChange }: { n: Notice; admin?: boolean; onChange?: () => void }) {
  const toast = useToast()
  const run = async (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    const { error } = await p
    toast(error ? explain(error.message) : ok)
    onChange?.()
  }
  return (
    <div id={'it-' + n.id} className={'card notice' + (n.pinned ? ' pin' : '') + (isLive(n) ? '' : ' closed')}>
      <div className="ch"><h3>{n.title}</h3><span className="lfchips">{!isEveryone(n) && <span className="tag t-mut">For {audienceLabel(n)}</span>}{n.pinned && <span className="tag t-ok">Pinned</span>}</span></div>
      <div className="meta">Council · {posted(n.created_at)}{n.expires_on ? ` · until ${dayLabel(n.expires_on)}` : ''}</div>
      {n.body && <Text text={n.body} />}
      {(n.link || admin) && <div className="acts">
        {n.link && <a className="btn" href={n.link} target="_blank" rel="noopener noreferrer">Open link</a>}
        {admin && <>
          <button className="btn" type="button" onClick={() => run(supabase.from('notices').update({ pinned: !n.pinned }).eq('id', n.id), n.pinned ? 'Unpinned.' : 'Pinned.')}>{n.pinned ? 'Unpin' : 'Pin to top'}</button>
          <button className="btn" type="button" onClick={() => { if (confirm('Delete this notice for everyone?')) run(supabase.from('notices').delete().eq('id', n.id), 'Notice deleted.') }}>Delete</button>
        </>}
      </div>}
    </div>
  )
}

export function Notices() {
  const { isAdmin } = useMe()
  const toast = useToast()
  const { data, loading, error, reload } = useNotices()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [link, setLink] = useState('')
  const [pinned, setPinned] = useState(false)
  const [until, setUntil] = useState('')
  const [aud, setAud] = useState<Audience>(EVERYONE)
  const [busy, setBusy] = useState(false)
  const [old, setOld] = useState(false)
  // Opening this tab counts as reading everything.
  useEffect(() => markSeen(data), [data])

  const post = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    const l = link.trim()
    if (l && !/^https?:\/\//i.test(l)) return toast('Links must start with http:// or https://')
    setBusy(true)
    const { error } = await supabase.from('notices').insert({ title: title.trim().slice(0, 120), body: body.trim().slice(0, 2000) || null, link: l || null, pinned, expires_on: until || null, ...(isEveryone(aud) ? {} : aud) })
    setBusy(false)
    if (error) return toast(explain(error.message))
    setTitle(''); setBody(''); setLink(''); setPinned(false); setUntil(''); setAud(EVERYONE)
    toast(isEveryone(aud) ? 'Notice posted. Everyone with the app open sees it now.' : `Notice posted for ${audienceLabel(aud)}.`)
    reload()
  }

  const live = data.filter(isLive)
  const expired = data.filter(n => !isLive(n))
  useFocusItem(!loading, id => { if (expired.some(n => n.id === id)) setOld(true) })

  const list = (
    <div>
      <ErrorNote error={error} />
      <div className="list">
        {loading ? <Loading /> : live.length ? live.map(n => <NoticeCard key={n.id} n={n} admin={isAdmin} onChange={reload} />) : <Empty>No notices right now.</Empty>}
      </div>
      {expired.length > 0 && <>
        <button className="btn inline" type="button" style={{ marginTop: 14 }} onClick={() => setOld(!old)}>{old ? 'Hide' : 'Show'} older notices ({expired.length})</button>
        {old && <div className="list" style={{ marginTop: 10 }}>{expired.map(n => <NoticeCard key={n.id} n={n} admin={isAdmin} onChange={reload} />)}</div>}
      </>}
    </div>
  )

  if (!isAdmin) return <section><div className="hd"><div><h2>Notices</h2><p className="sub">Announcements from the Students’ Council.</p></div></div>{list}</section>

  return (
    <div className="grid">
      <form className="panel stick" onSubmit={post}>
        <h2>Post a notice</h2>
        <p className="sub">Only council admins see this form.</p>
        <label htmlFor="n-title">Title</label>
        <input id="n-title" required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="Town hall on Friday, 6 pm" />
        <label htmlFor="n-body">Details</label>
        <textarea id="n-body" maxLength={2000} rows={5} value={body} onChange={e => setBody(e.target.value)} placeholder="Where, what to bring, who to contact…" />
        <label htmlFor="n-link">Link (optional)</label>
        <input id="n-link" type="url" maxLength={300} value={link} onChange={e => setLink(e.target.value)} placeholder="https://forms.gle/…" />
        <AudiencePicker id="n-aud" value={aud} onChange={setAud} />
        <label htmlFor="n-until">Show until (optional)</label>
        <input id="n-until" type="date" min={today()} value={until} onChange={e => setUntil(e.target.value)} />
        <label className="ck" style={{ marginTop: 12 }}><input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} /> Pin to the top of everyone’s app</label>
        <button className="btn pri" type="submit" disabled={busy}>{busy ? 'Posting…' : 'Post notice'}</button>
      </form>
      {list}
    </div>
  )
}
