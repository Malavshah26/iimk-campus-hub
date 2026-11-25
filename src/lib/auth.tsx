import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, configured } from './supabase'
import type { Profile } from './types'

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
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from('profiles').select('id,name,phone,year,section,hostel').eq('id', uid).maybeSingle(),
      supabase.from('admins').select('user_id').eq('user_id', uid).maybeSingle(),
    ])
    setProfile((p as Profile) || null)
    setIsAdmin(!!a)
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
      load(s)
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
