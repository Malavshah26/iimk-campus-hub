// Approximate coordinates, used only to judge whether one stop is "on the way" to another.
export interface Place { k: string; name: string; q: string; lat: number; lng: number }

export const HOME: Place = { k: 'home', name: 'IIMK campus', q: 'IIM Kozhikode', lat: 11.2946, lng: 75.8692 }

export const PLACES: Place[] = [
  { k: 'kgm', name: 'Kunnamangalam town', q: 'Kunnamangalam, Kerala', lat: 11.3047, lng: 75.8778 },
  { k: 'nitc', name: 'NIT Calicut', q: 'NIT Calicut', lat: 11.3216, lng: 75.9338 },
  { k: 'mch', name: 'Medical College', q: 'Government Medical College Kozhikode', lat: 11.2731, lng: 75.8364 },
  { k: 'hilite', name: 'HiLITE Mall', q: 'HiLITE Mall Kozhikode', lat: 11.2484, lng: 75.8335 },
  { k: 'ksrtc', name: 'KSRTC bus stand', q: 'KSRTC Bus Stand Kozhikode', lat: 11.259, lng: 75.787 },
  { k: 'rly', name: 'Kozhikode railway station', q: 'Kozhikode Railway Station', lat: 11.2473, lng: 75.7804 },
  { k: 'beach', name: 'Kozhikode Beach', q: 'Kozhikode Beach', lat: 11.2588, lng: 75.7676 },
  { k: 'rmk', name: 'Ramanattukara', q: 'Ramanattukara, Kerala', lat: 11.1795, lng: 75.864 },
  { k: 'ccj', name: 'Calicut Airport (CCJ)', q: 'Calicut International Airport', lat: 11.1368, lng: 75.9553 },
]
export const PLACE = Object.fromEntries(PLACES.map(p => [p.k, p])) as Record<string, Place>

export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180
  const dl = (b.lat - a.lat) * r
  const dg = (b.lng - a.lng) * r
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(x))
}

type Stop = { q: string }
export function mapsUrl(stops: Stop[]): string {
  const q = (p: Stop) => encodeURIComponent(p.q)
  let u = `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${q(HOME)}&destination=${q(stops[stops.length - 1])}`
  if (stops.length > 1) u += '&waypoints=' + stops.slice(0, -1).map(q).join('%7C')
  return u
}

export interface Compat { ok: boolean; extra: number; label: string; stops: Stop[] }

/** Can a rider going to `mine` share a cab with a ride going to `theirs`? */
export function compat(mine: string, mineText: string, theirs: string, theirsText: string | null): Compat {
  const norm = (s: string | null) => (s || '').trim().toLowerCase()
  if (mine === 'other' || theirs === 'other') {
    const ok = mine === theirs && norm(mineText) !== '' && norm(mineText) === norm(theirsText)
    return { ok, extra: 0, label: ok ? 'Same destination' : '', stops: [{ q: (theirsText || '') + ', Kozhikode' }] }
  }
  const a = PLACE[mine]
  const b = PLACE[theirs]
  if (!a || !b) return { ok: false, extra: 0, label: '', stops: [] }
  if (a === b) return { ok: true, extra: 0, label: 'Same destination', stops: [a] }
  const da = km(HOME, a)
  const db = km(HOME, b)
  const near = da <= db ? a : b
  const far = da <= db ? b : a
  const extra = (Math.min(da, db) + km(near, far) - Math.max(da, db)) * 1.35
  const ok = extra <= Math.max(3, Math.max(da, db) * 0.25)
  return { ok, extra, stops: [near, far], label: ok ? `Drop at ${near.name} on the way, +${Math.max(1, Math.round(extra))} km` : '' }
}
