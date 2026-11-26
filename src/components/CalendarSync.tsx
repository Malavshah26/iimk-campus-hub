import { useState } from 'react'
import { disconnectCal, setCalFilter, syncCal, useCal } from '../lib/gcal'
import { useToast } from '../lib/toast'

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`
}

/** Connect / refresh / disconnect the student's own class calendar. */
export function CalendarSync({ open: startOpen = false }: { open?: boolean }) {
  const cal = useCal()
  const toast = useToast()
  const [open, setOpen] = useState(startOpen)
  const [url, setUrl] = useState('')
  const [filter, setFilter] = useState(cal?.filter || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const connect = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    setBusy(true)
    try {
      const n = await syncCal(url.trim(), filter.trim())
      setUrl('')
      setOpen(false)
      toast(n ? `Synced ${n} sessions from your calendar.` : 'Connected, but no timed events were found in the next few months.')
    } catch (err) {
      setMsg((err as Error).message)
    }
    setBusy(false)
  }
  const refresh = async () => {
    setBusy(true)
    const n = await syncCal().catch(() => 0)
    setBusy(false)
    if (!cal?.error) toast(`Up to date: ${n} sessions.`)
  }

  if (cal && !open) return (
    <div className="calbar">
      <span>📅 From your Google Calendar · synced {ago(cal.at)}{cal.filter ? ` · only “${cal.filter}”` : ''}</span>
      <span className="acts" style={{ margin: 0 }}>
        <button className="linkbtn" type="button" disabled={busy} onClick={refresh}>{busy ? 'syncing…' : 'refresh'}</button>
        <button className="linkbtn" type="button" onClick={() => { setFilter(cal.filter); setOpen(true) }}>settings</button>
      </span>
      {cal.error && <div className="note err" style={{ width: '100%' }}>{cal.error}</div>}
    </div>
  )

  if (cal && open) return (
    <div className="panel calset">
      <h3>Calendar sync</h3>
      <label className="lab" htmlFor="cal-f">Only show events containing (optional)</label>
      <input id="cal-f" value={filter} onChange={e => setFilter(e.target.value)} placeholder="e.g. Sec A, PGP (comma-separated)" />
      <p className="note">Leave blank if the calendar has only classes. Use words from class titles if it also has personal events.</p>
      <div className="acts">
        <button className="btn pri inline" type="button" onClick={() => { setCalFilter(filter.trim()); setOpen(false); toast('Saved.') }}>Save</button>
        <button className="btn" type="button" onClick={() => setOpen(false)}>Close</button>
        <button className="btn" type="button" onClick={() => { if (confirm('Stop using your Google Calendar here? The link is removed from this device.')) { disconnectCal(); setOpen(false) } }}>Disconnect</button>
      </div>
    </div>
  )

  if (!open) return (
    <button className="calbar cta" type="button" onClick={() => setOpen(true)}>
      <span>📅 Classes in Google Calendar? <b>Sync them here</b>, with reschedules and extra sessions.</span>
    </button>
  )

  return (
    <form className="panel calset" onSubmit={connect}>
      <h3>Sync your Google Calendar</h3>
      <ol className="steps">
        <li>On a computer, open <a href="https://calendar.google.com/calendar/r/settings" target="_blank" rel="noopener noreferrer">Google Calendar settings</a>, signed in with the account that has your classes (e.g. your @iimk.ac.in account).</li>
        <li>On the left, under <b>Settings for my calendars</b> (or the calendar list), click the calendar with your classes.</li>
        <li>Scroll to <b>Integrate calendar</b> and copy <b>Secret address in iCal format</b>.</li>
        <li>Paste it below. On a phone, copy it on the computer and send it to yourself.</li>
      </ol>
      <label className="lab" htmlFor="cal-url">Secret iCal address</label>
      <input id="cal-url" required autoComplete="off" spellCheck={false} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/private-…/basic.ics" />
      <label className="lab" htmlFor="cal-f2">Only show events containing (optional)</label>
      <input id="cal-f2" value={filter} onChange={e => setFilter(e.target.value)} placeholder="Leave blank if the calendar has only classes" />
      <p className="note">The link stays on this device only; Campus Hub never stores it. Anyone with the link can see that calendar, so don’t share it. If it leaks, use <b>Reset</b> next to it in Google Calendar.</p>
      <div className="acts">
        <button className="btn pri inline" type="submit" disabled={busy}>{busy ? 'Syncing…' : 'Connect'}</button>
        <button className="btn" type="button" onClick={() => { setOpen(false); setMsg('') }}>Cancel</button>
      </div>
      {msg && <p className="note err" role="alert">{msg}</p>}
    </form>
  )
}
