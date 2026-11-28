import { useMe } from '../lib/auth'
import { useRef_ } from '../lib/ref'
import { decodeAudience, encodeAudience, yearLabel, type Audience } from '../lib/audience'
import { sectionLabel } from '../lib/util'

/**
 * "Who should see this?": everyone, a batch (year), a section, or a hostel.
 * Admins can pick any group; students only groups they belong to (the database enforces the same).
 */
export function AudiencePicker({ id, value, onChange, label = 'Who should see it' }: { id: string; value: Audience; onChange: (a: Audience) => void; label?: string }) {
  const { profile, isAdmin } = useMe()
  const { ref } = useRef_()
  const years = ['1', '2']
  return <>
    <label htmlFor={id}>{label}</label>
    <select id={id} value={encodeAudience(value)} onChange={e => onChange(decodeAudience(e.target.value))}>
      <option value="">Everyone on campus</option>
      {isAdmin ? <>
        <optgroup label="Whole batch">{years.map(y => <option key={y} value={'y:' + y}>{yearLabel(y)}</option>)}</optgroup>
        {years.map(y => <optgroup key={y} label={`Sections, Year ${y}`}>
          {ref.sections.map(s => <option key={y + s.code} value={`s:${y}:${s.code}`}>Year {y} · {s.label}</option>)}
        </optgroup>)}
        <optgroup label="Hostels">{ref.hostels.map(h => <option key={h.code} value={'h:' + h.code}>Hostel {h.code}</option>)}</optgroup>
      </> : <>
        <option value={'y:' + profile.year}>My batch ({yearLabel(profile.year)})</option>
        <option value={`s:${profile.year}:${profile.section}`}>My section (Year {profile.year} · {sectionLabel(profile.section)})</option>
        {profile.hostel && <option value={'h:' + profile.hostel}>My hostel (Hostel {profile.hostel})</option>}
      </>}
    </select>
  </>
}
