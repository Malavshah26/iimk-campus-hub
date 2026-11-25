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
