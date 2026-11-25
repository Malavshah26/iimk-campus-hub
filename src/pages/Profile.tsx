import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { useRef_ } from '../lib/ref'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import type { Year } from '../lib/types'

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
