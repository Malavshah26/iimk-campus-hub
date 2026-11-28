import { sectionLabel } from './util'

/** Who a notice, event or poll is for. All null = everyone. A section always comes with its year. */
export interface Audience { year: string | null; section: string | null; hostel: string | null }
export const EVERYONE: Audience = { year: null, section: null, hostel: null }

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

export const yearLabel = (y: string) => (y === '1' ? 'Year 1 (PGP 1)' : y === '2' ? 'Year 2 (PGP 2)' : 'Year ' + y)

/** 'Everyone' | 'Year 1' | 'Year 1 · Section C' | 'Hostel K1'. */
export function audienceLabel(a: Partial<Audience> | null | undefined): string {
  if (!a) return 'Everyone'
  if (a.hostel) return 'Hostel ' + a.hostel
  if (a.year && a.section) return `Year ${a.year} · ${sectionLabel(a.section)}`
  if (a.year) return `Year ${a.year}`
  return 'Everyone'
}
export const isEveryone = (a: Partial<Audience> | null | undefined) => !a || (!a.year && !a.section && !a.hostel)

/** Is this student in the audience? */
export const inAudience = (a: Partial<Audience>, me: { year: string; section: string; hostel: string | null }) =>
  (!a.hostel || a.hostel === me.hostel) && (!a.year || a.year === me.year) && (!a.section || a.section === me.section)
