import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMe } from '../lib/auth'
import { explain, supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useLive } from '../lib/useLive'
import { markSeen, myRooms } from '../lib/chat'
import { dayLabel, dstr, hhmm, local, saveLocal } from '../lib/util'
import { Badge, Chips, Empty, ErrorNote, Loading } from '../components/Bits'

interface Msg { id: number; room: string; user_id: string; body: string; created_at: string; who: { name: string } | null }
const REASONS: [string, string][] = [['abuse', 'Abusive'], ['spam', 'Spam'], ['private', 'Shares private info'], ['other', 'Something else']]

export function Chat() {
  const { uid, profile, isAdmin } = useMe()
  const rooms = myRooms(profile)
  const [room, setRoomRaw] = useState(() => { const r = local('hub.chatRoom', ''); return rooms.some(x => x.id === r) ? r : rooms[0].id })
  const setRoom = (r: string) => { setRoomRaw(r); saveLocal('hub.chatRoom', r) }
  const cur = rooms.find(r => r.id === room) || rooms[0]

  return (
    <section>
      <div className="hd"><div><h2>Chat</h2><p className="sub">Your section and your hostel. Everyone in the room sees every message, so be kind; report anything abusive.</p></div></div>
      {rooms.length > 1 && <Chips label="Room" value={cur.id} onChange={setRoom} options={rooms.map(r => [r.id, r.label] as [string, string])} />}
      {!profile.hostel && <p className="note" style={{ margin: '-4px 0 12px' }}>Set your hostel in <a href="#profile">Profile</a> to join your hostel’s chat.</p>}
      <Room key={cur.id} room={cur.id} label={cur.label} uid={uid} />
      {isAdmin && <Reported />}
    </section>
  )
}

function Room({ room, label, uid }: { room: string; label: string; uid: string }) {
  const toast = useToast()
  const msgs = useLive<Msg>('chat-' + room, () => supabase.from('chat_messages')
    .select('id,room,user_id,body,created_at,who:profiles!chat_messages_user_id_fkey(name)')
    .eq('room', room).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(150) as never, ['chat_messages'])
  const list = [...msgs.data].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [reporting, setReporting] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)

  // Keep the newest message in view (unless the student scrolled up to read older ones).
  useLayoutEffect(() => {
    const el = box.current
    if (el && atBottom.current) el.scrollTop = el.scrollHeight
  }, [list.length])
  useEffect(() => { const last = list[list.length - 1]; if (last) markSeen(room, last.created_at) }, [list, room])

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    const { error } = await supabase.from('chat_messages').insert({ room, body: body.slice(0, 1000) })
    setBusy(false)
    if (error) return toast(explain(error.message))
    setText('')
    atBottom.current = true
    msgs.reload()
  }
  const remove = async (id: number) => {
    const { error } = await supabase.from('chat_messages').delete().eq('id', id)
    if (error) toast(explain(error.message))
    msgs.reload()
  }
  const report = async (id: number, reason: string) => {
    const { error } = await supabase.from('chat_reports').upsert({ message_id: id, reason }, { onConflict: 'message_id,user_id' })
    setReporting(null)
    toast(error ? explain(error.message) : 'Reported. The council will take a look.')
  }

  let lastDay = ''
  return (
    <div className="chatwrap">
      <div className="chathead"><b>{label}</b><span className="meta">{list.length ? `${list.length} recent message${list.length === 1 ? '' : 's'}` : ''}</span></div>
      <ErrorNote error={msgs.error} />
      <div className="chatlog" ref={box} onScroll={e => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60 }}>
        {msgs.loading ? <Loading /> : !list.length ? <Empty>No messages yet. Say hello to {label}.</Empty> : list.map((m, i) => {
          const day = dstr(new Date(m.created_at))
          const showDay = day !== lastDay
          lastDay = day
          const mine = m.user_id === uid
          const sameAsPrev = i > 0 && list[i - 1].user_id === m.user_id && !showDay
          return <Fragment key={m.id}>
            {showDay && <div className="chatday"><span>{dayLabel(day)}</span></div>}
            <div className={'msg' + (mine ? ' mine' : '') + (sameAsPrev ? ' cont' : '')}>
              {!mine && !sameAsPrev && <b className="msgwho">{m.who?.name || 'Someone'}</b>}
              <div className="bubble">{m.body}<span className="tm">{hhmm(m.created_at)}</span></div>
              <div className="msgacts">
                {mine ? <button type="button" className="linkbtn small" onClick={() => { if (confirm('Delete this message for everyone?')) remove(m.id) }}>delete</button>
                  : reporting === m.id
                    ? <span className="acts" style={{ margin: 0 }}>{REASONS.map(([k, l]) => <button key={k} type="button" className="btn tiny" onClick={() => report(m.id, k)}>{l}</button>)}<button type="button" className="linkbtn small" onClick={() => setReporting(null)}>cancel</button></span>
                    : <button type="button" className="linkbtn small" onClick={() => setReporting(m.id)}>report</button>}
              </div>
            </div>
          </Fragment>
        })}
      </div>
      <form className="composer" onSubmit={send}>
        <textarea aria-label={`Message ${label}`} rows={1} maxLength={1000} value={text} placeholder={`Message ${label}`}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        <button className="btn pri inline" type="submit" disabled={busy || !text.trim()}>Send</button>
      </form>
    </div>
  )
}

/** Admins: messages students reported, with remove / dismiss. Admins never browse rooms otherwise. */
function Reported() {
  const toast = useToast()
  const [rows, setRows] = useState<{ id: number; room: string; body: string; author: string | null; created_at: string; reports: number; reasons: string[] }[] | null>(null)
  const load = () => supabase.rpc('chat_reported').then(({ data, error }) => setRows(error ? [] : (data as never) || []))
  useEffect(() => { load() }, [])
  const act = async (id: number, removeIt: boolean) => {
    const { error } = await supabase.rpc('chat_moderate', { p_message: id, p_remove: removeIt })
    toast(error ? explain(error.message) : removeIt ? 'Message removed.' : 'Reports dismissed.')
    load()
  }
  if (!rows) return null
  return (
    <div className="panel" style={{ marginTop: 20 }}>
      <h3>Reported messages <Badge n={rows.length} /></h3>
      <p className="note" style={{ marginTop: 2 }}>Only council admins see this. You see a message only once someone reports it.</p>
      {rows.length ? <div className="list" style={{ marginTop: 10 }}>{rows.map(r => (
        <div className="card" key={r.id}>
          <div className="meta" style={{ marginTop: 0 }}>{r.room.replace(/^sec:(\d):/, 'Year $1 · Section ').replace(/^hostel:/, 'Hostel ')} · {r.author || 'Someone'} · {dayLabel(dstr(new Date(r.created_at)))} {hhmm(r.created_at)}</div>
          <p style={{ whiteSpace: 'pre-wrap' }}>{r.body}</p>
          <div className="meta">{r.reports} report{r.reports > 1 ? 's' : ''}: {r.reasons.join(', ')}</div>
          <div className="acts"><button className="btn danger" type="button" onClick={() => act(r.id, true)}>Remove message</button><button className="btn" type="button" onClick={() => act(r.id, false)}>Dismiss</button></div>
        </div>))}</div> : <p className="note">Nothing reported.</p>}
    </div>
  )
}
