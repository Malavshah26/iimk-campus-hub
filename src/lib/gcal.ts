import { useEffect, useState } from 'react'
import { parseIcs, type CalEvent } from './ical'
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

/** Downloads and reads the calendar. Throws on a first connect; keeps the old copy on a refresh. */
export async function syncCal(url = state?.url || '', filter = state?.filter ?? ''): Promise<number> {
  if (!url) return 0
  try {
    const text = await fetchIcs(url)
    const now = Date.now()
    const events = parseIcs(text, now - 150 * DAY, now + 200 * DAY).filter(e => !e.allDay && e.end - e.start <= 12 * 3600e3)
    set({ url, filter, events, at: now, error: null })
    return events.length
  } catch (e) {
    if (state && state.url === url) { set({ ...state, error: (e as Error).message }); return state.events.length }
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
  // The calendar is the source of truth: its titles group attendance (e.g. "FM-I Financial Management").
  return calEventsOn(state, date).map(e => {
    const starts = hhmm(e.start), ends = hhmm(e.end)
    const slot = ref.slots.find(s => overlaps(starts, ends, s.starts, s.ends))?.slot || 0
    return { slot, starts, ends, code: courseKey(e.title), name: e.title, room: e.location || null }
  })
}

/** "FM-I Financial Management I (Sec A) - rescheduled" -> "FM-I Financial Management I": one attendance group per course. */
export const courseKey = (title: string) =>
  title.replace(/\s*[-–|:]\s*(rescheduled|extra|make[- ]?up|shifted|moved|cancelled|tentative)\b.*$/i, '').replace(/\s*\((sec(tion)?|grp|group)[^)]*\)\s*/gi, ' ').trim().slice(0, 40) || title.slice(0, 40)
