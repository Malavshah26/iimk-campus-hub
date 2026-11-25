import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
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

/** Loads the council-maintained reference tables once (they change rarely). */
export function RefProvider({ children }: { children: ReactNode }) {
  const [ref, setRef] = useState<RefData>(empty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    if (err) setError(err.message)
    else setError(null)
    setRef({
      sections: (q[0].data as Section[]) || [],
      hostels: (q[1].data as Hostel[]) || [],
      slots: (q[2].data as Slot[]) || [],
      timetable: (q[3].data as TTRow[]) || [],
      bus: (q[4].data as BusTime[]) || [],
      meals: (q[5].data as MealTime[]) || [],
      menu: (q[6].data as MenuRow[]) || [],
      contacts: (q[7].data as Contact[]) || [],
    })
    setLoading(false)
  }, [])

  useEffect(() => { reload() }, [reload])
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
