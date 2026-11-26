import { useEffect } from 'react'
import { supabase } from './supabase'
import { useLive } from './useLive'
import type { Poll, Profile } from './types'
import { dayLabel, dstr, hhmm, local, saveLocal, sectionLabel } from './util'

export const isOpen = (p: { closes_at: string }) => new Date(p.closes_at).getTime() > Date.now()

export const whenLabel = (iso: string) => `${dayLabel(dstr(new Date(iso)))} ${hhmm(iso)}`

export const audience = (p: Pick<Poll, 'year' | 'section'>) =>
  !p.year ? 'Everyone' : p.section ? `Year ${p.year} · ${sectionLabel(p.section)}` : `Year ${p.year}`

export const canVote = (p: Pick<Poll, 'year' | 'section'>, me: Pick<Profile, 'year' | 'section'>) =>
  !p.year || (p.year === me.year && (!p.section || p.section === me.section))

/** Tells the tab badge to recount (after voting, closing or starting a poll on this device). */
export const pollsChanged = () => window.dispatchEvent(new Event('hub:polls'))

/** Open polls this student can vote in and hasn't yet (tab badge). */
export function useUnvotedPolls(uid: string, me: Pick<Profile, 'year' | 'section'>) {
  const polls = useLive<Pick<Poll, 'id' | 'closes_at' | 'year' | 'section'>>('poll-badge',
    () => supabase.from('polls').select('id,closes_at,year,section').gt('closes_at', new Date().toISOString()) as never, ['polls'])
  const votes = useLive<{ poll_id: string }>('poll-badge-votes',
    () => supabase.from('poll_votes').select('poll_id').eq('user_id', uid) as never, ['poll_votes'])
  const { reload: r1 } = polls, { reload: r2 } = votes
  useEffect(() => {
    const on = () => { r1(); r2() }
    window.addEventListener('hub:polls', on)
    return () => window.removeEventListener('hub:polls', on)
  }, [r1, r2])
  const voted = new Set(votes.data.map(v => v.poll_id))
  return polls.data.filter(p => isOpen(p) && canVote(p, me) && !voted.has(p.id)).length
}

/**
 * Election choices are never stored with the voter's name, so the app remembers
 * "you voted for X" only on this device.
 */
const BALLOTS = 'hub.ballots'
export const myBallot = (pollId: string) => local<Record<string, string>>(BALLOTS, {})[pollId] || ''
export function rememberBallot(pollId: string, label: string) {
  const all = local<Record<string, string>>(BALLOTS, {})
  all[pollId] = label
  saveLocal(BALLOTS, Object.fromEntries(Object.entries(all).slice(-50)))
}
