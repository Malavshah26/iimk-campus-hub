import { supabase } from './supabase'
import type { Notice } from './types'
import { useLive } from './useLive'
import { local, saveLocal, today } from './util'

const SEEN = 'hub.noticesSeen'

export function useNotices() {
  return useLive<Notice>('notices', () => supabase.from('notices').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100) as never, ['notices'])
}

export const isLive = (n: Notice) => !n.expires_on || n.expires_on >= today()

/** Notices posted since the student last opened the Notices tab. */
export function unseenCount(list: Notice[]): number {
  const seen = local<string>(SEEN, '')
  return list.filter(n => isLive(n) && n.created_at > seen).length
}
export const markSeen = (list: Notice[]) => { if (list[0]) saveLocal(SEEN, list.reduce((m, n) => (n.created_at > m ? n.created_at : m), '')) }

