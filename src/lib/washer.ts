import type { Washer } from './types'

export function washerState(w: Pick<Washer, 'status' | 'ends_at'> | undefined, now = Date.now()): 'free' | 'busy' | 'broken' {
  if (w?.status === 'broken') return 'broken'
  return w?.ends_at && new Date(w.ends_at).getTime() > now ? 'busy' : 'free'
}
