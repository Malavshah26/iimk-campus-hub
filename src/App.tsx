import { useEffect, useState } from 'react'
import { AuthProvider, useAuth, useMe } from './lib/auth'
import { classesFor, RefProvider, useRef_ } from './lib/ref'
import { configured, supabase } from './lib/supabase'
import { ToastProvider } from './lib/toast'
import { useLive, useTick } from './lib/useLive'
import type { Washer } from './lib/types'
import { DAYS, inFmt, isWeekend, mins, nowMin } from './lib/util'
import { Login, NotConfigured } from './pages/Login'
import { ProfileForm } from './pages/Profile'
import { Classes } from './pages/Classes'
import { Carpool } from './pages/Carpool'
import { LostFound } from './pages/LostFound'
import { Market } from './pages/Market'
import { Laundry, washerState } from './pages/Laundry'
import { Bus, Contacts, Mess } from './pages/Info'
import { Admin } from './pages/Admin'

const TABS = [
  ['classes', 'Classes'], ['rides', 'Carpool'], ['lost', 'Lost & found'], ['market', 'Buy & sell'],
  ['laundry', 'Laundry'], ['bus', 'Bus'], ['mess', 'Mess menu'], ['contacts', 'Contacts'],
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
  const classes = classesFor(ref, new Date(), profile.year, profile.section)
  const c = classes.find(x => mins(x.ends) > nm)
  const busList = ref.bus.filter(b => b.day_type === (isWeekend() ? 'weekend' : 'weekday') && b.direction === 'out').map(b => b.time).sort()
  const bus = busList.find(t => mins(t) >= nm)
  const meal = ref.meals.find(m => nm >= mins(m.starts) && nm < mins(m.ends))
  const nextMeal = meal || ref.meals.find(m => mins(m.starts) > nm)
  const dish = nextMeal ? (ref.menu.find(r => r.day === DAYS[new Date().getDay()] && r.meal === nextMeal.meal)?.items || '').split(',')[0] : ''
  const h = ref.hostels.find(x => x.code === profile.hostel)
  const byId = new Map(washers.data.map(w => [w.id, w]))
  const free = h ? Array.from({ length: h.machines }, (_, i) => `${h.code}-${i + 1}`).filter(id => washerState(byId.get(id)) === 'free').length : 0
  const tiles: [string, string, string, string][] = [
    ['#classes', c && mins(c.starts) <= nm ? 'Class on now' : 'Next class', c ? (mins(c.starts) <= nm ? 'till ' + c.ends : c.starts) : 'All done', c ? c.name : 'no more classes today'],
    ['#bus', 'Next bus to city', bus || 'No more', bus ? 'in ' + inFmt(mins(bus) - nm) : 'check tomorrow’s times'],
    ['#mess', meal ? meal.label + ' now' : nextMeal ? 'Next: ' + nextMeal.label : 'Mess', meal ? 'till ' + meal.ends : nextMeal ? nextMeal.starts : 'Closed', dish || ' '],
    ['#laundry', h ? `Washers, hostel ${h.code}` : 'Washers', h ? `${free} of ${h.machines}` : 'Set hostel', h ? 'free right now' : 'in your profile'],
  ]
  return <div className="now">{tiles.map(t => <a key={t[0]} className="tile" href={t[0]}><span>{t[1]}</span><b>{t[2]}</b><span>{t[3]}</span></a>)}</div>
}

function Shell() {
  const route = useRoute()
  const { profile, isAdmin } = useMe()
  const { loading, error } = useRef_()
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
      <nav><div className="wrap tabs">{TABS.map(([k, t]) => <a key={k} href={'#' + k} className={route === k ? 'on' : ''}>{t}</a>)}</div></nav>
      <main className="wrap">
        {error && <div className="status show">Couldn’t load campus data: {error}</div>}
        {loading ? <div className="empty">Loading…</div> : <>
          {route === 'classes' && <Classes />}
          {route === 'rides' && <Carpool />}
          {route === 'lost' && <LostFound />}
          {route === 'market' && <Market />}
          {route === 'laundry' && <Laundry />}
          {route === 'bus' && <Bus />}
          {route === 'mess' && <Mess />}
          {route === 'contacts' && <Contacts />}
          {route === 'profile' && <ProfileForm />}
          {route === 'admin' && <Admin />}
        </>}
      </main>
      <footer className="wrap foot">Run by the IIMK Students’ Council. Sample data is marked; report problems to the council.</footer>
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
