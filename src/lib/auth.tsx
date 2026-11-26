import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, configured } from './supabase'
import type { Profile } from './types'
import { local, saveLocal } from './util'

const meKey = (uid: string) => 'hub.me.' + uid

/** Removes everything this app cached on the device (used on sign-out). */
export function clearLocalCache() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('hub.me.') || k === 'hub.ref') localStorage.removeItem(k)
  } catch { /* storage unavailable */ }
}

interface AuthState {
  session: Session | null
  profile: Profile | null
  isAdmin: boolean
  ready: boolean
  reloadProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [ready, setReady] = useState(!configured)

  const load = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null)
      setIsAdmin(false)
      setReady(true)
      return
    }
    const uid = s.user.id
    // Show the app straight away from the last known profile, then refresh it.
    const cached = local<{ profile: Profile | null; isAdmin: boolean } | null>(meKey(uid), null)
    if (cached?.profile) {
      setProfile(cached.profile)
      setIsAdmin(cached.isAdmin)
      setReady(true)
    }
    const [{ data: p, error: pe }, { data: a }] = await Promise.all([
      supabase.from('profiles').select('id,name,phone,year,section,hostel').eq('id', uid).maybeSingle(),
      supabase.from('admins').select('user_id').eq('user_id', uid).maybeSingle(),
    ])
    if (pe && cached?.profile) return // offline: keep the cached profile
    setProfile((p as Profile) || null)
    setIsAdmin(!!a)
    if (p) saveLocal(meKey(uid), { profile: p, isAdmin: !!a })
    setReady(true)
  }, [])

  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      load(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      // Supabase can deadlock if its own methods run inside this callback, so defer.
      setTimeout(() => load(s), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  const value: AuthState = {
    session,
    profile,
    isAdmin,
    ready,
    reloadProfile: () => load(session),
    signOut: async () => {
      clearLocalCache()
      await supabase.auth.signOut()
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}

/** Signed-in user with a completed profile (only used inside the main app). */
export function useMe() {
  const { session, profile, isAdmin } = useAuth()
  return { uid: session!.user.id, email: session!.user.email || '', profile: profile!, isAdmin }
}
