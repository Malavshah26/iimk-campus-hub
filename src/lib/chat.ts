import { supabase } from './supabase'
import { useLive } from './useLive'
import type { Profile } from './types'
import { local, saveLocal, sectionLabel } from './util'

/** Group chat rooms: your section (of your year) and your hostel. Room ids match the database's check. */
export interface Room { id: string; label: string }
export function myRooms(p: Pick<Profile, 'year' | 'section' | 'hostel'>): Room[] {
  const rooms = [{ id: `sec:${p.year}:${p.section}`, label: `Year ${p.year} · ${sectionLabel(p.section)}` }]
  if (p.hostel) rooms.push({ id: `hostel:${p.hostel}`, label: `Hostel ${p.hostel}` })
  return rooms
}

/** When this device last read each room (ISO time of the newest message seen). */
const SEEN = 'hub.chatSeen'
export const seenAt = (room: string) => local<Record<string, string>>(SEEN, {})[room] || ''
export function markSeen(room: string, at: string) {
  const all = local<Record<string, string>>(SEEN, {})
  if (!all[room] || at > all[room]) { all[room] = at; saveLocal(SEEN, all); window.dispatchEvent(new Event('hub:chatseen')) }
}

/** Unread messages per room (from others, newer than what this device has seen), for the tab badge. */
export function useChatUnread(uid: string, rooms: Room[]): Record<string, number> {
  const ids = rooms.map(r => r.id)
  const since = new Date(Date.now() - 14 * 864e5).toISOString()
  const recent = useLive<{ room: string; created_at: string; user_id: string }>('chat-unread-' + ids.join(','),
    () => supabase.from('chat_messages').select('room,created_at,user_id').in('room', ids).gt('created_at', since)
      .neq('user_id', uid).order('created_at', { ascending: false }).limit(200) as never, ['chat_messages'])
  const out: Record<string, number> = {}
  for (const r of rooms) {
    const s = seenAt(r.id)
    out[r.id] = recent.data.filter(m => m.room === r.id && (!s || m.created_at > s)).length
  }
  return out
}
