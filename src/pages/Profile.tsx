import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { useRef_ } from '../lib/ref'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import type { Year } from '../lib/types'
import { askNotify, canNotify, notify, notifyAllowed, notifyBlocked } from '../lib/notify'
import { reminderTime, setReminderTime } from '../lib/attendance'

export function ProfileForm({ first = false }: { first?: boolean }) {
  const { session, profile, reloadProfile, signOut, isAdmin } = useAuth()
  const { ref } = useRef_()
  const toast = useToast()
  const [name, setName] = useState(profile?.name || '')
  const [phone, setPhone] = useState(profile?.phone || '')
  const [year, setYear] = useState<Year>(profile?.year || '1')
  const [section, setSection] = useState(profile?.section || 'A')
  const [hostel, setHostel] = useState(profile?.hostel || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    const row = { id: session!.user.id, name: name.trim().slice(0, 60), phone: phone.trim().slice(0, 20) || null, year, section, hostel: hostel || null, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('profiles').upsert(row)
    setBusy(false)
    if (error) { setMsg(error.message); return }
    await reloadProfile()
    toast('Profile saved.')
    if (first) window.location.hash = '#classes'
  }

  return (
    <div className={first ? 'auth' : ''}>
      <form className={first ? 'authcard' : 'panel narrow'} onSubmit={save}>
        <h2>{first ? 'Set up your profile' : 'Your profile'}</h2>
        <p className="sub">{first ? 'Others see your name and number on your posts.' : session?.user.email}</p>
        <label htmlFor="p-name">Name</label>
        <input id="p-name" required maxLength={60} value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
        <label htmlFor="p-phone">WhatsApp number (optional)</label>
        <input id="p-phone" inputMode="tel" maxLength={20} placeholder="98xxx xxxxx" value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" />
        <div className="row2">
          <div><label htmlFor="p-year">Year</label>
            <select id="p-year" value={year} onChange={e => setYear(e.target.value as Year)}><option value="1">Year 1</option><option value="2">Year 2</option></select></div>
          <div><label htmlFor="p-sec">Section</label>
            <select id="p-sec" value={section} onChange={e => setSection(e.target.value)}>
              {ref.sections.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select></div>
        </div>
        <label htmlFor="p-hostel">Hostel</label>
        <select id="p-hostel" value={hostel} onChange={e => setHostel(e.target.value)}>
          <option value="">Choose…</option>
          {ref.hostels.map(h => <option key={h.code} value={h.code}>Hostel {h.code}</option>)}
        </select>
        <button className="btn pri" type="submit" disabled={busy}>{busy ? 'Saving…' : first ? 'Continue' : 'Save'}</button>
        {msg && <p className="note err">{msg}</p>}
        {!first && <Notifications />}
        {!first && (
          <div className="acts" style={{ marginTop: 18 }}>
            {isAdmin && <a className="btn" href="#admin">Council admin</a>}
            <button className="btn" type="button" onClick={signOut}>Sign out</button>
          </div>
        )}
        {first && <button className="btn wide" type="button" onClick={signOut}>Sign out</button>}
      </form>
    </div>
  )
}

function Notifications() {
  const [, bump] = useState(0)
  const [remind, setRemind] = useState(reminderTime())
  if (!canNotify()) return <p className="note">This browser can’t show notifications. Install Campus Hub (browser menu → Add to Home screen) to get them.</p>
  return (
    <div className="notif">
      <span className="lab">Notifications</span>
      {notifyAllowed() ? <>
        <p className="note" style={{ marginTop: 0 }}>On. You’ll hear when your wash is done, someone joins your ride, your complaint is updated, a notice is posted, and before events and bookings, while Campus Hub is open (a background tab or the installed app is enough).</p>
        <button className="btn inline" type="button" onClick={() => notify('Campus Hub', 'Notifications are working.')}>Send a test</button>
        <label className="lab" htmlFor="p-remind" style={{ marginTop: 14 }}>Attendance reminder</label>
        <select id="p-remind" value={remind} onChange={e => { setRemind(e.target.value); setReminderTime(e.target.value) }}>
          <option value="">Off</option>
          {['19:00', '20:00', '21:00', '22:00', '23:00'].map(t => <option key={t} value={t}>Every evening at {t} (only if something isn’t marked)</option>)}
        </select>
      </> : notifyBlocked() ? <p className="note" style={{ marginTop: 0 }}>Blocked in this browser. Allow them in the site settings (the icon left of the address bar), then reload.</p>
        : <button className="btn inline" type="button" onClick={async () => { await askNotify(); bump(n => n + 1) }}>Turn on notifications</button>}
    </div>
  )
}
