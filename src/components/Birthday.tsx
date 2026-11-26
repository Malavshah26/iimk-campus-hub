import { useEffect, useState } from 'react'
import { explain, supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { waLink } from '../lib/util'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const daysIn = (m: number) => (m === 2 ? 29 : [4, 6, 9, 11].includes(m) ? 30 : 31)

type Row = { user_id: string; month: number; day: number; who: { name: string; phone: string | null } | null }

/** Birthdays today among the student's own year + section (the database only returns those). */
export function BirthdayCard({ uid }: { uid: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const d = new Date()
  const key = d.toDateString()
  useEffect(() => {
    supabase.from('birthdays').select('user_id,month,day,who:profiles!birthdays_user_id_fkey(name,phone)').then(({ data }) => setRows((data as Row[] | null) || []))
  }, [key])
  const m = d.getMonth() + 1, day = d.getDate()
  const leap = new Date(d.getFullYear(), 1, 29).getMonth() === 1
  // 29 Feb birthdays show on 28 Feb in other years.
  const isToday = (r: Row) => (r.month === m && r.day === day) || (!leap && m === 2 && day === 28 && r.month === 2 && r.day === 29)
  const today = rows.filter(isToday)
  if (!today.length) return null
  const me = today.find(r => r.user_id === uid)
  const others = today.filter(r => r.user_id !== uid && r.who)
  return (
    <div className="bday" role="status">
      <span aria-hidden="true">🎂</span>
      <span>
        {me && <b>Happy birthday{me.who ? ', ' + me.who.name.split(' ')[0] : ''}!</b>}
        {me && others.length > 0 && ' Also today: '}
        {others.map((r, i) => {
          const wa = waLink(r.who!.phone)
          return <span key={r.user_id}>{i > 0 && (i === others.length - 1 ? ' and ' : ', ')}
            {wa ? <a href={wa} target="_blank" rel="noopener noreferrer">{r.who!.name}</a> : <b>{r.who!.name}</b>}</span>
        })}
        {others.length > 0 && <>{others.length === 1 ? '’s birthday' : ' have birthdays'}{me ? '' : ' today'}{others.some(r => waLink(r.who!.phone)) ? ' · tap a name to wish them on WhatsApp' : ''}</>}
      </span>
    </div>
  )
}

/** Optional birthday (day and month only), visible to the student's own section. */
export function BirthdayField({ uid }: { uid: string }) {
  const toast = useToast()
  const [month, setMonth] = useState(0)
  const [day, setDay] = useState(0)
  const [saved, setSaved] = useState<[number, number] | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    supabase.from('birthdays').select('month,day').eq('user_id', uid).maybeSingle().then(({ data }) => {
      const r = data as { month: number; day: number } | null
      if (r) { setMonth(r.month); setDay(r.day); setSaved([r.month, r.day]) }
    })
  }, [uid])
  const save = async () => {
    if (!month || !day) return toast('Pick the month and the day.')
    setBusy(true)
    const { error } = await supabase.from('birthdays').upsert({ user_id: uid, month, day })
    setBusy(false)
    if (error) return toast(explain(error.message))
    setSaved([month, day])
    toast('Birthday saved. Your section sees it on the day.')
  }
  const remove = async () => {
    setBusy(true)
    const { error } = await supabase.from('birthdays').delete().eq('user_id', uid)
    setBusy(false)
    if (error) return toast(explain(error.message))
    setSaved(null); setMonth(0); setDay(0)
    toast('Birthday removed.')
  }
  const changed = !saved || saved[0] !== month || saved[1] !== day
  return (
    <div className="bdayf">
      <span className="lab">Birthday (optional)</span>
      <div className="row2">
        <select aria-label="Birthday month" value={month} onChange={e => { const m = +e.target.value; setMonth(m); if (day > daysIn(m)) setDay(0) }}>
          <option value={0}>Month</option>
          {MONTHS.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
        </select>
        <select aria-label="Birthday day" value={day} onChange={e => setDay(+e.target.value)}>
          <option value={0}>Day</option>
          {Array.from({ length: daysIn(month || 1) }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
        </select>
      </div>
      <p className="note">Only classmates in your year and section see it, on the day, on their home screen. Day and month only, never the year.</p>
      <div className="acts" style={{ marginTop: 8 }}>
        {changed && <button className="btn inline" type="button" disabled={busy || !month || !day} onClick={save}>{saved ? 'Save birthday' : 'Share my birthday'}</button>}
        {saved && <button className="btn inline" type="button" disabled={busy} onClick={remove}>Remove</button>}
      </div>
    </div>
  )
}
