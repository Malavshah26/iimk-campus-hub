import { useEffect, useRef } from 'react'
import { useMe } from '../lib/auth'
import { notify } from '../lib/notify'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useLive } from '../lib/useLive'
import { dayLabel, today } from '../lib/util'
import { attKey, reminderTime } from '../lib/attendance'
import { myClasses } from '../lib/gcal'
import { useRef_ } from '../lib/ref'

const STATUS: Record<string, string> = { open: 'open', progress: 'in progress', fixed: 'fixed' }

/** Both a toast (if the app is on screen) and a device notification (if allowed). */
function useAlert() {
  const toast = useToast()
  return (title: string, body: string, tag?: string) => {
    if (document.visibilityState === 'visible') toast(`${title}: ${body}`)
    notify(title, body, tag)
  }
}

/** Runs a callback at a given time while the app stays open. */
function useTimers(items: { key: string; at: number; fire: () => void }[]) {
  const done = useRef(new Set<string>())
  const sig = items.map(i => i.key + i.at).join('|')
  useEffect(() => {
    const now = Date.now()
    const timers = items
      .filter(i => i.at > now && i.at - now < 24 * 3600e3 && !done.current.has(i.key))
      .map(i => setTimeout(() => { done.current.add(i.key); i.fire() }, i.at - now))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
}

const at = (date: string, hm: string, minusMin = 0) => new Date(`${date}T${hm}:00`).getTime() - minusMin * 60000

/** Invisible: watches for things that concern the signed-in student and tells them. */
export function Notifier() {
  const { uid, profile } = useMe()
  const { ref } = useRef_()
  const alert = useAlert()
  const alertRef = useRef(alert)
  alertRef.current = alert

  // Wash finished.
  const washes = useLive<{ id: string; ends_at: string | null }>('my-washes',
    () => supabase.from('washers').select('id,ends_at').eq('user_id', uid) as never, ['washers'])
  // Events I'm going to, and my facility bookings (reminders before they start).
  const going = useLive<{ event: { id: string; title: string; event_date: string; starts: string; venue: string | null } | null }>('my-rsvps',
    () => supabase.from('event_rsvps').select('event:events!event_rsvps_event_id_fkey(id,title,event_date,starts,venue)').eq('user_id', uid) as never, ['event_rsvps'])
  const books = useLive<{ id: string; day: string; starts: string; facility: { name: string } | null }>('my-bookings',
    () => supabase.from('bookings').select('id,day,starts,facility:facilities!bookings_facility_id_fkey(name)').eq('user_id', uid).gte('day', today()) as never, ['bookings'])

  useTimers([
    ...washes.data.filter(w => w.ends_at).map(w => ({
      key: 'wash' + w.id, at: new Date(w.ends_at!).getTime(),
      fire: () => alertRef.current('Wash done', `Machine ${w.id} has finished. Collect your clothes so the next person can start.`, 'wash' + w.id),
    })),
    ...going.data.filter(g => g.event).map(g => ({
      key: 'ev' + g.event!.id, at: at(g.event!.event_date, g.event!.starts, 30),
      fire: () => alertRef.current('Starting in 30 min', `${g.event!.title}${g.event!.venue ? ' · ' + g.event!.venue : ''} at ${g.event!.starts}`, 'ev' + g.event!.id),
    })),
    ...books.data.map(b => ({
      key: 'bk' + b.id, at: at(b.day, b.starts, 15),
      fire: () => alertRef.current('Booking in 15 min', `${b.facility?.name || 'Your booking'} at ${b.starts}`, 'bk' + b.id),
    })),
    // Evening attendance reminder (time set in Profile).
    ...(reminderTime() ? [{
      key: 'att' + today(), at: at(today(), reminderTime()),
      fire: async () => {
        const d = today(), ys = profile.year + profile.section
        const classes = myClasses(ref, new Date(), profile.year, profile.section)
        if (!classes.length) return
        const { data } = await supabase.from('attendance').select('key').like('key', `${ys}|${d}|%`)
        const done = new Set(((data as { key: string }[]) || []).map(r => r.key))
        const left = classes.filter(c => !done.has(attKey(ys, d, c)))
        if (left.length) alertRef.current('Mark today’s attendance', `${left.length} of ${classes.length} classes aren’t marked: ${left.map(c => c.code).join(', ')}. One tap in Campus Hub.`, 'att')
      },
    }] : []),
  ])

  // Someone joins my ride; my complaint changes; a new notice is posted.
  const known = useRef(new Map<string, { status: string; response: string | null }>())
  useEffect(() => {
    supabase.from('complaints').select('id,status,response').eq('user_id', uid).then(({ data }) => {
      for (const c of (data as { id: string; status: string; response: string | null }[] | null) || []) known.current.set(c.id, c)
    })
    const ch = supabase.channel('notifier:' + uid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ride_members' }, async ({ new: m }) => {
        const row = m as { ride_id: string; user_id: string }
        if (row.user_id === uid) return
        const { data: ride } = await supabase.from('rides').select('dest,dest_text,ride_date,ride_time').eq('id', row.ride_id).eq('user_id', uid).maybeSingle()
        if (!ride) return
        const { data: who } = await supabase.from('profiles').select('name').eq('id', row.user_id).maybeSingle()
        const r = ride as { dest: string; dest_text: string | null; ride_date: string; ride_time: string }
        alertRef.current('Ride update', `${(who as { name: string } | null)?.name || 'Someone'} joined your ride to ${r.dest_text || r.dest} (${dayLabel(r.ride_date)} ${r.ride_time})`)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'complaints', filter: `user_id=eq.${uid}` }, ({ new: c }) => {
        const row = c as { id: string; title: string; status: string; response: string | null }
        const prev = known.current.get(row.id)
        known.current.set(row.id, row)
        if (!prev) return
        if (prev.status !== row.status) alertRef.current('Complaint update', `“${row.title}” is now ${STATUS[row.status] || row.status}.`)
        else if (row.response && prev.response !== row.response) alertRef.current('Council replied', `“${row.title}”: ${row.response}`)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'complaints', filter: `user_id=eq.${uid}` }, ({ new: c }) => {
        const row = c as { id: string; status: string; response: string | null }
        known.current.set(row.id, row)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notices' }, ({ new: n }) => {
        alertRef.current('New notice', (n as { title: string }).title, 'notice')
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [uid])

  return null
}
