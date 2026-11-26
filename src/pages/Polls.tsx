import { useCallback, useEffect, useState } from 'react'
import { useMe } from '../lib/auth'
import { useRef_ } from '../lib/ref'
import { explain, supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useLive, useTick } from '../lib/useLive'
import type { Poll, PollTally } from '../lib/types'
import { dstr, sectionLabel } from '../lib/util'
import { audience, canVote, isOpen, myBallot, pollsChanged, rememberBallot, whenLabel } from '../lib/polls'
import { Text } from '../components/Text'
import { Empty, ErrorNote, Loading, Seg } from '../components/Bits'

type MyVote = { poll_id: string; option_id: number | null }

export function Polls() {
  useTick()
  const { uid, isAdmin } = useMe()
  const polls = useLive<Poll>('polls', () => supabase.from('polls')
    .select('id,title,details,secret,year,section,closes_at,created_at,created_by,options:poll_options!poll_options_poll_id_fkey(id,label,sort)')
    .order('created_at', { ascending: false }).limit(60) as never, ['polls'])
  const votes = useLive<MyVote>('my-poll-votes', () => supabase.from('poll_votes').select('poll_id,option_id').eq('user_id', uid) as never, ['poll_votes'])
  const [tally, setTally] = useState<Record<string, PollTally>>({})
  const [old, setOld] = useState(false)

  const ids = polls.data.map(p => p.id).join(',')
  const loadTally = useCallback(async () => {
    if (!ids) return
    const { data } = await supabase.rpc('poll_tally', { p_polls: ids.split(',') })
    if (Array.isArray(data)) setTally(Object.fromEntries((data as PollTally[]).map(t => [t.poll_id, t])))
  }, [ids])
  // Other people's votes don't arrive live (they're private), so refresh the counts every 20 s.
  useEffect(() => {
    loadTally()
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadTally() }, 20000)
    return () => clearInterval(t)
  }, [loadTally, votes.data])

  const mine = new Map(votes.data.map(v => [v.poll_id, v]))
  const open = polls.data.filter(isOpen).sort((a, b) => a.closes_at.localeCompare(b.closes_at))
  const closed = polls.data.filter(p => !isOpen(p)).sort((a, b) => b.closes_at.localeCompare(a.closes_at))
  const reload = () => { polls.reload(); votes.reload(); loadTally(); pollsChanged() }
  const card = (p: Poll) => <PollCard key={p.id} p={p} mine={mine.get(p.id)} t={tally[p.id]} admin={isAdmin} onChange={reload} />

  const list = (
    <div>
      <ErrorNote error={polls.error} />
      <div className="list">
        {polls.loading ? <Loading /> : open.length ? open.map(card) : <Empty>No open polls right now.</Empty>}
      </div>
      {closed.length > 0 && <>
        <button className="btn inline" type="button" style={{ marginTop: 14 }} onClick={() => setOld(!old)}>{old ? 'Hide' : 'Show'} closed polls and results ({closed.length})</button>
        {old && <div className="list" style={{ marginTop: 10 }}>{closed.map(card)}</div>}
      </>}
    </div>
  )
  const head = <div className="hd"><div><h2>Polls & elections</h2><p className="sub">Vote on council decisions. In elections your vote is secret and final.</p></div></div>
  if (!isAdmin) return <section>{head}{list}</section>
  return <div className="grid"><NewPoll onDone={reload} /><section>{head}{list}</section></div>
}

function PollCard({ p, mine, t, admin, onChange }: { p: Poll; mine?: MyVote; t?: PollTally; admin: boolean; onChange: () => void }) {
  const { profile } = useMe()
  const toast = useToast()
  const [pick, setPick] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [voters, setVoters] = useState<{ name: string | null; email: string; year: string | null; section: string | null }[] | null>(null)
  const live = isOpen(p)
  const eligible = canVote(p, profile)
  const voted = !!mine
  const opts = [...(p.options || [])].sort((a, b) => a.sort - b.sort)
  const counts = t?.counts || null
  const total = counts ? opts.reduce((s, o) => s + (counts[o.id] || 0), 0) : 0
  const top = counts ? Math.max(0, ...opts.map(o => counts[o.id] || 0)) : 0
  const ballot = p.secret ? myBallot(p.id) : ''

  const vote = async (optionId: number) => {
    const label = opts.find(o => o.id === optionId)?.label || ''
    if (p.secret && !confirm(`Vote for “${label}”?\n\nElection votes are final and secret: you can’t change it, and nobody can see who you voted for.`)) return
    setBusy(true)
    const { error } = await supabase.rpc('poll_vote', { p_poll: p.id, p_option: optionId })
    setBusy(false)
    if (error) return toast(explain(error.message))
    if (p.secret) rememberBallot(p.id, label)
    toast(p.secret ? 'Vote cast. Thank you!' : voted ? 'Vote changed.' : 'Voted.')
    onChange()
  }
  const run = async (q: PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    const { error } = await q
    toast(error ? explain(error.message) : ok)
    onChange()
  }
  const showVoters = async () => {
    if (voters) return setVoters(null)
    const { data, error } = await supabase.rpc('poll_voters', { p_poll: p.id })
    if (error) return toast(explain(error.message))
    setVoters((data as typeof voters) || [])
  }

  const bar = (o: { id: number; label: string }) => {
    const n = counts?.[o.id] || 0, pct = total ? Math.round((n / total) * 100) : 0
    const win = !live && top > 0 && n === top
    const chosen = !p.secret && mine?.option_id === o.id
    const inner = <>
      <span className="fill" style={{ width: pct + '%' }} />
      <span className="lbl">{chosen && '✓ '}{o.label}{win && <span className="tag t-ok">{opts.filter(x => (counts?.[x.id] || 0) === top).length > 1 ? 'Tied' : 'Winner'}</span>}</span>
      <span className="cnt">{n} · {pct}%</span>
    </>
    // In an open quick poll you can tap another option to change your vote.
    return live && !p.secret && eligible
      ? <button key={o.id} type="button" className={'opt res' + (chosen ? ' on' : '') + (win ? ' win' : '')} disabled={busy} onClick={() => !chosen && vote(o.id)}>{inner}</button>
      : <div key={o.id} className={'opt res' + (chosen ? ' on' : '') + (win ? ' win' : '')}>{inner}</div>
  }

  let body
  if (counts) body = <div className="opts">{opts.map(bar)}</div>
  else if (live && eligible && !voted) body = p.secret
    ? <div className="opts">
        {opts.map(o => <button key={o.id} type="button" className={'opt' + (pick === o.id ? ' on' : '')} aria-pressed={pick === o.id} onClick={() => setPick(o.id)}><span className="lbl">{pick === o.id ? '● ' : '○ '}{o.label}</span></button>)}
        <button className="btn pri inline" type="button" disabled={busy || pick === null} onClick={() => pick !== null && vote(pick)}>{busy ? 'Casting…' : 'Cast my vote'}</button>
      </div>
    : <div className="opts">{opts.map(o => <button key={o.id} type="button" className="opt" disabled={busy} onClick={() => vote(o.id)}><span className="lbl">{o.label}</span></button>)}<p className="note">Results show after you vote.</p></div>
  else body = <div className="opts">
    {opts.map(o => <div key={o.id} className="opt"><span className="lbl">{o.label}</span></div>)}
    <p className="note">{voted && p.secret && live ? `✓ You voted${ballot ? ` for ${ballot}` : ''}. Results come out when voting closes (${whenLabel(p.closes_at)}).`
      : !eligible && live ? `Only ${audience(p)} can vote${p.secret ? '. Results come out when voting closes' : ''}.`
      : 'Loading results…'}</p>
  </div>

  return (
    <div className={'card poll' + (live ? '' : ' closed')}>
      <div className="ch"><h3>{p.title}</h3>
        <span className={'tag ' + (live ? 't-ok' : '')}>{live ? (p.secret ? 'Election · open' : 'Open') : 'Closed'}</span></div>
      <div className="meta">{audience(p)} · {live ? 'closes ' : 'closed '}{whenLabel(p.closes_at)} · {t ? `${t.voters} voted` : '…'}{p.secret ? ' · secret ballot' : ''}</div>
      {p.details && <Text text={p.details} />}
      {body}
      {voted && p.secret && counts && <p className="note">✓ You voted{ballot ? ` for ${ballot}` : ''}.</p>}
      {admin && <div className="acts">
        {live && <button className="btn" type="button" onClick={() => { if (confirm('Close voting now? Results will be shown to everyone it’s for, and it can’t be reopened.')) run(supabase.from('polls').update({ closes_at: new Date().toISOString() }).eq('id', p.id), 'Voting closed.') }}>Close now</button>}
        <button className="btn" type="button" onClick={showVoters}>{voters ? 'Hide voter list' : 'Who voted'}</button>
        <button className="btn" type="button" onClick={() => { if (confirm('Delete this poll and all its votes for everyone?')) run(supabase.from('polls').delete().eq('id', p.id), 'Poll deleted.') }}>Delete</button>
      </div>}
      {voters && <div className="voters">
        <p className="note">{voters.length} voted{p.secret ? ' (names only: choices are never stored with names)' : ''}.</p>
        {voters.length > 0 && <ol>{voters.map((v, i) => <li key={i}>{v.name || v.email} <span className="meta">· {v.email}{v.year ? ` · Y${v.year} ${v.section ? sectionLabel(v.section) : ''}` : ''}</span></li>)}</ol>}
      </div>}
    </div>
  )
}

function NewPoll({ onDone }: { onDone: () => void }) {
  const { ref } = useRef_()
  const toast = useToast()
  const tomorrow = dstr(new Date(Date.now() + 864e5))
  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [kind, setKind] = useState<'poll' | 'election'>('poll')
  const [options, setOptions] = useState(['', ''])
  const [who, setWho] = useState('')
  const [day, setDay] = useState(tomorrow)
  const [time, setTime] = useState('20:00')
  const [busy, setBusy] = useState(false)
  const setOpt = (i: number, v: string) => setOptions(options.map((o, j) => (j === i ? v : o)))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const opts = options.map(o => o.trim()).filter(Boolean)
    if (new Set(opts.map(o => o.toLowerCase())).size < 2) return toast('Give at least two different options.')
    const [year, section] = who.split('|')
    const closes = new Date(`${day}T${time}:00`)
    if (isNaN(closes.getTime()) || closes.getTime() < Date.now() + 10 * 60000) return toast('Pick a closing time at least 10 minutes from now.')
    if (kind === 'election' && !confirm(`Start this election for ${audience({ year: (year || null) as Poll['year'], section: section || null })}?\n\nOnce it starts, the question and candidates can’t be edited, and results stay hidden until ${day} ${time}.`)) return
    setBusy(true)
    const { error } = await supabase.rpc('poll_create', {
      p_title: title.trim(), p_details: details.trim() || null, p_secret: kind === 'election',
      p_year: year || null, p_section: section || null, p_closes: closes.toISOString(), p_options: opts,
    })
    setBusy(false)
    if (error) return toast(explain(error.message))
    setTitle(''); setDetails(''); setOptions(['', '']); setKind('poll'); setWho('')
    toast(kind === 'election' ? 'Election started. Everyone it’s for gets a notification.' : 'Poll started.')
    onDone()
  }

  return (
    <form className="panel stick" onSubmit={submit}>
      <h2>Start a poll</h2>
      <p className="sub">Only council admins see this form.</p>
      <Seg value={kind} onChange={setKind} options={[['poll', 'Quick poll'], ['election', 'Election']]} />
      <p className="note">{kind === 'poll'
        ? 'One choice each, changeable until it closes. Voters see results after voting.'
        : 'Secret ballot: one final vote each, nobody (council included) can see who voted for whom, results only after closing. Add “NOTA” as an option if you want one.'}</p>
      <label htmlFor="pl-t">{kind === 'poll' ? 'Question' : 'Post / question'}</label>
      <input id="pl-t" required maxLength={140} value={title} onChange={e => setTitle(e.target.value)} placeholder={kind === 'poll' ? 'Which date for the town hall?' : 'Section C class representative'} />
      <label htmlFor="pl-d">Details (optional)</label>
      <textarea id="pl-d" rows={3} maxLength={1000} value={details} onChange={e => setDetails(e.target.value)} placeholder="Background, candidate manifestos link, rules…" />
      <span className="lab">{kind === 'poll' ? 'Options' : 'Candidates'}</span>
      {options.map((o, i) => <div key={i} className="optin">
        <input aria-label={`Option ${i + 1}`} maxLength={100} value={o} onChange={e => setOpt(i, e.target.value)} placeholder={`Option ${i + 1}`} />
        {options.length > 2 && <button type="button" className="linkbtn" onClick={() => setOptions(options.filter((_, j) => j !== i))}>remove</button>}
      </div>)}
      {options.length < 12 && <button type="button" className="linkbtn" onClick={() => setOptions([...options, ''])}>+ Add an option</button>}
      <label htmlFor="pl-w">Who can vote</label>
      <select id="pl-w" value={who} onChange={e => setWho(e.target.value)}>
        <option value="">Everyone</option>
        <option value="1">Year 1</option>
        <option value="2">Year 2</option>
        {(['1', '2'] as const).flatMap(y => ref.sections.map(s => <option key={y + s.code} value={`${y}|${s.code}`}>Year {y} · {s.label}</option>))}
      </select>
      <div className="row2">
        <div><label htmlFor="pl-day">Closes on</label><input id="pl-day" type="date" required min={dstr(new Date())} value={day} onChange={e => setDay(e.target.value)} /></div>
        <div><label htmlFor="pl-time">at</label><input id="pl-time" type="time" required value={time} onChange={e => setTime(e.target.value)} /></div>
      </div>
      <button className="btn pri" type="submit" disabled={busy}>{busy ? 'Starting…' : kind === 'poll' ? 'Start poll' : 'Start election'}</button>
    </form>
  )
}
