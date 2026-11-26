import { useEffect, useState } from 'react'
import { parseIcs, type CalEvent } from './ical'
import { looksLikeSession, parseSessionTitle } from './sessionTitle'
import { classesFor, type ClassItem, type RefData } from './ref'
import { supabase } from './supabase'
import { hhmm, local, overlaps, saveLocal } from './util'

/**
 * A student's own class calendar (Google Calendar's secret iCal link). The link and the events
 * live only on this device (localStorage); they're never written to the database.
 */
export interface CalState { url: string; filter: string; events: CalEvent[]; at: number; error: string | null }

const KEY = 'hub.cal'
const SOURCE = 'hub.classSource'
const DAY = 86400000
const STALE = 30 * 60000

let state: CalState | null = local<CalState | null>(KEY, null)
const listeners = new Set<() => void>()
function set(s: CalState | null) {
  state = s
  if (s) saveLocal(KEY, s)
  else try { localStorage.removeItem(KEY) } catch { /* storage unavailable */ }
  listeners.forEach(f => f())
}

async function fetchIcs(url: string): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in first.')
  let res: Response
  try {
    res = await fetch('/api/ics', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ url }) })
  } catch {
    throw new Error('No connection right now. Your last synced classes are still shown.')
  }
  if (res.ok) return res.text()
  let msg = `Calendar sync failed (${res.status}).`
  try {
    const j = await res.json()
    if (j?.error) msg = j.error
  } catch {
    if (res.status === 404) msg = 'Calendar sync only works on the live site (not in local testing).'
  }
  throw new Error(msg)
}

export const SESSION_FILTER = 'Session No'

/**
 * Downloads and reads the calendar. Throws on a first connect; keeps the old copy on a refresh.
 * On a first connect without a filter, if the calendar mixes IIMK class sessions ("Session No: …")
 * with other events, it filters to the sessions automatically (changeable in settings).
 */
export async function syncCal(url = state?.url || '', filter = state?.filter ?? ''): Promise<{ count: number; classes: number; autoFiltered: boolean }> {
  if (!url) return { count: 0, classes: 0, autoFiltered: false }
  const first = !state || state.url !== url
  try {
    const text = await fetchIcs(url)
    const now = Date.now()
    const events = parseIcs(text, now - 150 * DAY, now + 200 * DAY).filter(e => !e.allDay && e.end - e.start <= 12 * 3600e3)
    const classes = events.filter(e => looksLikeSession(e.title)).length
    const autoFiltered = first && !filter && classes >= 3 && classes < events.length
    set({ url, filter: autoFiltered ? SESSION_FILTER : filter, events, at: now, error: null })
    return { count: events.length, classes, autoFiltered }
  } catch (e) {
    if (state && state.url === url) { set({ ...state, error: (e as Error).message }); return { count: state.events.length, classes: 0, autoFiltered: false } }
    throw e
  }
}

export const disconnectCal = () => { set(null); saveLocal(SOURCE, 'cal') }
export const setCalFilter = (filter: string) => { if (state) set({ ...state, filter }) }

/** The calendar, re-rendering the component whenever it changes. */
export function useCal(): CalState | null {
  const [, bump] = useState(0)
  useEffect(() => {
    const f = () => bump(n => n + 1)
    listeners.add(f)
    return () => { listeners.delete(f) }
  }, [])
  return state
}

/** Refreshes in the background: at start, every few minutes if stale, and when the app is reopened. */
export function useCalAutoSync() {
  useEffect(() => {
    const tick = () => { if (state && Date.now() - state.at > STALE && navigator.onLine && document.visibilityState === 'visible') syncCal().catch(() => {}) }
    tick()
    const t = setInterval(tick, 5 * 60000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [])
}

/** 'cal' (my Google Calendar) or 'tt' (section timetable). */
export const classSource = (): 'cal' | 'tt' => local<'cal' | 'tt'>(SOURCE, 'cal')
export const setClassSource = (s: 'cal' | 'tt') => { saveLocal(SOURCE, s); listeners.forEach(f => f()) }

export function calEventsOn(cal: CalState, date: Date): CalEvent[] {
  const d0 = new Date(date)
  d0.setHours(0, 0, 0, 0)
  const a = d0.getTime(), b = a + DAY
  const words = cal.filter.split(',').map(w => w.trim().toLowerCase()).filter(Boolean)
  return cal.events.filter(e => e.start < b && e.end > a && (!words.length || words.some(w => `${e.title} ${e.location}`.toLowerCase().includes(w))))
}

/**
 * The student's classes on a date: from their calendar if connected (and chosen), otherwise the
 * section timetable. Calendar sessions are matched to class periods so attendance lines up.
 */
export function myClasses(ref: RefData, date: Date, year: string, section: string, useCalendar = true): ClassItem[] {
  if (!state || !useCalendar || classSource() !== 'cal') return classesFor(ref, date, year, section)
  // The calendar is the source of truth: its titles group attendance by course.
  const names = new Map<string, string>()
  for (const r of ref.timetable) if (!names.has(r.course_code.toLowerCase()) || (r.year === year && r.section === section)) names.set(r.course_code.toLowerCase(), r.course_name)
  return calEventsOn(state, date).map(e => {
    const starts = hhmm(e.start), ends = hhmm(e.end)
    const slot = ref.slots.find(s => overlaps(starts, ends, s.starts, s.ends))?.slot || 0
    const s = parseSessionTitle(e.title) // "Session No: 15 - EE(C)-LME-(CR B1)"
    if (s) return {
      slot, starts, ends, code: s.code, name: names.get(s.code.toLowerCase()) || s.code,
      room: s.room ? 'Room ' + s.room : e.location || null, detail: [`Session ${s.session}`, s.faculty].filter(Boolean).join(' · '),
    }
    return { slot, starts, ends, code: courseKey(e.title), name: e.title, room: e.location || null }
  })
}

/** The section most of the calendar's sessions are for ("EE(C)" -> "C"), or '' if unclear. */
export function calendarSection(cal: CalState | null): string {
  if (!cal) return ''
  const n = new Map<string, number>()
  for (const e of cal.events) {
    const s = parseSessionTitle(e.title)?.section.toUpperCase()
    if (s) n.set(s, (n.get(s) || 0) + 1)
  }
  const [best] = [...n.entries()].sort((a, b) => b[1] - a[1])
  const total = [...n.values()].reduce((a, b) => a + b, 0)
  return best && best[1] >= 3 && best[1] / total >= 0.8 ? best[0] : ''
}

/** "FM-I Financial Management I (Sec A) - rescheduled" -> "FM-I Financial Management I": one attendance group per course. */
export const courseKey = (title: string) =>
  title.replace(/\s*[-–|:]\s*(rescheduled|extra|make[- ]?up|shifted|moved|cancelled|tentative)\b.*$/i, '').replace(/\s*\((sec(tion)?|grp|group)[^)]*\)\s*/gi, ' ').trim().slice(0, 40) || title.slice(0, 40)
