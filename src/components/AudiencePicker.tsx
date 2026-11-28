import { useMe } from '../lib/auth'
import { useRef_ } from '../lib/ref'
import { batchName, decodeAudience, encodeAudience, EVERYONE, kindOf, yearLabel, type Audience, type AudienceKind } from '../lib/audience'
import { sectionLabel } from '../lib/util'
import { Seg } from './Bits'

/**
 * "Who should see this?" in steps: first Everyone / Batch / Section / Hostel, then only what that needs
 * (which batch; which batch and section; which hostel). Admins can pick any group; students only groups
 * they belong to (the database enforces the same).
 */
export function AudiencePicker({ id, value, onChange, label = 'Who should see it' }: { id: string; value: Audience; onChange: (a: Audience) => void; label?: string }) {
  const { profile, isAdmin } = useMe()
  const { ref } = useRef_()
  const kind = kindOf(value)
  const years = ['1', '2']

  if (!isAdmin) return <>
    <label htmlFor={id}>{label}</label>
    <select id={id} value={encodeAudience(value)} onChange={e => onChange(decodeAudience(e.target.value))}>
      <option value="">Everyone on campus</option>
      <option value={'y:' + profile.year}>My batch ({batchName(profile.year)})</option>
      <option value={`s:${profile.year}:${profile.section}`}>My section ({batchName(profile.year)} · {sectionLabel(profile.section)})</option>
      {profile.hostel && <option value={'h:' + profile.hostel}>My hostel (Hostel {profile.hostel})</option>}
    </select>
  </>

  const pick = (k: AudienceKind) => {
    if (k === kind) return
    const year = value.year || profile.year
    if (k === 'all') onChange(EVERYONE)
    if (k === 'batch') onChange({ year, section: null, hostel: null })
    if (k === 'section') onChange({ year, section: value.section || profile.section || ref.sections[0]?.code || null, hostel: null })
    if (k === 'hostel') onChange({ year: null, section: null, hostel: profile.hostel || ref.hostels[0]?.code || null })
  }
  const yearSelect = (sid: string) => <div><label htmlFor={sid}>Batch</label>
    <select id={sid} value={value.year || profile.year} onChange={e => onChange({ ...value, year: e.target.value })}>
      {years.map(y => <option key={y} value={y} title={yearLabel(y)}>{batchName(y)}</option>)}
    </select></div>

  return <div className="audpick">
    <span className="lab" id={id + '-lab'}>{label}</span>
    <div role="group" aria-labelledby={id + '-lab'}>
      <Seg value={kind} onChange={pick} options={[['all', 'Everyone'], ['batch', 'A batch'], ['section', 'A section'], ['hostel', 'A hostel']]} />
    </div>
    {kind === 'batch' && <div className="row2">{yearSelect(id)}<div /></div>}
    {kind === 'section' && <div className="row2">
      {yearSelect(id)}
      <div><label htmlFor={id + '-sec'}>Section</label>
        <select id={id + '-sec'} value={value.section || ''} onChange={e => onChange({ ...value, section: e.target.value })}>
          {ref.sections.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select></div>
    </div>}
    {kind === 'hostel' && <div className="row2"><div><label htmlFor={id}>Hostel</label>
      <select id={id} value={value.hostel || ''} onChange={e => onChange({ ...value, hostel: e.target.value })}>
        {ref.hostels.map(h => <option key={h.code} value={h.code}>Hostel {h.code}</option>)}
      </select></div><div /></div>}
    <p className="note" style={{ marginTop: 4 }}>{kind === 'all' ? 'Everyone on campus sees it.' : 'Only these students see it and get the notification.'}</p>
  </div>
}
