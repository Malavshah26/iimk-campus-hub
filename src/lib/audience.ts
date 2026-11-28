import { sectionLabel } from './util'

/** Who a notice, event or poll is for. All null = everyone. A section always comes with its year. */
export interface Audience { year: string | null; section: string | null; hostel: string | null }
export const EVERYONE: Audience = { year: null, section: null, hostel: null }
export type AudienceKind = 'all' | 'batch' | 'section' | 'hostel'
export const kindOf = (a: Audience): AudienceKind => (a.hostel ? 'hostel' : a.section ? 'section' : a.year ? 'batch' : 'all')

/**
 * IIMK batches are numbered: the batch that joined in June 2026 is PGP30 (class invites go to pgp30…@iimk.ac.in).
 * Year 1 is the newest batch, Year 2 the one before; the numbers move on every June.
 */
const FIRST = { batch: 30, joined: 2026 }
export function batchName(year: string, now = new Date()): string {
  const academicYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1 // starts in June
  return 'PGP' + (FIRST.batch + (academicYear - FIRST.joined) - (year === '2' ? 1 : 0))
}

/** Audience <-> one select value: '' | 'y:1' | 's:1:C' | 'h:K1'. */
export function encodeAudience(a: Partial<Audience>): string {
  if (a.hostel) return 'h:' + a.hostel
  if (a.year && a.section) return `s:${a.year}:${a.section}`
  if (a.year) return 'y:' + a.year
  return ''
}
export function decodeAudience(v: string): Audience {
  const [k, x, y] = v.split(':')
  if (k === 'h') return { year: null, section: null, hostel: x }
  if (k === 's') return { year: x, section: y, hostel: null }
  if (k === 'y') return { year: x, section: null, hostel: null }
  return EVERYONE
}

/** "PGP30 (Year 1)" */
export const yearLabel = (y: string) => `${batchName(y)} (Year ${y})`

/** 'Everyone' | 'PGP30' | 'PGP30 · Section C' | 'Hostel K1'. */
export function audienceLabel(a: Partial<Audience> | null | undefined): string {
  if (!a) return 'Everyone'
  if (a.hostel) return 'Hostel ' + a.hostel
  if (a.year && a.section) return `${batchName(a.year)} · ${sectionLabel(a.section)}`
  if (a.year) return batchName(a.year)
  return 'Everyone'
}
export const isEveryone = (a: Partial<Audience> | null | undefined) => !a || (!a.year && !a.section && !a.hostel)

/** Is this student in the audience? */
export const inAudience = (a: Partial<Audience>, me: { year: string; section: string; hostel: string | null }) =>
  (!a.hostel || a.hostel === me.hostel) && (!a.year || a.year === me.year) && (!a.section || a.section === me.section)
