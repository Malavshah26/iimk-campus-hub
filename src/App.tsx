import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { AuthProvider, useAuth, useMe } from './lib/auth'
import { RefProvider, useRef_ } from './lib/ref'
import { configured, supabase } from './lib/supabase'
import { ToastProvider } from './lib/toast'
import { useLive, useTick } from './lib/useLive'
import type { Notice, Washer } from './lib/types'
import { DAYS, dstr, inFmt, isWeekend, local, mainDish, mins, nowMin, saveLocal } from './lib/util'
import { Login, NotConfigured } from './pages/Login'
import { ProfileForm } from './pages/Profile'
import { washerState } from './lib/washer'
import { myClasses, useCal, useCalAutoSync } from './lib/gcal'
import { sessionsOn, shareWindow, useSessions, useShareSessions } from './lib/sections'
import { DEFAULT_STOP, legsFrom, runsToday, showTime, stopsOf } from './lib/shuttle'
import { isLive, unseenCount, useNotices } from './lib/notices'
import { Badge, Loading } from './components/Bits'
import { Notifier } from './components/Notifier'
import { AttendanceNudge } from './components/AttendanceNudge'
import { BirthdayCard } from './components/Birthday'
import { useUnvotedPolls } from './lib/polls'
import { InstallBanner } from './components/Install'

// Each tab is downloaded only when first opened, so the app starts faster on slow campus Wi-Fi.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const page = <M extends Record<K, React.ComponentType<any>>, K extends keyof M & string>(load: () => Promise<M>, name: K) =>
  lazy(() => load().then(m => ({ default: m[name] })))
const Classes = page(() => import('./pages/Classes'), 'Classes')
const Carpool = page(() => import('./pages/Carpool'), 'Carpool')
const LostFound = page(() => import('./pages/LostFound'), 'LostFound')
const Market = page(() => import('./pages/Market'), 'Market')
const Laundry = page(() => import('./pages/Laundry'), 'Laundry')
const Bus = page(() => import('./pages/Info'), 'Bus')
const Autos = page(() => import('./pages/Info'), 'Autos')
const Mess = page(() => import('./pages/Info'), 'Mess')
const Contacts = page(() => import('./pages/Info'), 'Contacts')
const Admin = page(() => import('./pages/Admin'), 'Admin')
const Notices = page(() => import('./pages/Notices'), 'Notices')
const Events = page(() => import('./pages/Events'), 'Events')
const Complaints = page(() => import('./pages/Complaints'), 'Complaints')
const Book = page(() => import('./pages/Book'), 'Book')
const Polls = page(() => import('./pages/Polls'), 'Polls')
const Tour = page(() => import('./components/Tour'), 'Tour')
const Search = page(() => import('./components/Search'), 'Search')

// Main headers, each with its tabs. Each tab keeps its own #address, so old links and the home tiles still work.
const GROUPS = [
  { key: 'classes', label: 'Classes', tabs: [['classes', 'Classes']] },
  { key: 'updates', label: 'Updates', tabs: [['notices', 'Notices'], ['polls', 'Polls'], ['events', 'Events']] },
  { key: 'food', label: 'Mess & laundry', tabs: [['mess', 'Mess menu'], ['laundry', 'Laundry']] },
  { key: 'transport', label: 'Transport', tabs: [['bus', 'Shuttle'], ['autos', 'Autos & taxis'], ['rides', 'Carpool']] },
  { key: 'market', label: 'Market', tabs: [['market', 'Buy & sell'], ['lost', 'Lost & found']] },
  { key: 'campus', label: 'Campus', tabs: [['book', 'Book a room'], ['complaints', 'Complaints'], ['contacts', 'Contacts']] },
] as const
type Group = (typeof GROUPS)[number]
type Route = Group['tabs'][number][0] | 'profile' | 'admin'
const ROUTES = new Set<string>([...GROUPS.flatMap(g => g.tabs.map(t => t[0])), 'profile', 'admin'])
const groupOf = (r: string) => GROUPS.find(g => g.tabs.some(t => t[0] === r))
const tourKey = (uid: string) => 'hub.tour.' + uid

function useRoute(): Route {
  const get = () => {
    const h = window.location.hash.slice(1).split('/')[0]
    return (ROUTES.has(h) ? h : 'classes') as Route
  }
  const [r, setR] = useState<Route>(get)
  useEffect(() => {
    const on = () => {
      const next = get()
      setR(next)
      window.scrollTo({ top: 0 })
      // Remember the last tab in each header, so tapping the header goes back to it.
      const g = groupOf(next)
      if (g) saveLocal('hub.lastTab', { ...local<Record<string, string>>('hub.lastTab', {}), [g.key]: next })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return r
}

function NowBoard() {
  useTick()
  const { uid, profile } = useMe()
  const { ref } = useRef_()
  const washers = useLive<Washer>('now-washers', () => supabase.from('washers').select('id,status,ends_at,hostel') as never, ['washers'])
  const nm = nowMin()
  const cal = useCal()
  const classes = myClasses(ref, new Date(), profile.year, profile.section)
  // No calendar and no timetable for this section yet: point to calendar sync instead of "All done".
  const noSchedule = !cal && !ref.timetable.some(r => r.year === profile.year && r.section === profile.section) && !sessionsOn(profile.year, profile.section, dstr(new Date()))
  const c = classes.find(x => mins(x.ends) > nm)
  const busList = ref.bus.filter(b => b.day_type === (isWeekend() ? 'weekend' : 'weekday') && b.direction === 'out').map(b => b.time).sort()
  const bus = busList.find(t => mins(t) >= nm)
  const stops = stopsOf(ref.shuttle)
  const saved = local('hub.stop', DEFAULT_STOP)
  const stop = stops.includes(saved) ? saved : stops[0]
  const shuttle = stop ? legsFrom(ref.shuttle.filter(t => runsToday(t)), stop).find(l => mins(l.at) >= nm) : undefined
  const meal = ref.meals.find(m => nm >= mins(m.starts) && nm < mins(m.ends))
  const nextMeal = meal || ref.meals.find(m => mins(m.starts) > nm)
  const dish = nextMeal ? mainDish(ref.menu.find(r => r.day === DAYS[new Date().getDay()] && r.meal === nextMeal.meal)?.items || '') : ''
  const h = ref.hostels.find(x => x.code === profile.hostel)
  const byId = new Map(washers.data.map(w => [w.id, w]))
  const free = h ? Array.from({ length: h.machines }, (_, i) => `${h.code}-${i + 1}`).filter(id => washerState(byId.get(id)) === 'free').length : 0
  const tiles: [string, string, string, string][] = [
    noSchedule
      ? ['#classes', 'Classes', 'Sync calendar', 'tap to add your Google Calendar']
      : ['#classes', c && mins(c.starts) <= nm ? 'Class on now' : 'Next class', c ? (mins(c.starts) <= nm ? 'till ' + c.ends : c.starts) : 'All done', c ? [c.name, c.room?.replace(/^room\s+/i, '')].filter(Boolean).join(' · ') : 'no more classes today'],
    ref.shuttle.length
      ? ['#bus', 'Shuttle from ' + stop, shuttle ? showTime(shuttle.at) : 'No more', shuttle ? `in ${inFmt(mins(shuttle.at) - nm)} → ${shuttle.rest[0].stop}` : 'check tomorrow’s times']
      : ['#bus', 'Next bus to city', bus || 'No more', bus ? 'in ' + inFmt(mins(bus) - nm) : 'check tomorrow’s times'],
    ['#mess', meal ? meal.label + ' now' : nextMeal ? 'Next: ' + nextMeal.label : 'Mess', meal ? 'till ' + meal.ends : nextMeal ? nextMeal.starts : 'Closed', dish || ' '],
    ['#laundry', h ? `Washers, hostel ${h.code}` : 'Washers', h ? `${free} of ${h.machines}` : 'Set hostel', h ? 'free right now' : 'in your profile'],
  ]
  return <>
    <div className="now">{tiles.map(t => <a key={t[0]} className="tile" href={t[0]}><span>{t[1]}</span><b>{t[2]}</b><span>{t[3]}</span></a>)}</div>
    <BirthdayCard uid={uid} />
  </>
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

function MainNav({ route, badges }: { route: Route; badges: Partial<Record<Route, number>> }) {
  const cur = groupOf(route)
  const last = local<Record<string, string>>('hub.lastTab', {})
  const target = (g: Group) => {
    const l = last[g.key]
    return g.tabs.some(t => t[0] === l) ? l : g.tabs[0][0]
  }
  const sum = (g: Group) => g.tabs.reduce((n, t) => n + (badges[t[0]] || 0), 0)
  // On phones the header row scrolls sideways: keep the current header visible.
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const r = row.current, a = r?.querySelector<HTMLElement>('a.on')
    if (!r || !a) return
    const rb = r.getBoundingClientRect(), ab = a.getBoundingClientRect()
    if (ab.left < rb.left || ab.right > rb.right) r.scrollBy({ left: ab.left - rb.left - 16 })
  }, [cur?.key])
  return (
    <nav aria-label="Sections">
      <div className="wrap tabs" ref={row}>{GROUPS.map(g => <a key={g.key} href={'#' + target(g)} className={g === cur ? 'on' : ''} aria-current={g === cur ? 'true' : undefined}>
        {g.label}<Badge n={g === cur && g.tabs.length > 1 ? 0 : sum(g)} /></a>)}</div>
      {cur && cur.tabs.length > 1 && <div className="wrap subtabs" role="tablist" aria-label={cur.label}>
        {cur.tabs.map(([k, t]) => <a key={k} href={'#' + k} role="tab" aria-selected={route === k} className={route === k ? 'on' : ''}>{t}<Badge n={badges[k] || 0} /></a>)}
      </div>}
    </nav>
  )
}

function Shell() {
  const route = useRoute()
  const { uid, profile, isAdmin } = useMe()
  const { loading, error, ref } = useRef_()
  const notices = useNotices()
  useCalAutoSync()
  const cal = useCal()
  const [from, to] = shareWindow()
  useSessions([[profile.year, profile.section]], from, to)
  useShareSessions(cal, profile.year, profile.section)
  const unseen = route === 'notices' ? 0 : unseenCount(notices.data)
  const unvoted = useUnvotedPolls(uid, profile)
  // First-run intro; Profile -> "Show the intro again" brings it back.
  const [tour, setTour] = useState(() => !local(tourKey(uid), false))
  const [searching, setSearching] = useState(false)
  // "/" or Ctrl+K opens search (when not typing somewhere).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = /^(input|textarea|select)$/i.test((e.target as HTMLElement)?.tagName || '') || (e.target as HTMLElement)?.isContentEditable
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); setSearching(true) }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])
  useEffect(() => {
    const on = () => setTour(true)
    window.addEventListener('hub:tour', on)
    return () => window.removeEventListener('hub:tour', on)
  }, [])
  const endTour = () => { saveLocal(tourKey(uid), true); setTour(false) }
  // Once a day: note that this student opened the app (only totals ever reach admins).
  useEffect(() => {
    const k = 'hub.seen.' + uid, d = dstr(new Date())
    if (local(k, '') === d) return
    supabase.from('last_seen').upsert({ user_id: uid }).then(({ error }) => { if (!error) saveLocal(k, d) })
  }, [uid])
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
              <button className="hbtn" type="button" onClick={() => setSearching(true)} aria-label="Search" title="Search (/)">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <span className="hide-sm">Search</span></button>
              {isAdmin && <a className="hbtn" href="#admin">Admin</a>}
              <a className="hbtn" href="#profile">Profile</a>
            </div>
          </div>
          {!loading && <NowBoard />}
        </div>
      </header>
      <MainNav route={route} badges={{ notices: unseen, polls: unvoted }} />
      <main className="wrap">
        {!online && <div className="status show">You’re offline. Showing the timetable, menu and bus times saved on this device.</div>}
        {online && error && (haveData
          ? <div className="status show">Couldn’t refresh campus data, showing the copy saved on this device.</div>
          : <div className="status show">Couldn’t load campus data: {error}</div>)}
        <PinnedBanner notices={notices.data} route={route} />
        {route === 'classes' && !tour && <InstallBanner />}
        {!loading && <AttendanceNudge route={route} />}
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
          {route === 'autos' && <Autos />}
          {route === 'polls' && <Polls />}
          {route === 'mess' && <Mess />}
          {route === 'complaints' && <Complaints />}
          {route === 'contacts' && <Contacts />}
          {route === 'profile' && <ProfileForm />}
          {route === 'admin' && <Admin />}
        </Suspense>}
      </main>
      <Notifier />
      {tour && !loading && <Suspense fallback={null}><Tour onDone={endTour} /></Suspense>}
      {searching && <Suspense fallback={null}><Search onClose={() => setSearching(false)} /></Suspense>}
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
