import { useEffect, useRef, useState } from 'react'
import { useMe } from '../lib/auth'
import { useRef_ } from '../lib/ref'
import { askNotify, canNotify, notifyAllowed, notifyBlocked } from '../lib/notify'
import { sectionLabel } from '../lib/util'
import { CalendarSync } from './CalendarSync'
import { BirthdayField } from './Birthday'
import { InstallButton } from './Install'

// Mirrors the main headers in App.tsx.
const FEATURES: [string, string][] = [
  ['Classes', 'your sessions, rooms and attendance in one tap'],
  ['Updates', 'council notices, polls & elections, events'],
  ['Mess & laundry', 'today’s meals (rate them), free washing machines'],
  ['Transport', 'shuttle times, auto drivers’ numbers, carpools'],
  ['Market', 'buy & sell, lost & found'],
  ['Campus', 'book a room or court, complaints, important contacts'],
]

/** First-run intro: what's here, check profile (+ birthday), sync calendar, turn on notifications. */
export function Tour({ onDone }: { onDone: () => void }) {
  const { uid, profile } = useMe()
  const { ref } = useRef_()
  const [step, setStep] = useState(0)
  const [, bump] = useState(0)
  const h = useRef<HTMLHeadingElement>(null)
  useEffect(() => { h.current?.focus() }, [step])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onDone() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onDone])
  const hostel = ref.hostels.find(x => x.code === profile.hostel)
  const last = 3

  const screens = [
    <>
      <h2 ref={h} tabIndex={-1} id="tour-h">Welcome to Campus Hub</h2>
      <p className="sub">Everyday campus life at IIMK in one place, run by the Students’ Council. Setting it up takes a minute.</p>
      <ul className="feat">{FEATURES.map(([a, b]) => <li key={a}><b>{a}</b>{b && <span> · {b}</span>}</li>)}</ul>
    </>,
    <>
      <h2 ref={h} tabIndex={-1} id="tour-h">Is this you?</h2>
      <p className="sub">Your section decides your timetable, section polls and who sees your birthday.</p>
      <div className="who"><b>{profile.name}</b><span>Year {profile.year} · {sectionLabel(profile.section)}{hostel ? ` · Hostel ${hostel.code}` : ''}</span>
        <a href="#profile" onClick={onDone}>Change</a></div>
      <BirthdayField uid={uid} />
    </>,
    <>
      <h2 ref={h} tabIndex={-1} id="tour-h">Your classes</h2>
      <p className="sub">IIMK class invites are in Google Calendar. Sync them once and Campus Hub shows your sessions, rooms and reschedules, and lets you mark attendance in one tap.</p>
      <CalendarSync open />
      <p className="note">No computer handy? Skip this; you can do it any time on the Classes tab. Your section’s timetable still shows once a classmate has synced.</p>
    </>,
    <>
      <h2 ref={h} tabIndex={-1} id="tour-h">Stay in the loop</h2>
      <p className="sub">Get a nudge when your wash is done, a notice or poll is posted, someone joins your ride, and an evening reminder to mark attendance.</p>
      {!canNotify() ? <p className="note">This browser can’t show notifications. Install Campus Hub first (below).</p>
        : notifyAllowed() ? <p className="tag t-ok big">✓ Notifications are on</p>
        : notifyBlocked() ? <p className="note">Notifications are blocked for this site. Allow them in the browser’s site settings (the icon left of the address bar).</p>
        : <button className="btn pri inline" type="button" onClick={async () => { await askNotify(); bump(n => n + 1) }}>Turn on notifications</button>}
      <span className="lab">Install it like an app</span>
      <p className="note" style={{ marginTop: 0, marginBottom: 8 }}>It then opens in one tap, full screen, and works offline for the timetable, menu, bus and contacts.</p>
      <InstallButton />
    </>,
  ]

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-h">
      <div className="tourcard">
        <div className="dots" aria-label={`Step ${step + 1} of ${last + 1}`}>{screens.map((_, i) => <span key={i} className={i === step ? 'on' : ''} />)}</div>
        {screens[step]}
        <div className="tournav">
          <button className="linkbtn" type="button" onClick={onDone}>{step === last ? 'Close' : 'Skip intro'}</button>
          <span className="acts" style={{ margin: 0 }}>
            {step > 0 && <button className="btn" type="button" onClick={() => setStep(step - 1)}>Back</button>}
            <button className="btn pri inline" type="button" onClick={() => (step === last ? onDone() : setStep(step + 1))}>{step === last ? 'Done' : 'Next'}</button>
          </span>
        </div>
      </div>
    </div>
  )
}
