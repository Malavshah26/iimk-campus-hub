/**
 * Minimal iCalendar (.ics) reader for class schedules: single events, weekly/daily repeats
 * (RRULE with INTERVAL, BYDAY, UNTIL, COUNT), skipped dates (EXDATE), moved or cancelled
 * sessions (RECURRENCE-ID, STATUS:CANCELLED). Campus time is IST (UTC+5:30, no daylight saving),
 * so times without "Z" are read as IST. No imports, so it can be tested on its own.
 */

export interface CalEvent { start: number; end: number; title: string; location: string; allDay: boolean }

interface Prop { name: string; params: Record<string, string>; value: string }

const IST_MIN = 330
const DAY = 86400000
const DOW: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

function parseLine(line: string): Prop | null {
  let i = 0
  let quoted = false
  for (; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') quoted = !quoted
    else if (ch === ':' && !quoted) break
  }
  if (i >= line.length) return null
  const [name, ...ps] = line.slice(0, i).split(';')
  const params: Record<string, string> = {}
  for (const p of ps) {
    const k = p.indexOf('=')
    if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, '')
  }
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) }
}

const unescapeText = (v: string) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim()

function tzOffset(tz?: string): number {
  if (!tz) return IST_MIN
  if (/^(UTC|GMT|Etc\/UTC|Etc\/GMT|Z)$/i.test(tz)) return 0
  return IST_MIN // Asia/Kolkata, and anything else is assumed to be campus time
}

/** iCal date or date-time -> epoch ms. */
export function icalTime(value: string, params: Record<string, string> = {}): { ms: number; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim())
  if (!m) return null
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))
  if (!m[4]) return { ms: utc - IST_MIN * 60000, allDay: true }
  if (m[7]) return { ms: utc, allDay: false }
  return { ms: utc - tzOffset(params.TZID) * 60000, allDay: false }
}

function duration(v: string): number {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v.trim())
  if (!m) return 0
  const ms = ((+(m[2] || 0) * 7 + +(m[3] || 0)) * 24 * 3600 + +(m[4] || 0) * 3600 + +(m[5] || 0) * 60 + +(m[6] || 0)) * 1000
  return m[1] === '-' ? -ms : ms
}

/** Weekday (0 = Sunday) of an instant, on campus. */
const istDow = (ms: number) => new Date(ms + IST_MIN * 60000).getUTCDay()

/** Start times of a repeating event between `from` and `to` (before removing EXDATEs). */
function expand(start: number, rule: string, from: number, to: number): number[] {
  const r: Record<string, string> = {}
  for (const kv of rule.split(';')) { const [k, v] = kv.split('='); if (k && v) r[k.toUpperCase()] = v }
  const freq = r.FREQ
  if (freq !== 'DAILY' && freq !== 'WEEKLY') return [start] // monthly/yearly repeats aren't used for classes
  const interval = Math.max(1, +(r.INTERVAL || 1))
  const count = r.COUNT ? +r.COUNT : Infinity
  let until = Infinity
  if (r.UNTIL) {
    const u = icalTime(r.UNTIL)
    if (u) until = u.allDay ? u.ms + DAY - 1 : u.ms
  }
  const byDay = r.BYDAY ? r.BYDAY.split(',').map(d => DOW[d.slice(-2).toUpperCase()]).filter(d => d !== undefined) : null
  const startDow = istDow(start)
  const toMonday = (startDow + 6) % 7 // days from the Monday of the first week
  const out: number[] = []
  let n = 0
  for (let t = start; t <= until && t <= to && n < count; t += DAY) {
    const days = Math.round((t - start) / DAY)
    let ok: boolean
    if (freq === 'DAILY') ok = days % interval === 0
    else {
      const week = Math.floor((days + toMonday) / 7)
      const dow = istDow(t)
      ok = week % interval === 0 && (byDay ? byDay.includes(dow) : dow === startDow)
    }
    if (!ok) continue
    n++
    if (t >= from - DAY) out.push(t)
  }
  return out
}

interface Raw { uid: string; start?: { ms: number; allDay: boolean }; end?: number; dur?: number; title: string; location: string; rrule?: string; exdates: number[]; recurrenceId?: number; cancelled: boolean }

/** Parses an .ics file and returns the event instances that overlap [from, to], sorted by start. */
export function parseIcs(text: string, from: number, to: number): CalEvent[] {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/)
  const raws: Raw[] = []
  let cur: Raw | null = null
  let depth = 0 // skip nested blocks such as VALARM
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { uid: '', title: '', location: '', exdates: [], cancelled: false }; depth = 0; continue }
    if (!cur) continue
    if (line === 'END:VEVENT') { raws.push(cur); cur = null; continue }
    if (line.startsWith('BEGIN:')) { depth++; continue }
    if (line.startsWith('END:')) { depth--; continue }
    if (depth > 0) continue
    const p = parseLine(line)
    if (!p) continue
    switch (p.name) {
      case 'UID': cur.uid = p.value; break
      case 'SUMMARY': cur.title = unescapeText(p.value); break
      case 'LOCATION': cur.location = unescapeText(p.value); break
      case 'DTSTART': cur.start = icalTime(p.value, p.params) || undefined; break
      case 'DTEND': cur.end = icalTime(p.value, p.params)?.ms; break
      case 'DURATION': cur.dur = duration(p.value); break
      case 'RRULE': cur.rrule = p.value; break
      case 'EXDATE': for (const v of p.value.split(',')) { const t = icalTime(v, p.params); if (t) cur.exdates.push(t.ms) } break
      case 'RECURRENCE-ID': cur.recurrenceId = icalTime(p.value, p.params)?.ms; break
      case 'STATUS': cur.cancelled = p.value.trim().toUpperCase() === 'CANCELLED'; break
    }
  }

  // Moved or cancelled sessions of a repeating event replace that one occurrence.
  const replaced = new Map<string, Set<number>>()
  for (const r of raws) if (r.recurrenceId !== undefined) {
    if (!replaced.has(r.uid)) replaced.set(r.uid, new Set())
    replaced.get(r.uid)!.add(r.recurrenceId)
  }

  const out: CalEvent[] = []
  for (const r of raws) {
    if (!r.start) continue
    const len = r.end !== undefined ? r.end - r.start.ms : r.dur ?? (r.start.allDay ? DAY : 0)
    const add = (s: number) => { if (s < to && s + len > from) out.push({ start: s, end: s + len, title: r.title || '(no title)', location: r.location, allDay: r.start!.allDay }) }
    if (r.recurrenceId !== undefined || !r.rrule) {
      if (!r.cancelled) add(r.start.ms)
      continue
    }
    if (r.cancelled) continue
    const skip = new Set([...r.exdates, ...(replaced.get(r.uid) || [])])
    for (const s of expand(r.start.ms, r.rrule, from, to)) if (!skip.has(s)) add(s)
  }
  // The same invite can be in a calendar twice (sent twice, or under a new UID): keep one copy.
  const seen = new Set<string>()
  return out.sort((a, b) => a.start - b.start).filter(e => {
    const k = `${e.start}|${e.end}|${e.title.replace(/\s+/g, ' ').trim().toLowerCase()}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
