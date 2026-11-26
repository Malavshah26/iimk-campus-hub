import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configured = Boolean(url && key)

export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export const ALLOWED_DOMAIN = (import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN || 'iimk.ac.in').toLowerCase()
export const GOOGLE_LOGIN = import.meta.env.VITE_ENABLE_GOOGLE_LOGIN === 'true'

/** Mirrors public.is_campus_user(): name@domain or name@sub.domain */
export function isAllowedEmail(email: string): boolean {
  const e = email.trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at < 1) return false
  const host = e.slice(at + 1)
  return host === ALLOWED_DOMAIN || host.endsWith('.' + ALLOWED_DOMAIN)
}

/** Turns raw database / network errors into something a student can act on. */
export function explain(msg: string | null | undefined): string {
  const m = String(msg || '')
  if (/does not exist|schema cache|Could not find the (table|function)/i.test(m))
    return 'This part needs the latest database update. A council admin should run supabase/migrations/0002_campus_life.sql in the Supabase SQL Editor (see docs/SETUP.md).'
  if (/JWT expired|invalid JWT|refresh token/i.test(m)) return 'Your sign-in has expired. Reload the page, or sign out and in again.'
  if (/Failed to fetch|NetworkError|Load failed|network request failed/i.test(m)) return 'No connection right now. Check your Wi-Fi or data and try again.'
  if (/row-level security|permission denied/i.test(m)) return 'You don’t have permission to do that.'
  return m
}
