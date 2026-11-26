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

export interface Notice {
  id: string
  title: string
  body: string | null
  link: string | null
  pinned: boolean
  expires_on: string | null
  created_at: string
}

export interface CampusEvent {
  id: string
  user_id: string
  title: string
  organiser: string | null
  venue: string | null
  event_date: string
  starts: string
  ends: string
  description: string | null
  link: string | null
  created_at: string
  poster: Person | null
  event_rsvps: { user_id: string }[]
}

export type ComplaintStatus = 'open' | 'progress' | 'fixed'
export interface Complaint {
  id: string
  user_id: string
  category: string
  hostel: string | null
  title: string
  details: string | null
  photo_path: string | null
  status: ComplaintStatus
  response: string | null
  created_at: string
  updated_at: string
  poster: Person | null
  complaint_votes: { user_id: string }[]
}

export interface Facility {
  id: number
  name: string
  kind: string
  location: string | null
  opens: string
  closes: string
  max_minutes: number
  active: boolean
  sort: number
}

export interface Booking {
  id: string
  facility_id: number
  user_id: string
  day: string
  starts: string
  ends: string
  purpose: string | null
  who: { name: string; phone: string | null } | null
}

export interface MealSummary { day: string; meal: string; up: number; down: number; comments: string[] | null }
