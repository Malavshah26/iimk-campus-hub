import { useCallback, useEffect, useState } from 'react'
import { useMe } from '../lib/auth'
import { explain, supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import type { MealSummary } from '../lib/types'
import { today } from '../lib/util'

type Mine = { meal: string; vote: 1 | -1; comment: string | null }

/** Today's ratings: totals for everyone, plus this student's own votes. */
export function useMealFeedback() {
  const [sum, setSum] = useState<MealSummary[]>([])
  const [mine, setMine] = useState<Mine[]>([])
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    const d = today()
    const [s, m] = await Promise.all([
      supabase.rpc('meal_summary', { p_from: d, p_to: d }),
      supabase.from('meal_ratings').select('meal,vote,comment').eq('day', d),
    ])
    setError(s.error?.message || m.error?.message || null)
    setSum((s.data as MealSummary[] | null) || [])
    setMine((m.data as Mine[] | null) || [])
  }, [])
  useEffect(() => { reload() }, [reload])
  return { sum, mine, error, reload }
}

export function MealVote({ meal, fb }: { meal: string; fb: ReturnType<typeof useMealFeedback> }) {
  const { uid } = useMe()
  const toast = useToast()
  const s = fb.sum.find(x => x.meal === meal)
  const my = fb.mine.find(x => x.meal === meal)
  const [comment, setComment] = useState(my?.comment || '')
  const [open, setOpen] = useState(false)
  useEffect(() => setComment(my?.comment || ''), [my?.comment])
  if (fb.error) return null // feature not set up yet (database update 0002)

  const vote = async (v: 1 | -1) => {
    const { error } = my?.vote === v
      ? await supabase.from('meal_ratings').delete().match({ user_id: uid, day: today(), meal })
      : await supabase.from('meal_ratings').upsert({ user_id: uid, day: today(), meal, vote: v, comment: my?.comment ?? null })
    if (error) return toast(explain(error.message))
    if (my?.vote !== v && v === -1) setOpen(true)
    fb.reload()
  }
  const save = async () => {
    const { error } = await supabase.from('meal_ratings').update({ comment: comment.trim().slice(0, 200) || null }).match({ user_id: uid, day: today(), meal })
    if (error) return toast(explain(error.message))
    toast('Thanks. The mess committee will see it.')
    setOpen(false)
    fb.reload()
  }

  const total = (s?.up || 0) + (s?.down || 0)
  return (
    <div className="mvote">
      <span className="meta" style={{ margin: 0 }}>How was it?</span>
      <button type="button" className={'chip' + (my?.vote === 1 ? ' on' : '')} aria-pressed={my?.vote === 1} onClick={() => vote(1)}>👍 {s?.up || 0}</button>
      <button type="button" className={'chip' + (my?.vote === -1 ? ' on bad' : '')} aria-pressed={my?.vote === -1} onClick={() => vote(-1)}>👎 {s?.down || 0}</button>
      {total >= 5 && <span className="meta" style={{ margin: 0 }}>{Math.round(((s?.up || 0) * 100) / total)}% liked it</span>}
      {my && !open && <button type="button" className="linkbtn" onClick={() => setOpen(true)}>{my.comment ? 'Edit comment' : 'Add a comment'}</button>}
      {my && open && <div className="mcomment">
        <input aria-label="Comment for the mess committee" maxLength={200} value={comment} onChange={e => setComment(e.target.value)} placeholder="What was off? Only the council sees this." />
        <button type="button" className="btn" onClick={save}>Send</button>
      </div>}
    </div>
  )
}
