import type { ShuttleTrip } from './types'
import { isWeekend, mins, pad } from './util'

/** Minutes between consecutive stops when the timetable doesn't say (the sheet shows ~5). */
export const HOP_MIN = 5

export const hm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
/** '24:00' is stored for midnight at the end of the day; show it as 00:00. */
export const showTime = (t: string) => (mins(t) >= 1440 ? hm(mins(t) - 1440) : t)

export const runsToday = (t: ShuttleTrip, d = new Date()) => t.days === 'all' || (t.days === 'weekend') === isWeekend(d)

/** Time the shuttle is at stop number `i`: from the sheet if given, else estimated. */
export function timeAt(t: ShuttleTrip, i: number): { t: string; est: boolean } {
  if (i === 0) return { t: t.depart, est: false }
  if (t.at[i]) return { t: t.at[i], est: false }
  let j = i - 1
  while (j > 0 && !t.at[j]) j--
  const base = j === 0 ? t.depart : t.at[j]
  return { t: hm(mins(base) + HOP_MIN * (i - j)), est: true }
}

/** All stops, most-served first. */
export function stopsOf(trips: ShuttleTrip[]): string[] {
  const n = new Map<string, number>()
  for (const t of trips) for (const s of t.stops.slice(0, -1)) n.set(s, (n.get(s) || 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])
}

export interface Leg { trip: ShuttleTrip; i: number; at: string; est: boolean; rest: { stop: string; t: string; est: boolean }[] }

/** Trips you can board at `from` (optionally reaching `to`), with the time at `from`. */
export function legsFrom(trips: ShuttleTrip[], from: string, to = ''): Leg[] {
  const out: Leg[] = []
  for (const trip of trips) {
    const i = trip.stops.findIndex((s, k) => s === from && k < trip.stops.length - 1)
    if (i < 0) continue
    if (to && !trip.stops.slice(i + 1).includes(to)) continue
    const here = timeAt(trip, i)
    const rest = trip.stops.slice(i + 1).map((stop, k) => ({ stop, ...timeAt(trip, i + 1 + k) }))
    out.push({ trip, i, at: here.t, est: here.est, rest })
  }
  return out.sort((a, b) => mins(a.at) - mins(b.at))
}

/* ------------------------------------------------------------ spreadsheet import */

/** '8:55 AM', '10.25 am', '1:35 P.M', '12.00 AM' (midnight -> 24:00), '20:05' -> 'HH:MM'. */
export function parseTime(raw: string): string | null {
  const m = /(\d{1,2})\s*[.:]\s*(\d{2})\s*(a|p)?\.?\s*m?\.?/i.exec(raw)
  if (!m) return null
  let h = +m[1]
  const min = +m[2]
  const ap = m[3]?.toLowerCase()
  if (ap === 'p' && h < 12) h += 12
  if (ap === 'a' && h === 12) h = 24 // the last trip "12:00 AM" runs at the end of the day
  if (h > 24 || min > 59) return null
  return hm(h * 60 + min)
}

export interface ParsedTrips { trips: Omit<ShuttleTrip, 'id'>[]; errors: string[] }

/**
 * Rows copied from the bus sheet: [Sl. No.,] Time, From, To, To[, Extended to].
 * A stop may carry its own time in brackets, e.g. "Phase V Campus (11.55 am)".
 * "C&D Housing & Return to PGP" becomes C&D Housing, then PGP Auditorium.
 */
export function parseShuttle(text: string): ParsedTrips {
  const trips: Omit<ShuttleTrip, 'id'>[] = []
  const errors: string[] = []
  const names = new Map<string, string>() // lower-case -> first spelling seen
  const canon = (s: string) => {
    const k = s.toLowerCase().replace(/\s+/g, ' ').trim()
    if (!names.has(k)) names.set(k, s.replace(/\s+/g, ' ').trim())
    return names.get(k)!
  }
  let first = true
  text.split(/\r?\n/).forEach((line, idx) => {
    if (!line.trim()) return
    let c = (line.includes('\t') ? line.split('\t') : line.split(',')).map(x => x.trim()).filter(Boolean)
    const isHeader = first && /\btime\b/i.test(line) && !c.slice(0, 2).some(x => parseTime(x))
    first = false
    if (isHeader) return
    if (c.length && /^\d{1,3}$/.test(c[0]) && c[1] && parseTime(c[1])) c = c.slice(1) // serial number column
    const depart = parseTime(c[0])
    if (!depart) return errors.push(`Line ${idx + 1}: no departure time in “${c[0]}”`)
    const stops: string[] = []
    const at: string[] = []
    let note: string | null = null
    for (const cell of c.slice(1)) {
      const [main, back] = cell.split(/\s*&\s*return\s+to\s+/i)
      const t = /\(([^)]*)\)/.exec(main)
      const name = main.replace(/\([^)]*\)/g, '').trim()
      if (!name) continue
      stops.push(canon(name))
      at.push(t ? parseTime(t[1]) || '' : '')
      if (back) { stops.push(back.trim()); at.push(''); note = 'Returns to ' + back.trim() }
    }
    if (stops.length < 2) return errors.push(`Line ${idx + 1}: needs at least two stops`)
    trips.push({ depart, stops, at: at.some(Boolean) ? at : [], days: 'all', note })
  })
  // "Return to PGP" -> the full stop name that starts with PGP.
  const full = [...names.values()]
  for (const t of trips) t.stops = t.stops.map(s => full.find(f => f.toLowerCase() === s.toLowerCase()) || full.find(f => f.toLowerCase().startsWith(s.toLowerCase())) || s)
  return { trips, errors }
}

/** Stop shown until a student picks their own on the Bus tab. */
export const DEFAULT_STOP = 'PGP Auditorium'
