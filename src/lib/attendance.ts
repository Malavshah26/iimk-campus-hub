import { useCallback, useEffect, useState } from 'react'
import type { ClassItem } from './ref'
import { supabase } from './supabase'
import { local, mins, saveLocal } from './util'

/** Attendance key: year+section | date | period (or start time for sessions outside periods). */
export const attKey = (ys: string, date: string, c: Pick<ClassItem, 'slot' | 'starts'>) => `${ys}|${date}|${c.slot || 't' + c.starts}`

/** Marks several classes at once. Returns an error message or null. */
export async function markMany(uid: string, items: { key: string; code: string }[], status: 'y' | 'n'): Promise<string | null> {
  if (!items.length) return null
  const now = new Date().toISOString()
  // A key sent twice in one upsert fails the whole request, so send each key once.
  const once = [...new Map(items.map(i => [i.key, i])).values()]
  const { error } = await supabase.from('attendance').upsert(once.map(i => ({ user_id: uid, key: i.key, course_code: i.code, status, updated_at: now })))
  return error ? error.message : null
}

/** This student's marks for one day (key -> 'y' | 'n'). */
export function useDayMarks(ys: string, date: string) {
  const [marks, setMarks] = useState<Record<string, 'y' | 'n'> | null>(null)
  const reload = useCallback(async () => {
    const { data, error } = await supabase.from('attendance').select('key,status').like('key', `${ys}|${date}|%`)
    if (!error) setMarks(Object.fromEntries(((data as { key: string; status: 'y' | 'n' }[]) || []).map(r => [r.key, r.status])))
  }, [ys, date])
  useEffect(() => { reload() }, [reload])
  return { marks, reload, setMarks }
}

/** Classes that have started (so can be marked) and aren't marked yet. */
export const unmarked = (classes: ClassItem[], ys: string, date: string, marks: Record<string, unknown>, nowMin: number, isToday: boolean) =>
  classes.filter(c => (!isToday || mins(c.starts) <= nowMin) && !marks[attKey(ys, date, c)])

/** Evening reminder time ('HH:MM') or '' when turned off. */
export const reminderTime = () => local<string>('hub.attRemind', '21:00')
export const setReminderTime = (t: string) => saveLocal('hub.attRemind', t)
