export type Year = '1' | '2'

export interface Profile {
  id: string
  name: string
  phone: string | null
  year: Year
  section: string
  hostel: string | null
}

export interface Person {
  name: string
  phone?: string | null
}

export interface Ride {
  id: string
  user_id: string
  dest: string
  dest_text: string | null
  ride_date: string
  ride_time: string
  seats: number
  note: string | null
  created_at: string
  poster: Person | null
  ride_members: { user_id: string; member: { name: string } | null }[]
}

export interface LostItem {
  id: string
  user_id: string
  kind: 'lost' | 'found'
  item: string
  place: string | null
  item_date: string
  description: string | null
  photo_path: string | null
  status: 'open' | 'done'
  created_at: string
  poster: Person | null
}

export type ListingKind = 'sell' | 'rent' | 'want'
export interface Listing {
  id: string
  user_id: string
  kind: ListingKind
  title: string
  price: number
  unit: 'day' | 'week' | 'month' | 'term' | null
  category: string
  condition: string | null
  hostel: string | null
  description: string | null
  photo_path: string | null
  status: 'open' | 'done'
  created_at: string
  poster: Person | null
}

export interface Washer {
  id: string
  hostel: string
  status: 'ok' | 'broken'
  started_at: string | null
  ends_at: string | null
  user_id: string | null
  updated_at: string
  user: { name: string } | null
}

export interface QueueRow {
  washer_id: string
  user_id: string
  created_at: string
  user: { name: string } | null
}

export interface Section { code: string; label: string; sort: number }
export interface Hostel { code: string; machines: number; sort: number }
export interface Slot { slot: number; starts: string; ends: string }
export interface TTRow {
  id: number
  year: Year
  section: string
  weekday: number
  slot: number
  course_code: string
  course_name: string
  room: string | null
}
export interface BusTime { id: number; day_type: 'weekday' | 'weekend'; direction: 'out' | 'in'; time: string; note: string | null }
export interface MealTime { meal: 'b' | 'l' | 's' | 'd'; label: string; starts: string; ends: string; sort: number }
export interface MenuRow { day: string; meal: string; items: string }
export interface Contact { id: number; grp: string; name: string; number: string; note: string | null; emergency: boolean; sort: number }
export interface AttendanceRow { key: string; course_code: string; status: 'y' | 'n' }
