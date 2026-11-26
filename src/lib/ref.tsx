import { createContext, useCallback, useContext, useEffect, useRef as useRef_ts, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { local, saveLocal } from './util'
import type { BusTime, Contact, Hostel, MealTime, MenuRow, Section, Slot, TTRow } from './types'

export interface RefData {
  sections: Section[]
  hostels: Hostel[]
  slots: Slot[]
  timetable: TTRow[]
  bus: BusTime[]
  meals: MealTime[]
  menu: MenuRow[]
  contacts: Contact[]
}

const empty: RefData = { sections: [], hostels: [], slots: [], timetable: [], bus: [], meals: [], menu: [], contacts: [] }
const Ctx = createContext<{ ref: RefData; loading: boolean; error: string | null; reload: () => Promise<void> } | null>(null)

const CACHE = 'hub.ref'
const STALE_MS = 10 * 60 * 1000

/**
 * Loads the council-maintained reference tables. The last copy is kept on the device, so the
 * app opens instantly (and works offline); a fresh copy is fetched in the background, and again
 * when the app comes back to the foreground after 10 minutes.
 */
export function RefProvider({ children }: { children: ReactNode }) {
  const [cached] = useState(() => local<{ at: number; ref: RefData } | null>(CACHE, null))
  const [ref, setRef] = useState<RefData>(cached?.ref || empty)
  const [loading, setLoading] = useState(!cached)
  const [error, setError] = useState<string | null>(null)
  const lastLoad = useRef_ts(cached?.at || 0)

  const reload = useCallback(async () => {
    const q = await Promise.all([
      supabase.from('sections').select('*').order('sort'),
      supabase.from('hostels').select('*').order('sort'),
      supabase.from('class_slots').select('*').order('slot'),
      supabase.from('timetable').select('*').limit(5000),
      supabase.from('bus_times').select('*').order('time'),
      supabase.from('meal_times').select('*').order('sort'),
      supabase.from('mess_menu').select('*'),
      supabase.from('contacts').select('*').order('sort'),
    ])
    const err = q.find(r => r.error)?.error
    setLoading(false)
    if (err) {
      // Keep showing the saved copy if there is one.
      setError(err.message)
      return
    }
    setError(null)
    const next: RefData = {
      sections: (q[0].data as Section[]) || [],
      hostels: (q[1].data as Hostel[]) || [],
      slots: (q[2].data as Slot[]) || [],
      timetable: (q[3].data as TTRow[]) || [],
      bus: (q[4].data as BusTime[]) || [],
      meals: (q[5].data as MealTime[]) || [],
      menu: (q[6].data as MenuRow[]) || [],
      contacts: (q[7].data as Contact[]) || [],
    }
    setRef(next)
    lastLoad.current = Date.now()
    saveLocal(CACHE, { at: lastLoad.current, ref: next })
  }, [lastLoad])

  useEffect(() => {
    reload()
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > STALE_MS) reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', reload)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', reload)
    }
  }, [reload, lastLoad])
  return <Ctx.Provider value={{ ref, loading, error, reload }}>{children}</Ctx.Provider>
}

export function useRef_() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useRef_ outside RefProvider')
  return v
}

export interface ClassItem { slot: number; starts: string; ends: string; code: string; name: string; room: string | null }

/** Classes for one year+section on a given date, in slot order. */
export function classesFor(ref: RefData, date: Date, year: string, section: string): ClassItem[] {
  const wd = date.getDay()
  if (wd === 0) return []
  const slots = new Map(ref.slots.map(s => [s.slot, s]))
  return ref.timetable
    .filter(r => r.year === year && r.section === section && r.weekday === wd)
    .map(r => {
      const s = slots.get(r.slot)
      return { slot: r.slot, starts: s?.starts || '', ends: s?.ends || '', code: r.course_code, name: r.course_name, room: r.room }
    })
    .filter(c => c.starts)
    .sort((a, b) => a.slot - b.slot)
}
