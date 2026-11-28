/** Auto and taxi drivers live in `contacts` under this group; the Transport page lists them. */
export const AUTO_GROUP = 'Autos & taxis'
/** Campus medical numbers (contacts group): names containing "Ambulance" and "Dispensary" become the Medical page's call buttons. */
export const MEDICAL_GROUP = 'Medical'

const digitsOf = (s: string) => s.replace(/\D/g, '')

/** Indian mobile (10 digits starting 6-9, optionally with 91 / 0 in front). */
export function mobileDigits(raw: string): string {
  let d = digitsOf(raw)
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^[6-9]\d{9}$/.test(d) ? d : ''
}

/** "+919800012345" -> "+91 98000 12345"; anything that isn't a mobile number is kept as written. */
export function fmtPhone(raw: string): string {
  const d = mobileDigits(raw)
  return d ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : raw.trim()
}

export const waMobile = (raw: string) => {
  const d = mobileDigits(raw)
  return d ? 'https://wa.me/91' + d : ''
}

export interface AutoRow { name: string; number: string; note: string }

const PHONE = /\+?\d[\d -]{6,}\d/
const tidy = (s: string) => s.replace(/[.:,;|()–—_*]+/g, ' ').replace(/(^|\s)-+(\s|$)/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Reads a pasted list such as a WhatsApp message:
 *   "Ravi. +919800012345" / "Anil.+91 98000 12346" / "Suresh - 98000 12347 (nights)".
 * One driver per line; lines without a phone number (headings) are skipped; repeats are dropped.
 */
export function parseAutos(text: string): AutoRow[] {
  const out: AutoRow[] = []
  const seen = new Set<string>()
  for (const line of text.split(/\r?\n/)) {
    const m = PHONE.exec(line)
    if (!m) continue
    const d = digitsOf(m[0])
    if (d.length < 8 || d.length > 13) continue
    const key = mobileDigits(m[0]) || d
    if (seen.has(key)) continue
    seen.add(key)
    const before = tidy(line.slice(0, m.index)), after = tidy(line.slice(m.index + m[0].length))
    out.push({ name: (before || after || 'Driver').slice(0, 60), number: fmtPhone(m[0]), note: (before ? after : '').slice(0, 80) })
  }
  return out
}
