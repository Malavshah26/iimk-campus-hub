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
  /** The class's real session number, counted from the course's first class (see numberSessions). */
  number?: number
}

/** "FM-I Financial Management I (Sec A) - rescheduled" -> "FM-I Financial Management I": one attendance group per course. */
export const courseKey = (title: string) =>
  title.replace(/\s*[-–|:]\s*(rescheduled|extra|make[- ]?up|shifted|moved|cancelled|tentative)\b.*$/i, '').replace(/\s*\((sec(tion)?|grp|group)[^)]*\)\s*/gi, ' ').trim().slice(0, 40) || title.slice(0, 40)

/** [15] -> "15"; [18..24] -> "18–24"; [19, 22] -> "19, 22". */
export function sessionRange(ns: number[]): string {
  const s = [...new Set(ns)].sort((a, b) => a - b)
  if (s.length <= 1) return s.length ? String(s[0]) : ''
  const run = s.every((n, i) => i === 0 || n === s[i - 1] + 1)
  return run ? `${s[0]}–${s[s.length - 1]}` : s.join(', ')
}

/** [15] -> "Session 15"; [18..24] -> "Sessions 18–24"; [19, 22] -> "Sessions 19, 22". */
export function sessionsLabel(ns: number[]): string {
  const n = new Set(ns).size
  return n ? `Session${n > 1 ? 's' : ''} ${sessionRange(ns)}` : ''
}

/**
 * What to show for a class: its counted number ("Session 18"), plus what the calendar said when
 * several sessions were stacked into this one slot ("Session 18 (listed as 18–24)").
 */
export function sessionText(m: Pick<MergedEvent, 'number' | 'sessions'>): string {
  if (m.number === undefined) return sessionsLabel(m.sessions)
  const listed = new Set(m.sessions).size > 1 ? ` (listed as ${sessionRange(m.sessions)})` : ''
  return `Session ${m.number}${listed}`
}

/**
 * Numbers each course's classes in time order, counting from its first class: that class's own session
 * number (1 if it has none), then one more for every class after it. A slot is one class however many
 * entries the calendar has for it, so stacked sessions ("18–24" all at 2:40) count once and the classes
 * after them carry on from there. Sets `number` on session events and returns the same list.
 */
export function numberSessions(merged: MergedEvent[]): MergedEvent[] {
  const byCourse = new Map<string, MergedEvent[]>()
  for (const m of merged) {
    if (!m.isSession) continue
    const k = `${m.code.toLowerCase()}|${m.section.toLowerCase()}`
    if (!byCourse.has(k)) byCourse.set(k, [])
    byCourse.get(k)!.push(m)
  }
  for (const list of byCourse.values()) {
    list.sort((a, b) => a.start - b.start)
    const first = list[0].sessions.length ? Math.min(...list[0].sessions) : 1
    list.forEach((m, i) => { m.number = first + i })
  }
  return merged
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
