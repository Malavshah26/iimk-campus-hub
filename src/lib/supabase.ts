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
