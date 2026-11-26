export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const pad = (n: number) => String(n).padStart(2, '0')
export const dstr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => dstr(new Date())
export const mins = (t: string | null | undefined) => {
  const [h, m] = String(t || '0:0').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
export const nowMin = () => {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}
export const hhmm = (iso: string | number | Date) => {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const inFmt = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`)
export const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()
export const isWeekend = (d = new Date()) => d.getDay() === 0 || d.getDay() === 6
export const rupee = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN')

export function dayLabel(s: string): string {
  const t = today()
  const tm = dstr(new Date(Date.now() + 864e5))
  if (s === t) return 'Today'
  if (s === tm) return 'Tomorrow'
  const d = new Date(s + 'T00:00')
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Monday of the current week, shifted by `offset` weeks. */
export function monday(offset = 0): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7)
  return d
}

export function weekDays(offset = 0, count = 6): Date[] {
  const m = monday(offset)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(m)
    d.setDate(m.getDate() + i)
    return d
  })
}

/** https://wa.me link for an Indian 10-digit number, or '' if unusable. */
export function waLink(phone: string | null | undefined): string {
  let d = String(phone || '').replace(/\D/g, '')
  if (d.length === 10) d = '91' + d
  return d.length >= 11 ? 'https://wa.me/' + d : ''
}

export const sectionLabel = (s: string) => (s.length > 1 ? s : 'Section ' + s)

export function local<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
export function saveLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

/** Two HH:MM ranges overlap (touching ends don't count). */
export const overlaps = (a1: string, a2: string, b1: string, b2: string) => mins(a1) < mins(b2) && mins(b1) < mins(a2)

const icsStamp = (date: string, hm: string) => new Date(`${date}T${hm}:00+05:30`).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export interface CalItem { title: string; date: string; starts: string; ends: string; place?: string | null; details?: string | null }

/** "Add to Google Calendar" link (times are campus time, IST). */
export function googleCal(e: CalItem): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE', text: e.title, dates: `${icsStamp(e.date, e.starts)}/${icsStamp(e.date, e.ends)}`,
    details: e.details || '', location: e.place || '', ctz: 'Asia/Kolkata',
  })
  return 'https://calendar.google.com/calendar/render?' + p.toString()
}

/** Downloads an .ics file that any calendar app can open. */
export function downloadIcs(e: CalItem) {
  const esc = (s: string) => s.replace(/[\\;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n')
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IIMK Campus Hub//EN', 'BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@campushub`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART:${icsStamp(e.date, e.starts)}`, `DTEND:${icsStamp(e.date, e.ends)}`, `SUMMARY:${esc(e.title)}`,
    e.place ? `LOCATION:${esc(e.place)}` : '', e.details ? `DESCRIPTION:${esc(e.details)}` : '',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = url
  a.download = e.title.replace(/[^\w ]+/g, '').trim().slice(0, 40) + '.ics'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
