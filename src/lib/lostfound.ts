import type { LostItem } from './types'
import { dstr } from './util'

/** Vocabulary shared by the Lost & found page and the match notifications (codes are stored, labels shown). */
export const CATS: Record<string, string> = {
  electronics: 'Electronics', idcard: 'ID card & documents', wallet: 'Wallet & money', keys: 'Keys',
  bag: 'Bag', books: 'Books & notes', clothing: 'Clothing', bottle: 'Bottle & tiffin',
  accessories: 'Watch, glasses & jewellery', umbrella: 'Umbrella', sports: 'Sports gear', other: 'Something else',
}
export const AREAS: Record<string, string> = {
  classrooms: 'Classrooms (A, B, C blocks)', library: 'Library', faculty: 'Faculty blocks', admin: 'Admin block',
  mess: 'Mess / dining', hostel: 'Hostels', canteen: 'Canteen / shops', sports: 'Sports complex', pool: 'Swimming pool',
  auditorium: 'PGP Auditorium', amphi: 'Amphitheatre', mdc: 'MDC', health: 'Medical centre', gate: 'Main gate / security',
  bus: 'Campus shuttle / bus', phase5: 'Phase V campus', housing: 'C&D Housing', town: 'Kunnamangalam town',
  city: 'Kozhikode city / travel', other: 'Somewhere else',
}
export const TIMES: Record<string, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', night: 'Night', unsure: 'Not sure' }
export const HELD: Record<string, string> = { finder: 'With the finder', security: 'Handed to security, main gate', admin: 'Handed to the admin office' }
export const REPLY_KINDS: Record<'lost' | 'found', [string, string][]> = {
  found: [['claim', 'This is mine'], ['note', 'Comment']],
  lost: [['found', 'I found it'], ['seen', 'I saw it somewhere'], ['note', 'Comment']],
}
export const KIND_LABEL: Record<string, string> = { claim: 'Says it’s theirs', found: 'Found it', seen: 'Spotted it', note: '' }
export const REASONS: Record<string, string> = { spam: 'Spam or fake', wrong: 'Wrong or misleading', personal: 'Shares private info', done: 'Already returned' }

const DAY = 864e5
export const isStale = (it: Pick<LostItem, 'status' | 'created_at'>) => it.status === 'open' && Date.now() - new Date(it.created_at).getTime() > 30 * DAY
export const placeText = (it: Pick<LostItem, 'area' | 'place'>) =>
  [it.area ? AREAS[it.area] : '', it.place || ''].filter(Boolean).join(', ') || 'Place not given'
export function fmtDate(d: string) {
  const dt = new Date(d + 'T00:00:00')
  if (isNaN(dt.getTime())) return d
  const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  if (dt.getFullYear() !== new Date().getFullYear()) o.year = 'numeric'
  return dt.toLocaleDateString('en-IN', o)
}
export const whenText = (it: Pick<LostItem, 'item_date' | 'time_of_day'>) =>
  fmtDate(it.item_date) + (it.time_of_day && it.time_of_day !== 'unsure' ? ', ' + TIMES[it.time_of_day].toLowerCase() : '')
export function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  const m = s / 60; if (m < 60) return Math.floor(m) + ' min ago'
  const h = m / 60; if (h < 24) return Math.floor(h) + ' h ago'
  const d = Math.floor(h / 24); if (d < 7) return d + (d === 1 ? ' day ago' : ' days ago')
  return fmtDate(dstr(new Date(iso)))
}

/* Matching: lost <-> found posts that look like the same thing. All in the browser. */
type M = Pick<LostItem, 'id' | 'kind' | 'status' | 'hidden' | 'category' | 'area' | 'item_date' | 'item' | 'description'>
const STOP = new Set('the and with for from near this that have has had was were are its my our your their into onto lost found item one some very left right inside outside'.split(' '))
const tokens = (it: M) => new Set(((it.item || '') + ' ' + (it.description || '')).toLowerCase().match(/[a-z0-9]+/g)?.filter(w => w.length > 2 && !STOP.has(w)) || [])
const shift = (d: string, n: number) => { const t = new Date(d + 'T00:00:00'); t.setDate(t.getDate() + n); return dstr(t) }

/**
 * 0 = no match; MATCH_MIN or more = worth showing. Same category +3, same area +1, up to +4 for shared words.
 * So a match needs the same category plus two shared words, or one shared word in the same place.
 */
export function matchScore(a: M, b: M): number {
  if (a.kind === b.kind || a.status !== 'open' || b.status !== 'open' || a.hidden || b.hidden) return 0
  let s = 0
  const ca = a.category || 'other', cb = b.category || 'other'
  if (ca === cb) s += 3
  else if (ca !== 'other' && cb !== 'other') return 0
  const lost = a.kind === 'lost' ? a : b, found = a.kind === 'lost' ? b : a
  // Something found well before it was lost can't be it.
  if (found.item_date && lost.item_date && found.item_date < shift(lost.item_date, -2)) return 0
  if (a.area && a.area === b.area) s += 1
  const ta = tokens(a), tb = tokens(b)
  let o = 0
  ta.forEach(w => { if (tb.has(w)) o++ })
  return s + Math.min(o, 4)
}
export const MATCH_MIN = 5
export function matchesFor<T extends M>(it: T, all: T[], max = 4): T[] {
  if (it.status !== 'open') return []
  return all.filter(o => o.id !== it.id).map(o => [o, matchScore(it, o)] as const)
    .filter(([, s]) => s >= MATCH_MIN).sort((x, y) => y[1] - x[1]).slice(0, max).map(x => x[0])
}
