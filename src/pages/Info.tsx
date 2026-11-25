import { useState } from 'react'
import { useRef_ } from '../lib/ref'
import { useTick } from '../lib/useLive'
import { DAYS, inFmt, isWeekend, mins, norm, nowMin } from '../lib/util'
import { Chips, Empty } from '../components/Bits'

export function Bus() {
  useTick()
  const { ref } = useRef_()
  const todayType = isWeekend() ? 'weekend' : 'weekday'
  const [type, setType] = useState<'weekday' | 'weekend'>(todayType)
  const nm = nowMin()
  const col = (dir: 'out' | 'in', title: string, via: string) => {
    const list = ref.bus.filter(b => b.day_type === type && b.direction === dir).map(b => b.time).sort()
    const next = type === todayType ? list.find(x => mins(x) >= nm) : undefined
    return (
      <div>
        <div className="hd"><h3>{title}</h3></div>
        <div className="meta" style={{ margin: '-6px 0 8px' }}>{via}</div>
        {list.length ? list.map(x => {
          const past = type === todayType && mins(x) < nm
          return <div key={dir + x} className={'dep' + (past ? ' past' : '') + (x === next ? ' next' : '')}>
            <b>{x}</b><small>{x === next ? 'Next · in ' + inFmt(mins(x) - nm) : past ? 'Departed' : ''}</small></div>
        }) : <Empty>No buses listed.</Empty>}
      </div>
    )
  }
  return (
    <section>
      <div className="hd wrap"><div><h2>Campus bus</h2><p className="sub">Next departure is highlighted.</p></div>
        <Chips label="Days" value={type} onChange={setType} options={[['weekday', 'Mon–Fri'], ['weekend', 'Sat–Sun']]} /></div>
      <div className="cols">{col('out', 'Campus → City', 'From the main gate')}{col('in', 'City → Campus', 'Back to the main gate')}</div>
    </section>
  )
}

export function Mess() {
  useTick()
  const { ref } = useRef_()
  const todayName = DAYS[new Date().getDay()]
  const [day, setDay] = useState<string>(todayName)
  const nm = nowMin()
  const cur = ref.meals.find(m => nm >= mins(m.starts) && nm < mins(m.ends)) || ref.meals.find(m => mins(m.starts) > nm)
  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return (
    <section>
      <div className="hd"><h2>Mess menu</h2></div>
      <Chips label="Day" value={day} onChange={setDay} options={order.map(d => [d, d === todayName ? d + ' (today)' : d] as [string, string])} />
      {ref.meals.map(m => {
        const items = ref.menu.find(r => r.day === day && r.meal === m.meal)?.items || '—'
        const isCur = day === todayName && cur?.meal === m.meal
        return <div key={m.meal} className={'meal' + (isCur ? ' cur' : '')}>
          <div><b>{m.label}</b><small>{m.starts}–{m.ends}</small>
            {isCur && <div><span className="tag t-ok" style={{ marginTop: 6 }}>{nm >= mins(m.starts) ? 'Serving now' : 'Up next'}</span></div>}</div>
          <div>{items}</div>
        </div>
      })}
    </section>
  )
}

export function Contacts() {
  const { ref } = useRef_()
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState('')
  const term = norm(q)
  const groups = Array.from(new Set(ref.contacts.map(c => c.grp)))
  return (
    <section>
      <div className="hd"><div><h2>Important contacts</h2><p className="sub">Tap to call, or copy the number.</p></div></div>
      <input type="search" placeholder="Search contacts" aria-label="Search contacts" value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 420, marginBottom: 16 }} />
      {groups.map(g => {
        const items = ref.contacts.filter(c => c.grp === g && (!term || norm(`${c.name} ${c.number} ${c.note} ${g}`).includes(term)))
        if (!items.length) return null
        return <div className="cgrp" key={g}><h3>{g}</h3><div className="ctc">
          {items.map(c => <div key={c.id} className={'crd' + (c.emergency ? ' em' : '')}>
            <div><h4>{c.name}</h4><span className="num">{c.number}</span>{c.note && <span className="meta">{c.note}</span>}</div>
            <div className="acts">
              <a className="btn" href={'tel:' + c.number.replace(/\s/g, '')}>Call</a>
              <button className="btn" type="button" onClick={() => navigator.clipboard?.writeText(c.number).then(() => { setCopied(c.number); setTimeout(() => setCopied(''), 1500) }, () => {})}>{copied === c.number ? 'Copied' : 'Copy'}</button>
            </div>
          </div>)}
        </div></div>
      })}
      {!ref.contacts.length && <Empty>No contacts yet.</Empty>}
    </section>
  )
}
