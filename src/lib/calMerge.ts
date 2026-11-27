import type { CalEvent } from './ical'
import { parseSessionTitle } from './sessionTitle'
import { hhmm } from './util'

/**
 * Class calendars sometimes hold the same class more than once: an invite sent twice (two events, same
 * session), or several sessions of one course stacked in one slot ("Session 18" … "Session 24", all
 * Tue 2:40). A section can only be in one session of a course at a time, so these become one class.
 * Different courses at the same time (electives, real clashes) stay separate.
 */
export interface MergedEvent {
  start: number; end: number; title: string; location: string
  /** Course code ("EE"), or a cleaned-up title for events that aren't IIMK sessions. */
  code: string
  section: string
  sessions: number[]
  faculty: string
  room: string
  /** How many calendar events were merged into this one (1 = no duplicates). */
  copies: number
  isSession: boolean
}

/** "FM-I Financial Management I (Sec A) - rescheduled" -> "FM-I Financial Management I": one attendance group per course. */
export const courseKey = (title: string) =>
  title.replace(/\s*[-–|:]\s*(rescheduled|extra|make[- ]?up|shifted|moved|cancelled|tentative)\b.*$/i, '').replace(/\s*\((sec(tion)?|grp|group)[^)]*\)\s*/gi, ' ').trim().slice(0, 40) || title.slice(0, 40)

/** [15] -> "Session 15"; [18..24] -> "Sessions 18–24"; [19, 22] -> "Sessions 19, 22". */
export function sessionsLabel(ns: number[]): string {
  const s = [...new Set(ns)].sort((a, b) => a - b)
  if (!s.length) return ''
  if (s.length === 1) return `Session ${s[0]}`
  const run = s.every((n, i) => i === 0 || n === s[i - 1] + 1)
  return run ? `Sessions ${s[0]}–${s[s.length - 1]}` : `Sessions ${s.join(', ')}`
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))]

/** Merges duplicates: one entry per course (and section) and start time, keeping the calendar's order. */
export function mergeEvents(events: CalEvent[]): MergedEvent[] {
  const out: MergedEvent[] = []
  const byKey = new Map<string, { m: MergedEvent; faculty: string[]; rooms: string[] }>()
  for (const e of events) {
    const s = parseSessionTitle(e.title)
    const code = s ? s.code : courseKey(e.title)
    const section = s?.section || ''
    const key = `${hhmm(e.start)}|${new Date(e.start).toDateString()}|${code.toLowerCase()}|${section.toLowerCase()}`
    const hit = byKey.get(key)
    if (hit) {
      hit.m.copies++
      hit.m.end = Math.max(hit.m.end, e.end)
      if (s && /^\d+$/.test(s.session)) hit.m.sessions.push(+s.session)
      if (s) { hit.faculty.push(s.faculty); hit.rooms.push(s.room) }
      if (!hit.m.location && e.location) hit.m.location = e.location
      continue
    }
    const m: MergedEvent = {
      start: e.start, end: e.end, title: e.title, location: e.location, code, section,
      sessions: s && /^\d+$/.test(s.session) ? [+s.session] : [], faculty: s?.faculty || '', room: s?.room || '', copies: 1, isSession: !!s,
    }
    byKey.set(key, { m, faculty: [m.faculty], rooms: [m.room] })
    out.push(m)
  }
  for (const { m, faculty, rooms } of byKey.values()) {
    m.faculty = uniq(faculty).join(', ')
    m.room = uniq(rooms).join(' / ')
  }
  return out
}
