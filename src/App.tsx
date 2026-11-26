import { lazy, Suspense, useEffect, useState } from 'react'
import { AuthProvider, useAuth, useMe } from './lib/auth'
import { RefProvider, useRef_ } from './lib/ref'
import { configured, supabase } from './lib/supabase'
import { ToastProvider } from './lib/toast'
import { useLive, useTick } from './lib/useLive'
import type { Notice, Washer } from './lib/types'
import { DAYS, inFmt, isWeekend, local, mins, nowMin, saveLocal } from './lib/util'
import { Login, NotConfigured } from './pages/Login'
import { ProfileForm } from './pages/Profile'
import { washerState } from './lib/washer'
import { myClasses, useCal, useCalAutoSync } from './lib/gcal'
import { DEFAULT_STOP, legsFrom, runsToday, showTime, stopsOf } from './lib/shuttle'
import { isLive, unseenCount, useNotices } from './lib/notices'
import { Badge, Loading } from './components/Bits'
import { Notifier } from './components/Notifier'

// Each tab is downloaded only when first opened, so the app starts faster on slow campus Wi-Fi.
const page = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) =>
  lazy(() => load().then(m => ({ default: m[name] })))
const Classes = page(() => import('./pages/Classes'), 'Classes')
const Carpool = page(() => import('./pages/Carpool'), 'Carpool')
const LostFound = page(() => import('./pages/LostFound'), 'LostFound')
const Market = page(() => import('./pages/Market'), 'Market')
const Laundry = page(() => import('./pages/Laundry'), 'Laundry')
const Bus = page(() => import('./pages/Info'), 'Bus')
const Mess = page(() => import('./pages/Info'), 'Mess')
const Contacts = page(() => import('./pages/Info'), 'Contacts')
const Admin = page(() => import('./pages/Admin'), 'Admin')
const Notices = page(() => import('./pages/Notices'), 'Notices')
const Events = page(() => import('./pages/Events'), 'Events')
const Complaints = page(() => import('./pages/Complaints'), 'Complaints')
const Book = page(() => import('./pages/Book'), 'Book')

const TABS = [
  ['classes', 'Classes'], ['notices', 'Notices'], ['events', 'Events'], ['mess', 'Mess menu'], ['bus', 'Bus'],
  ['laundry', 'Laundry'], ['rides', 'Carpool'], ['book', 'Book a room'], ['lost', 'Lost & found'],
  ['market', 'Buy & sell'], ['complaints', 'Complaints'], ['contacts', 'Contacts'],
] as const
type Route = (typeof TABS)[number][0] | 'profile' | 'admin'
const ROUTES = new Set<string>([...TABS.map(t => t[0]), 'profile', 'admin'])

function useRoute(): Route {
  const get = () => {
    const h = window.location.hash.slice(1)
    return (ROUTES.has(h) ? h : 'classes') as Route
  }
  const [r, setR] = useState<Route>(get)
  useEffect(() => {
    const on = () => { setR(get()); window.scrollTo({ top: 0 }) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}

function NowBoard() {
  useTick()
  const { profile } = useMe()
  const { ref } = useRef_()
  const washers = useLive<Washer>('now-washers', () => supabase.from('washers').select('id,status,ends_at,hostel') as never, ['washers'])
  const nm = nowMin()
  const cal = useCal()
  const classes = myClasses(ref, new Date(), profile.year, profile.section)
  // No calendar and no timetable for this section yet: point to calendar sync instead of "All done".
  const noSchedule = !cal && !ref.timetable.some(r => r.year === profile.year && r.section === profile.section)
  const c = classes.find(x => mins(x.ends) > nm)
  const busList = ref.bus.filter(b => b.day_type === (isWeekend() ? 'weekend' : 'weekday') && b.direction === 'out').map(b => b.time).sort()
  const bus = busList.find(t => mins(t) >= nm)
  const stops = stopsOf(ref.shuttle)
  const saved = local('hub.stop', DEFAULT_STOP)
  const stop = stops.includes(saved) ? saved : stops[0]
  const shuttle = stop ? legsFrom(ref.shuttle.filter(t => runsToday(t)), stop).find(l => mins(l.at) >= nm) : undefined
  const meal = ref.meals.find(m => nm >= mins(m.starts) && nm < mins(m.ends))
  const nextMeal = meal || ref.meals.find(m => mins(m.starts) > nm)
  const dish = nextMeal ? (ref.menu.find(r => r.day === DAYS[new Date().getDay()] && r.meal === nextMeal.meal)?.items || '').split(',')[0] : ''
  const h = ref.hostels.find(x => x.code === profile.hostel)
  const byId = new Map(washers.data.map(w => [w.id, w]))
  const free = h ? Array.from({ length: h.machines }, (_, i) => `${h.code}-${i + 1}`).filter(id => washerState(byId.get(id)) === 'free').length : 0
  const tiles: [string, string, string, string][] = [
    noSchedule
      ? ['#classes', 'Classes', 'Sync calendar', 'tap to add your Google Calendar']
      : ['#classes', c && mins(c.starts) <= nm ? 'Class on now' : 'Next class', c ? (mins(c.starts) <= nm ? 'till ' + c.ends : c.starts) : 'All done', c ? c.name : 'no more classes today'],
    ref.shuttle.length
      ? ['#bus', 'Shuttle from ' + stop, shuttle ? showTime(shuttle.at) : 'No more', shuttle ? `in ${inFmt(mins(shuttle.at) - nm)} → ${shuttle.rest[0].stop}` : 'check tomorrow’s times']
      : ['#bus', 'Next bus to city', bus || 'No more', bus ? 'in ' + inFmt(mins(bus) - nm) : 'check tomorrow’s times'],
    ['#mess', meal ? meal.label + ' now' : nextMeal ? 'Next: ' + nextMeal.label : 'Mess', meal ? 'till ' + meal.ends : nextMeal ? nextMeal.starts : 'Closed', dish || ' '],
    ['#laundry', h ? `Washers, hostel ${h.code}` : 'Washers', h ? `${free} of ${h.machines}` : 'Set hostel', h ? 'free right now' : 'in your profile'],
  ]
  return <div className="now">{tiles.map(t => <a key={t[0]} className="tile" href={t[0]}><span>{t[1]}</span><b>{t[2]}</b><span>{t[3]}</span></a>)}</div>
}

/** The newest pinned notice, until the student closes it. */
function PinnedBanner({ notices, route }: { notices: Notice[]; route: Route }) {
  const [closed, setClosed] = useState(() => local<string[]>('hub.closedNotices', []))
  const n = notices.find(x => x.pinned && isLive(x) && !closed.includes(x.id))
  if (!n || route === 'notices') return null
  const close = () => { const next = [...closed, n.id].slice(-30); setClosed(next); saveLocal('hub.closedNotices', next) }
  return (
    <div className="banner" role="status">
      <a href="#notices"><b>{n.title}</b>{n.body ? <span> · {n.body.slice(0, 120)}{n.body.length > 120 ? '…' : ''}</span> : null}</a>
      <button type="button" aria-label="Close this notice" onClick={close}>×</button>
    </div>
  )
}

function Shell() {
  const route = useRoute()
  const { profile, isAdmin } = useMe()
  const { loading, error, ref } = useRef_()
  const notices = useNotices()
  useCalAutoSync()
  const unseen = route === 'notices' ? 0 : unseenCount(notices.data)
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  const haveData = ref.slots.length > 0 || ref.timetable.length > 0
  return (
    <>
      <header>
        <div className="wrap">
          <div className="top">
            <div><h1>IIMK Campus Hub</h1><p>Hi {profile.name.split(' ')[0]} · {profile.year === '1' ? 'Year 1' : 'Year 2'} · {profile.section.length > 1 ? profile.section : 'Section ' + profile.section}</p></div>
            <div className="acts" style={{ margin: 0 }}>
              {isAdmin && <a className="hbtn" href="#admin">Admin</a>}
              <a className="hbtn" href="#profile">Profile</a>
            </div>
          </div>
          {!loading && <NowBoard />}
        </div>
      </header>
      <nav><div className="wrap tabs">{TABS.map(([k, t]) => <a key={k} href={'#' + k} className={route === k ? 'on' : ''} aria-current={route === k ? 'page' : undefined}>{t}{k === 'notices' && <Badge n={unseen} />}</a>)}</div></nav>
      <main className="wrap">
        {!online && <div className="status show">You’re offline. Showing the timetable, menu and bus times saved on this device.</div>}
        {online && error && (haveData
          ? <div className="status show">Couldn’t refresh campus data, showing the copy saved on this device.</div>
          : <div className="status show">Couldn’t load campus data: {error}</div>)}
        <PinnedBanner notices={notices.data} route={route} />
        {loading ? <Loading /> : <Suspense fallback={<Loading />}>
          {route === 'classes' && <Classes />}
          {route === 'notices' && <Notices />}
          {route === 'events' && <Events />}
          {route === 'rides' && <Carpool />}
          {route === 'book' && <Book />}
          {route === 'lost' && <LostFound />}
          {route === 'market' && <Market />}
          {route === 'laundry' && <Laundry />}
          {route === 'bus' && <Bus />}
          {route === 'mess' && <Mess />}
          {route === 'complaints' && <Complaints />}
          {route === 'contacts' && <Contacts />}
          {route === 'profile' && <ProfileForm />}
          {route === 'admin' && <Admin />}
        </Suspense>}
      </main>
      <Notifier />
    </>
  )
}

function Gate() {
  const { ready, session, profile } = useAuth()
  if (!configured) return <NotConfigured />
  if (!ready) return <div className="auth"><div className="empty">Loading…</div></div>
  if (!session) return <Login />
  return <RefProvider>{profile ? <Shell /> : <ProfileForm first />}</RefProvider>
}

export default function App() {
  return <ToastProvider><AuthProvider><Gate /></AuthProvider></ToastProvider>
}
