import { useEffect, useState } from 'react'
import { attKey, markMany, unmarked, useDayMarks } from '../lib/attendance'
import { useMe } from '../lib/auth'
import { myClasses, useCal } from '../lib/gcal'
import { useRef_ } from '../lib/ref'
import { useToast } from '../lib/toast'
import { useTick } from '../lib/useLive'
import { local, mins, nowMin, saveLocal, today } from '../lib/util'

/** After today's last class: "3 classes aren't marked: Attended all / Mark each". */
export function AttendanceNudge({ route }: { route: string }) {
  useTick()
  useCal()
  const { uid, profile } = useMe()
  const { ref } = useRef_()
  const toast = useToast()
  const date = today()
  const ys = profile.year + profile.section
  const { marks, reload, setMarks } = useDayMarks(ys, date)
  const [hiddenFor, setHiddenFor] = useState(() => local<string>('hub.attNudgeHidden', ''))
  const [busy, setBusy] = useState(false)
  useEffect(() => { reload() }, [route, reload]) // pick up marks made on the Classes tab

  const classes = myClasses(ref, new Date(), profile.year, profile.section)
  const nm = nowMin()
  if (!classes.length || !marks || hiddenFor === date || route === 'classes') return null
  if (nm < Math.max(...classes.map(c => mins(c.ends)))) return null
  const todo = unmarked(classes, ys, date, marks, nm, true)
  if (!todo.length) return null

  const all = async () => {
    setBusy(true)
    const items = todo.map(c => ({ key: attKey(ys, date, c), code: c.code }))
    const err = await markMany(uid, items, 'y')
    setBusy(false)
    if (err) return toast('Couldn’t save attendance: ' + err)
    setMarks({ ...marks, ...Object.fromEntries(items.map(i => [i.key, 'y' as const])) })
    toast(`Marked ${items.length} class${items.length === 1 ? '' : 'es'} attended.`)
  }
  const hide = () => { saveLocal('hub.attNudgeHidden', date); setHiddenFor(date) }

  return (
    <div className="banner nudge" role="status">
      <a href="#classes"><b>Today’s attendance:</b> <span>{todo.length} of {classes.length} classes not marked ({todo.map(c => c.code).join(', ')})</span></a>
      <span className="acts" style={{ margin: 0, flexWrap: 'nowrap' }}>
        <button className="btn" type="button" disabled={busy} onClick={all}>✓ Attended all</button>
        <a className="btn" href="#classes">Mark each</a>
      </span>
      <button type="button" aria-label="Hide for today" onClick={hide}>×</button>
    </div>
  )
}
