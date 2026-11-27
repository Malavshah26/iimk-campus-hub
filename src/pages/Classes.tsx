import { Fragment, useEffect, useMemo, useState } from 'react'
import { useAuth, useMe } from '../lib/auth'
import { useRef_ } from '../lib/ref'
import { attKey, markMany } from '../lib/attendance'
import { sectionClasses, sessionsOn, sessionsUpdated, useSessions } from '../lib/sections'
import { calendarSection, myClasses, useCal } from '../lib/gcal'
import { CalendarSync } from '../components/CalendarSync'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useTick } from '../lib/useLive'
import type { AttendanceRow, Year } from '../lib/types'
import { DAYS, dstr, local, mins, nowMin, saveLocal, sectionLabel, today, weekDays } from '../lib/util'
import { Chips, Empty } from '../components/Bits'

type Mode = 'mine' | 'cmp'

/** "Room B2" -> "B2" (the badge already says it's a room). */
const roomName = (r: string) => r.replace(/^room\s+/i, '')
const PinIcon = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M12 21s-6-5.3-6-10.5a6 6 0 0 1 12 0C18 15.7 12 21 12 21z" /><circle cx="12" cy="10.5" r="2.2" /></svg>

/** How many more classes you can miss (or must attend in a row) to stay at 75%. */
export function skipLine({ y, t }: { y: number; t: number }): string {
  if (!t) return ''
  if (y * 4 >= t * 3) {
    const k = Math.floor((y * 4) / 3 - t + 1e-9)
    return k > 0 ? `Can miss ${k} more` : 'At the limit: don’t miss the next one'
  }
  const n = Math.ceil(3 * t - 4 * y)
  return `Attend the next ${n} in a row to get back to 75%`
}

export function Classes() {
  const [mode, setMode] = useState<Mode>(() => local<Mode>('hub.tmode', 'mine'))
  useEffect(() => saveLocal('hub.tmode', mode), [mode])
  return (
    <section>
      <Chips label="View" value={mode} onChange={setMode} options={[['mine', 'My timetable'], ['cmp', 'Compare people']]} />
      {mode === 'mine' ? <MyTimetable /> : <Compare />}
    </section>
  )
}

function MyTimetable() {
  useTick()
  const { uid, profile } = useMe()
  const { ref } = useRef_()
  const toast = useToast()
  const [year, setYear] = useState<Year>(profile.year)
  const [section, setSection] = useState(profile.section)
  // Follow the profile if the student changes their section (e.g. "Switch my profile to Section C").
  useEffect(() => { setYear(profile.year); setSection(profile.section) }, [profile.year, profile.section])
  const [woff, setWoff] = useState(0)
  const [day, setDay] = useState(today())
  const [att, setAtt] = useState<Record<string, AttendanceRow>>({})
  const cal = useCal()
  const { reloadProfile } = useAuth()
  // "EE(C)" in the invites means Section C: offer to fix the profile if it says otherwise.
  const calSec = ref.sections.find(s => s.code.toUpperCase() === calendarSection(cal))
  const fixSection = async () => {
    if (!calSec) return
    const { error } = await supabase.from('profiles').update({ section: calSec.code, updated_at: new Date().toISOString() }).eq('id', uid)
    if (error) return toast('Couldn’t update your profile: ' + error.message)
    await reloadProfile()
    toast(`Profile updated to ${sectionLabel(calSec.code)}.`)
  }

  useEffect(() => {
    supabase.from('attendance').select('key,course_code,status').then(({ data }) => {
      setAtt(Object.fromEntries((data as AttendanceRow[] | null || []).map(r => [r.key, r])))
    })
  }, [uid])

  const days = weekDays(woff)
  useSessions([[year, section]], dstr(days[0]), dstr(days[days.length - 1]))
  const t = today()
  const selected = days.some(d => dstr(d) === day) ? day : (days.some(d => dstr(d) === t) ? t : dstr(days[0]))
  // One view. By default: your own classes (from your Google Calendar if connected, else your section's
  // timetable). "See another section" browses any section, view-only; attendance is always your own.
  const ys = profile.year + profile.section
  const own = year === profile.year && section === profile.section
  const fromCal = !!cal && own
  const [picking, setPicking] = useState(false)
  const backToMine = () => { setYear(profile.year); setSection(profile.section); setPicking(false) }
  const mySec = `${profile.year === '1' ? 'Year 1' : 'Year 2'} · ${sectionLabel(profile.section)}`
  const list = fromCal ? myClasses(ref, new Date(selected + 'T00:00'), profile.year, profile.section) : sectionClasses(ref, new Date(selected + 'T00:00'), year, section)
  const shared = !fromCal && days.some(d => sessionsOn(year, section, dstr(d)) !== null)
  const sharedAt = shared ? sessionsUpdated(year, section) : null
  const nm = nowMin()
  const prefix = ys + '|'

  const mark = async (key: string, code: string, v: 'y' | 'n') => {
    const prev = att[key]
    const next = { ...att }
    if (prev?.status === v) delete next[key]
    else next[key] = { key, course_code: code, status: v }
    setAtt(next)
    const { error } = prev?.status === v
      ? await supabase.from('attendance').delete().eq('key', key)
      : await supabase.from('attendance').upsert({ user_id: uid, key, course_code: code, status: v, updated_at: new Date().toISOString() })
    if (error) { toast('Couldn’t save attendance: ' + error.message); setAtt(att) }
  }

  // Classes on the selected day that have started and aren't marked yet.
  const todo = own ? list.filter(c => (selected < t || (selected === t && mins(c.starts) <= nm)) && !att[attKey(ys, selected, c)]) : []
  const markAll = async (v: 'y' | 'n') => {
    const items = todo.map(c => ({ key: attKey(ys, selected, c), code: c.code }))
    const next = { ...att }
    for (const i of items) next[i.key] = { key: i.key, course_code: i.code, status: v }
    setAtt(next)
    const err = await markMany(uid, items, v)
    if (err) { toast('Couldn’t save attendance: ' + err); setAtt(att) }
    else toast(`Marked ${items.length} class${items.length === 1 ? '' : 'es'} ${v === 'y' ? 'attended' : 'missed'}.`)
  }

  /** Deletes all of this student's marks for one subject (e.g. old or wrong ones). */
  const clearCourse = async (code: string, n: number) => {
    if (!confirm(`Delete your ${n} attendance mark${n === 1 ? '' : 's'} for ${code}? This can’t be undone.`)) return
    const keys = Object.values(att).filter(r => r.course_code === code && r.key.startsWith(prefix)).map(r => r.key)
    const { error } = await supabase.from('attendance').delete().in('key', keys)
    if (error) return toast('Couldn’t clear: ' + error.message)
    setAtt(Object.fromEntries(Object.entries(att).filter(([k]) => !keys.includes(k))))
    toast(`Cleared ${code}.`)
  }

  const agg = useMemo(() => {
    const a: Record<string, { y: number; t: number }> = {}
    for (const r of Object.values(att)) {
      if (!r.key.startsWith(prefix)) continue
      const x = (a[r.course_code] ||= { y: 0, t: 0 })
      x.t++
      if (r.status === 'y') x.y++
    }
    return a
  }, [att, prefix])
  const tot = Object.values(agg).reduce((s, x) => ({ y: s.y + x.y, t: s.t + x.t }), { y: 0, t: 0 })
  const pct = (x: { y: number; t: number }) => (x.t ? Math.round((x.y * 100) / x.t) : 0)
  const courseNames = new Map(ref.timetable.filter(r => r.year === profile.year && r.section === profile.section).map(r => [r.course_code, r.course_name]))

  return (
    <div className="grid tt">
      <div>
        <CalendarSync />
        {calSec && calSec.code !== profile.section && <div className="status show">
          Your calendar is for <b>{sectionLabel(calSec.code)}</b>, but your profile says {sectionLabel(profile.section)}. <button className="linkbtn" type="button" onClick={fixSection}>Switch my profile to {sectionLabel(calSec.code)}</button>
        </div>}
        <div className={'viewbar' + (own ? '' : ' other')}>
          {own
            ? <span>Your classes · <b>{mySec}</b>{fromCal ? <span className="meta"> · from your Google Calendar</span> : null}</span>
            : <span>Viewing <b>{year === '1' ? 'Year 1' : 'Year 2'} · {sectionLabel(section)}</b> <span className="meta">· view only</span></span>}
          {own
            ? <button className="linkbtn" type="button" aria-expanded={picking} onClick={() => setPicking(!picking)}>{picking ? 'Done' : 'See another section'}</button>
            : <button className="btn" type="button" onClick={backToMine}>Back to my section</button>}
        </div>
        {(picking || !own) && <div className="sel">
          <div><label className="lab" htmlFor="t-year">Year</label>
            <select id="t-year" value={year} onChange={e => setYear(e.target.value as Year)}><option value="1">Year 1</option><option value="2">Year 2</option></select></div>
          <div><label className="lab" htmlFor="t-sec">Section</label>
            <select id="t-sec" value={section} onChange={e => setSection(e.target.value)}>
              {ref.sections.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
            </select></div>
        </div>}
        {!own && <p className="note" style={{ margin: '-4px 0 12px' }}>Attendance can only be marked for your own section ({mySec}).</p>}
        <div className="wk">
          <button className="btn" type="button" aria-label="Previous week" onClick={() => setWoff(w => w - 1)}>‹</button>
          <div className="chips" ref={el => { const c = el?.querySelector<HTMLElement>('.chip.on'); if (el && c) el.scrollLeft = c.offsetLeft - el.offsetLeft - (el.clientWidth - c.offsetWidth) / 2 }}>
            {days.map(d => {
              const ds = dstr(d)
              return <button key={ds} type="button" className={'chip' + (ds === selected ? ' on' : '')} onClick={() => setDay(ds)}>
                {DAYS[d.getDay()]} {d.getDate()}{ds === t ? ' · today' : ''}</button>
            })}
          </div>
          <button className="btn" type="button" aria-label="Next week" onClick={() => setWoff(w => w + 1)}>›</button>
        </div>
        {todo.length > 1 && <div className="markall">
          <span>{todo.length} classes {selected === t ? 'so far today' : 'this day'} aren’t marked</span>
          <span className="acts" style={{ margin: 0 }}>
            <button className="btn" type="button" onClick={() => markAll('y')}>✓ Attended all</button>
            <button className="btn" type="button" onClick={() => markAll('n')}>Missed all</button>
          </span>
        </div>}
        {list.length ? list.map(c => {
          const key = attKey(ys, selected, c)
          const v = att[key]?.status
          const future = selected > t || (selected === t && mins(c.starts) > nm)
          const live = selected === t && nm >= mins(c.starts) && nm < mins(c.ends)
          return (
            <div key={key} className={'cls' + (live ? ' now' : '')}>
              <div><b className="t">{c.starts}</b><small>till {c.ends}</small></div>
              <div><h3>{c.name}{c.room && <span className="room" title="Classroom"><PinIcon />{roomName(c.room)}</span>}</h3>
                <div className="meta">{[c.name !== c.code && c.code, c.detail].filter(Boolean).join(' · ')}{live && <> · <b>On now</b></>}</div></div>
              <div className="att">
                {!own ? null : future ? <button disabled>Upcoming</button> : <>
                  <button className={v === 'y' ? 'y' : ''} aria-pressed={v === 'y'} onClick={() => mark(key, c.code, 'y')}>Attended</button>
                  <button className={v === 'n' ? 'n' : ''} aria-pressed={v === 'n'} onClick={() => mark(key, c.code, 'n')}>Missed</button>
                </>}
              </div>
            </div>
          )
        }) : <Empty>{fromCal ? 'Nothing in your calendar for this day.'
          : shared ? `No ${sectionLabel(section)} classes this day.`
          : !ref.timetable.some(r => r.year === year && r.section === section) ? `There’s no timetable for ${year === '1' ? 'Year 1' : 'Year 2'}, ${sectionLabel(section)} yet. It fills in by itself once anyone in ${sectionLabel(section)} syncs their Google Calendar here.`
          : new Date(selected + 'T00:00').getDay() === 0 ? 'No classes on Sunday.' : 'No classes in the timetable for this day.'}</Empty>}
      </div>
      {shared && <p className="note" style={{ gridColumn: '1 / -1', margin: '-8px 0 0' }}>{sectionLabel(section)} timetable from classmates’ synced calendars{sharedAt ? `, updated ${new Date(sharedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}.</p>}
      <aside className="panel stick">
        <h2>Your attendance</h2>
        <p className="sub">{fromCal ? 'From your calendar' : mySec} · private to you</p>
        {tot.t ? <>
          <div className="big">{pct(tot)}%</div>
          <div className="meta">{tot.y} of {tot.t} marked classes attended</div>
          <div style={{ height: 14 }} />
          {Object.entries(agg).sort().map(([code, x]) => {
            const p = pct(x)
            return <div className="crow" key={code}>
              <div className="ch"><span>{courseNames.get(code) || code}</span><b>{x.y}/{x.t} · {p}%</b></div>
              <div className="bar"><i className={p < 75 ? 'low' : ''} style={{ width: p + '%' }} /></div>
              <div className="ch"><span className="meta">{skipLine(x)}</span><button className="linkbtn small" type="button" onClick={() => clearCourse(code, x.t)} aria-label={`Clear attendance for ${code}`}>clear</button></div>
            </div>
          })}
          <p className="note">Below 75% shows in red. “Can miss” counts how many more classes you could skip and stay at 75% or above.</p>
        </> : <Empty>Mark classes as attended or missed and your record builds up here.</Empty>}
      </aside>
    </div>
  )
}

const PCOL = ['#2457a6', '#2a7f7a', '#7a4f9a', '#a6762a', '#a8506a', '#4a5568']
interface Person { n: string; y: Year; s: string }

function Compare() {
  useTick()
  const { profile } = useMe()
  const { ref } = useRef_()
  const toast = useToast()
  const [people, setPeople] = useState<Person[]>(() => local<Person[]>('hub.cmp', []))
  const [woff, setWoff] = useState(0)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<{ id: string; name: string; year: Year; section: string }[]>([])
  const [manual, setManual] = useState<Person>({ n: '', y: '1', s: 'A' })
  useEffect(() => saveLocal('hub.cmp', people), [people])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setHits([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id,name,year,section').ilike('name', `%${term.replace(/[%_]/g, '')}%`).limit(8)
      setHits((data as typeof hits) || [])
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const add = (p: Person) => {
    if (people.length >= 5) { toast('You can compare up to 6 people at once.'); return }
    setPeople([...people, p])
    setQ('')
  }

  const all = [{ n: profile.name + ' (you)', y: profile.year, s: profile.section }, ...people].map((p, i) => ({ ...p, c: PCOL[i % PCOL.length] }))
  const days = weekDays(woff)
  useSessions(all.map(p => [p.y, p.s] as [string, string]), dstr(days[0]), dstr(days[days.length - 1]))
  const t = today()
  const nm = nowMin()
  const sched = all.map(p => days.map(d => sectionClasses(ref, d, p.y, p.s)))
  const free: { d: Date; slot: number; starts: string; ends: string }[] = []

  return (
    <div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <h2>Find a common free slot</h2>
        <p className="sub">Add classmates to see everyone’s classes together.</p>
        {all.some(p => !ref.timetable.some(r => r.year === p.y && r.section === p.s) && !days.some(d => sessionsOn(p.y, p.s, dstr(d)) !== null)) && <div className="status show">This uses section timetables, and some sections here don’t have one yet, so they’ll look free. A section’s timetable fills in once anyone in it syncs their Google Calendar.</div>}
        <div className="people">
          {all.map((p, i) => (
            <span key={i} className="pchip" style={{ ['--c' as string]: p.c }}>
              <i />{p.n} <small>{p.y === '1' ? 'Y1' : 'Y2'} · {sectionLabel(p.s)}</small>
              {i > 0 ? <button type="button" aria-label={'Remove ' + p.n} onClick={() => setPeople(people.filter((_, j) => j !== i - 1))}>×</button> : <span style={{ width: 6 }} />}
            </span>
          ))}
        </div>
        <label className="lab" htmlFor="cp-q">Search students on Campus Hub</label>
        <input id="cp-q" placeholder="Type a name" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
        {hits.length > 0 && <div className="hits">{hits.map(h => (
          <button key={h.id} type="button" className="hit" onClick={() => add({ n: h.name, y: h.year, s: h.section })}>
            {h.name} <small>{h.year === '1' ? 'Y1' : 'Y2'} · {sectionLabel(h.section)}</small></button>))}</div>}
        <form className="sel" style={{ margin: '12px 0 0' }} onSubmit={e => { e.preventDefault(); if (manual.n.trim()) { add({ ...manual, n: manual.n.trim().slice(0, 24) }); setManual({ ...manual, n: '' }) } }}>
          <div style={{ flex: '1 1 10em' }}><label className="lab" htmlFor="cp-name">Or add by section</label>
            <input id="cp-name" placeholder="Name" maxLength={24} value={manual.n} onChange={e => setManual({ ...manual, n: e.target.value })} /></div>
          <div><label className="lab" htmlFor="cp-year">Year</label>
            <select id="cp-year" value={manual.y} onChange={e => setManual({ ...manual, y: e.target.value as Year })}><option value="1">Year 1</option><option value="2">Year 2</option></select></div>
          <div><label className="lab" htmlFor="cp-sec">Section</label>
            <select id="cp-sec" value={manual.s} onChange={e => setManual({ ...manual, s: e.target.value })}>
              {ref.sections.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}</select></div>
          <button className="btn pri inline" type="submit">Add</button>
        </form>
      </div>
      <div className="wk">
        <button className="btn" type="button" aria-label="Previous week" onClick={() => setWoff(w => w - 1)}>‹</button>
        <b style={{ flex: 1 }}>Week of {days[0].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</b>
        <button className="btn" type="button" aria-label="Next week" onClick={() => setWoff(w => w + 1)}>›</button>
      </div>
      {(() => {
        const rows = ref.slots.map(sl => {
          const cells = days.map((d, di) => {
            const busy = all.map((p, pi) => ({ p, c: sched[pi][di].find(x => x.slot === sl.slot) })).filter(x => x.c)
            const ds = dstr(d)
            if (!busy.length && (ds > t || (ds === t && mins(sl.starts) > nm))) free.push({ d, slot: sl.slot, starts: sl.starts, ends: sl.ends })
            return { busy }
          })
          return { sl, cells }
        })
        return <>
          <div className="cfree">
            {all.length < 2 ? <Empty>Add at least one more person to find common free slots.</Empty>
              : free.length ? <>
                <h3>{free.length} common free slot{free.length > 1 ? 's' : ''} ahead this week</h3>
                <div className="chips">{free.slice(0, 8).map((f, i) => <span key={i} className="tag t-ok big">{DAYS[f.d.getDay()]} {f.starts}–{f.ends}</span>)}
                  {free.length > 8 && <span className="tag t-mut big">+{free.length - 8} more</span>}</div>
              </> : <Empty>No common free class slot left this week. Try next week.</Empty>}
          </div>
          <div className="scroll">
            <table className="cg">
              <thead><tr><th />{days.map(d => <th key={dstr(d)} className={dstr(d) === t ? 'today' : ''}>{DAYS[d.getDay()]} {d.getDate()}</th>)}</tr></thead>
              <tbody>
                {rows.map(({ sl, cells }, ri) => (
                  <Fragment key={sl.slot}>
                  {ri > 0 && mins(sl.starts) - mins(rows[ri - 1].sl.ends) >= 45 && (
                    <tr className="lunch"><td className="tm"><b>{rows[ri - 1].sl.ends}</b>till {sl.starts}</td><td colSpan={6}><div className="cell">Lunch break</div></td></tr>)}
                  <tr>
                    <td className="tm"><b>{sl.starts}</b>till {sl.ends}</td>
                    {cells.map((c, i) => <td key={i}>{c.busy.length
                      ? <div className="cell">{c.busy.map((x, k) => <span key={k} className="pb" style={{ ['--c' as string]: x.p.c }} title={`${x.p.n}: ${x.c!.name}`}>{x.p.n.split(' ')[0]} · {x.c!.code}</span>)}</div>
                      : <div className="cell free">All free</div>}</td>)}
                  </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      })()}
    </div>
  )
}
