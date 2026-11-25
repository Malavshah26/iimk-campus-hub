import { useState } from 'react'
import { useMe } from '../lib/auth'
import { useRef_ } from '../lib/ref'
import { supabase } from '../lib/supabase'
import { useToast } from '../lib/toast'
import { useLive, useTick } from '../lib/useLive'
import type { QueueRow, Washer } from '../lib/types'
import { hhmm, local, saveLocal } from '../lib/util'
import { Chips, ErrorNote } from '../components/Bits'

export function washerState(w: Washer | undefined, now = Date.now()): 'free' | 'busy' | 'broken' {
  if (w?.status === 'broken') return 'broken'
  return w?.ends_at && new Date(w.ends_at).getTime() > now ? 'busy' : 'free'
}

function Drum({ frac, color }: { frac: number; color: string }) {
  const R = 22, C = 2 * Math.PI * R
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">
      <rect x="1" y="1" width="54" height="54" rx="12" fill="var(--soft)" stroke="var(--line)" />
      <circle cx="28" cy="30" r={R} fill="none" stroke="var(--line)" strokeWidth="5" />
      <circle className="ring" cx="28" cy="30" r={R} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={C.toFixed(1)} strokeDashoffset={(C * (1 - frac)).toFixed(1)} transform="rotate(-90 28 30)" />
      <circle cx="28" cy="30" r="12" fill="var(--bg)" stroke="var(--line)" />
      <circle cx="12" cy="9" r="2" fill={color} />
    </svg>
  )
}

export function Laundry() {
  useTick(20000)
  const { uid, profile } = useMe()
  const { ref } = useRef_()
  const toast = useToast()
  const [hostel, setHostel] = useState(() => local('hub.hostel', profile.hostel || ref.hostels[0]?.code || 'A'))
  const [cycle, setCycle] = useState(() => local('hub.cycle', 45))
  const washers = useLive<Washer>('washers', () => supabase.from('washers').select('*, user:profiles!washers_user_id_fkey(name)') as never, ['washers'])
  const queue = useLive<QueueRow>('queue', () => supabase.from('washer_queue').select('*, user:profiles!washer_queue_user_id_fkey(name)').order('created_at') as never, ['washer_queue'])

  const byId = new Map(washers.data.map(w => [w.id, w]))
  const now = Date.now()
  const h = ref.hostels.find(x => x.code === hostel) || ref.hostels[0]

  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await p
    if (error) toast(error.message)
    washers.reload(); queue.reload()
  }
  const start = async (id: string) => {
    const t = Date.now()
    await run(supabase.from('washers').upsert({ id, hostel: h!.code, status: 'ok', started_at: new Date(t).toISOString(), ends_at: new Date(t + cycle * 60000).toISOString(), user_id: uid, updated_at: new Date(t).toISOString() }))
    await supabase.from('washer_queue').delete().eq('washer_id', id).eq('user_id', uid)
  }
  const ensure = (id: string) => supabase.from('washers').upsert({ id, hostel: h!.code }, { onConflict: 'id', ignoreDuplicates: true })

  if (!h) return <p className="note">No hostels set up yet. Ask a council admin to add them.</p>

  return (
    <section>
      <div className="hd"><div><h2>Washing machines</h2><p className="sub">Tap start when you load, and “I’m done” when you collect.</p></div></div>
      <ErrorNote error={washers.error} />
      <div className="sel">
        <div><label className="lab" htmlFor="w-h">Hostel</label>
          <select id="w-h" value={h.code} onChange={e => { setHostel(e.target.value); saveLocal('hub.hostel', e.target.value) }} style={{ minWidth: '14em' }}>
            {ref.hostels.map(x => {
              const free = Array.from({ length: x.machines }, (_, i) => `${x.code}-${i + 1}`).filter(id => washerState(byId.get(id), now) === 'free').length
              return <option key={x.code} value={x.code}>Hostel {x.code} · {free} of {x.machines} free</option>
            })}
          </select></div>
      </div>
      <Chips label="Cycle length" value={String(cycle)} onChange={v => { setCycle(+v); saveLocal('hub.cycle', +v) }} options={[['30', '30 min'], ['45', '45 min'], ['60', '60 min']]} />
      <div className="wash">
        {Array.from({ length: h.machines }, (_, i) => {
          const id = `${h.code}-${i + 1}`
          const w = byId.get(id)
          const st = washerState(w, now)
          const q = queue.data.filter(x => x.washer_id === id)
          const inQ = q.some(x => x.user_id === uid)
          const mine = w?.user_id === uid
          let tag, line: React.ReactNode, frac = 0, color = 'var(--leaf)'
          if (st === 'broken') { tag = <span className="tag t-red">Out of order</span>; line = 'Reported broken. Tap fixed once it works.'; color = 'var(--red)' }
          else if (st === 'busy') {
            const end = new Date(w!.ends_at!).getTime(), beg = new Date(w!.started_at || w!.ends_at!).getTime()
            frac = Math.min(1, Math.max(0, (now - beg) / Math.max(1, end - beg))); color = 'var(--sun)'
            tag = <span className="tag t-sun">{Math.ceil((end - now) / 60000)} min left</span>
            line = <>{w!.user?.name || 'Someone'} · ends <b>{hhmm(end)}</b></>
          } else {
            frac = 1; tag = <span className="tag t-ok">Free</span>
            line = w?.ends_at && now - new Date(w.ends_at).getTime() < 20 * 60000 ? `Cycle ended ${hhmm(w.ends_at)}. Check for clothes.` : 'Ready to use.'
            if (q.length) line = <>{line} Next up: {q[0].user?.name}.</>
          }
          return (
            <div className="card" key={id}>
              <div className="mc"><Drum frac={frac} color={color} /><div>
                <div className="ch"><h3>Machine {i + 1}</h3>{tag}</div>
                <div className="meta">{line}</div>
                {q.length > 0 && <div className="meta">Queue: {q.map(x => x.user?.name || 'Someone').join(', ')}</div>}
              </div></div>
              <div className="acts">
                {st === 'broken' && <button className="btn" onClick={() => run(supabase.from('washers').update({ status: 'ok', updated_at: new Date().toISOString() }).eq('id', id))}>Mark fixed</button>}
                {st === 'busy' && (mine
                  ? <button className="btn" onClick={() => run(supabase.from('washers').update({ ends_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id))}>I’m done</button>
                  : inQ ? <button className="btn" onClick={() => run(supabase.from('washer_queue').delete().eq('washer_id', id).eq('user_id', uid))}>Leave queue</button>
                    : <button className="btn" onClick={async () => { await ensure(id); run(supabase.from('washer_queue').insert({ washer_id: id })) }}>Join queue</button>)}
                {st === 'free' && <button className="btn" onClick={() => start(id)}>Start · {cycle} min</button>}
                {st === 'free' && inQ && <button className="btn" onClick={() => run(supabase.from('washer_queue').delete().eq('washer_id', id).eq('user_id', uid))}>Leave queue</button>}
                {st !== 'broken' && <button className="btn" onClick={() => run(supabase.from('washers').upsert({ id, hostel: h.code, status: 'broken', ends_at: null, updated_at: new Date().toISOString() }))}>Report issue</button>}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
