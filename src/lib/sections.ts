import { useEffect, useState } from 'react'
import type { CalState } from './gcal'
import { classesFor, type ClassItem, type RefData } from './ref'
import { parseSessionTitle } from './sessionTitle'
import { supabase } from './supabase'
import { dstr, hhmm, local, overlaps, saveLocal } from './util'

/**
 * Section timetables built from students' synced calendars (table section_sessions, update 0004).
 * IIMK class invites are the same for a whole section, so one student's sync fills in the
 * timetable for everyone in that section. Falls back to the weekly timetable when a section has none.
 */
export interface SessionRow { day: string; starts: string; ends: string; code: string; session: number | null; faculty: string | null; room: string | null; updated_at: string }
interface Entry { from: string; to: string; rows: SessionRow[]; at: number }

const KEY = 'hub.sess'
const SHARE = 'hub.shareSessions'
const STALE = 10 * 60000
const DAY = 86400000

let store: Record<string, Entry> = local<Record<string, Entry>>(KEY, {})
const listeners = new Set<() => void>()
const inflight = new Set<string>()
const notify = () => listeners.forEach(f => f())
const key = (y: string, s: string) => `${y}|${s}`

export const shareEnabled = () => local<boolean>(SHARE, true)
export const setShareEnabled = (v: boolean) => { saveLocal(SHARE, v); notify() }

/** Our own sync window: a week back, two months ahead. */
export function shareWindow(): [string, string] {
  return [dstr(new Date(Date.now() - 7 * DAY)), dstr(new Date(Date.now() + 60 * DAY))]
}

export async function loadSessions(y: string, s: string, from: string, to: string, force = false) {
  const k = key(y, s)
  const e = store[k]
  if (!force && e && e.from <= from && e.to >= to && Date.now() - e.at < STALE) return
  if (inflight.has(k)) return
  inflight.add(k)
  // Keep one window per section: widen the cached one when it's close by, otherwise replace it.
  let f = from, t = to
  if (e && !force) {
    const wf = from < e.from ? from : e.from, wt = to > e.to ? to : e.to
    if ((Date.parse(wt) - Date.parse(wf)) / DAY <= 120) { f = wf; t = wt }
  }
  const { data, error } = await supabase.from('section_sessions')
    .select('day,starts,ends,code,session,faculty,room,updated_at')
    .eq('year', y).eq('section', s).gte('day', f).lte('day', t).order('day').order('starts').limit(3000)
  inflight.delete(k)
  if (error) {
    // Offline: keep what we had. Table missing (update 0004 not run): nothing to show.
    if (!e && /does not exist|schema cache/i.test(error.message)) store = { ...store, [k]: { from: f, to: t, rows: [], at: Date.now() } }
    else return
  } else {
    store = { ...store, [k]: { from: f, to: t, rows: (data as SessionRow[]) || [], at: Date.now() } }
  }
  // Keep the device copy small: the most recently used sections only.
  const keep = Object.entries(store).sort((a, b) => b[1].at - a[1].at).slice(0, 8)
  store = Object.fromEntries(keep)
  saveLocal(KEY, store)
  notify()
}

/** Loads (and re-renders on) shared sessions for these year/section pairs and dates. */
export function useSessions(pairs: [string, string][], from: string, to: string) {
  const [, bump] = useState(0)
  useEffect(() => {
    const f = () => bump(n => n + 1)
    listeners.add(f)
    return () => { listeners.delete(f) }
  }, [])
  const sig = pairs.map(p => p.join('')).join(',') + from + to
  useEffect(() => {
    for (const [y, s] of pairs) loadSessions(y, s, from, to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
}

/** Shared sessions for a section on a date, or null when the section has none around then. */
export function sessionsOn(y: string, s: string, date: string): SessionRow[] | null {
  const e = store[key(y, s)]
  if (!e || !e.rows.length || date < e.from || date > e.to) return null
  return e.rows.filter(r => r.day === date)
}

export function sessionsUpdated(y: string, s: string): string | null {
  const rows = store[key(y, s)]?.rows || []
  return rows.reduce<string | null>((m, r) => (!m || r.updated_at > m ? r.updated_at : m), null)
}

/** A section's classes on a date: shared calendar sessions if any, else the weekly timetable. */
export function sectionClasses(ref: RefData, date: Date, year: string, section: string): ClassItem[] {
  const rows = sessionsOn(year, section, dstr(date))
  if (!rows) return classesFor(ref, date, year, section)
  const names = new Map(ref.timetable.map(r => [r.course_code.toLowerCase(), r.course_name]))
  return rows.map(r => ({
    slot: ref.slots.find(s => overlaps(r.starts, r.ends, s.starts, s.ends))?.slot || 0,
    starts: r.starts, ends: r.ends, code: r.code, name: names.get(r.code.toLowerCase()) || r.code,
    room: r.room ? 'Room ' + r.room : null,
    detail: [r.session ? `Session ${r.session}` : '', r.faculty || ''].filter(Boolean).join(' · '),
  }))
}

/** Shares this student's own-section class sessions from their calendar. Returns how many were saved. */
export async function shareFromCalendar(cal: CalState, year: string, section: string): Promise<number> {
  const [from, to] = shareWindow()
  // One row per day + start + course: the database rejects the whole sync if a session is sent twice.
  const seen = new Set<string>()
  const rows = cal.events.flatMap(e => {
    const s = parseSessionTitle(e.title)
    const day = dstr(new Date(e.start)), starts = hhmm(e.start)
    if (!s || s.section.toUpperCase() !== section.toUpperCase() || day < from || day > to) return []
    const k = `${day}|${starts}|${s.code.slice(0, 20)}`
    if (seen.has(k)) return []
    seen.add(k)
    return [{ day, starts, ends: hhmm(e.end), code: s.code, session: s.session, faculty: s.faculty, room: s.room }]
  })
  if (rows.length < 3) return 0
  const { data, error } = await supabase.rpc('sync_section_sessions', { p_from: from, p_to: to, p_rows: rows })
  if (error) throw new Error(error.message)
  await loadSessions(year, section, from, to, true)
  return (data as number) || 0
}

/** After each calendar sync, share the section's sessions once (if the student allows it). */
export function useShareSessions(cal: CalState | null, year: string, section: string) {
  useEffect(() => {
    if (!cal || !shareEnabled()) return
    const done = local<string>('hub.sharedFor', '')
    const sig = `${cal.at}|${year}|${section}`
    if (done === sig) return
    shareFromCalendar(cal, year, section).then(() => saveLocal('hub.sharedFor', sig)).catch(() => {})
  }, [cal, cal?.at, year, section])
}
