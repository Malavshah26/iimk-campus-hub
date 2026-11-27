import { useState } from 'react'
import { useInstall } from '../lib/install'
import { useToast } from '../lib/toast'
import { local, saveLocal } from '../lib/util'
import { Modal } from './Modal'

const ShareIcon = () => <svg className="ico" viewBox="0 0 24 24" width="18" height="18" aria-label="Share icon" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
  <path d="M12 15V3M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>

function IosSteps({ onClose }: { onClose: () => void }) {
  return <Modal label="Add Campus Hub to your home screen" onClose={onClose} head={<h2 className="mh">Add to your home screen</h2>}>
    <div className="mbody">
      <ol className="steps lg">
        <li>Tap <b>Share</b> <ShareIcon /> at the bottom of Safari (top right on iPad).</li>
        <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
        <li>Tap <b>Add</b>, then open Campus Hub from its new icon.</li>
      </ol>
      <p className="note">Using Chrome on iPhone? Tap <b>Share</b> <ShareIcon /> next to the address bar, then <b>Add to Home Screen</b>. On iPhone, notifications only work in the installed app.</p>
    </div>
  </Modal>
}

/** Install button for Profile and the intro; explains what to do where a button isn't possible. */
export function InstallButton() {
  const ins = useInstall()
  const toast = useToast()
  const [steps, setSteps] = useState(false)
  if (ins.installed) return <p className="tag t-ok big" style={{ margin: 0 }}>✓ Installed on this device</p>
  if (ins.inApp) return <p className="note" style={{ marginTop: 0 }}>You’re in another app’s built-in browser. Open this page in Chrome (Android) or Safari (iPhone) to install it.</p>
  if (ins.canPrompt) return <button className="btn pri inline" type="button" onClick={async () => { if (await ins.prompt()) toast('Installed. Open Campus Hub from your home screen.') }}>Install Campus Hub</button>
  if (ins.ios) return <>
    <button className="btn pri inline" type="button" onClick={() => setSteps(true)}>Add to Home Screen</button>
    {steps && <IosSteps onClose={() => setSteps(false)} />}
  </>
  return <p className="note" style={{ marginTop: 0 }}>Open the browser menu (⋮) and choose <b>Install app</b> or <b>Add to Home screen</b>.</p>
}

const HIDE = 'hub.installHidden'

/** A one-line offer on the home screen, until it's installed or dismissed (comes back after 30 days). */
export function InstallBanner() {
  const ins = useInstall()
  const toast = useToast()
  const [hiddenAt, setHiddenAt] = useState(() => local<number>(HIDE, 0))
  const [steps, setSteps] = useState(false)
  if (ins.installed || ins.inApp || !(ins.canPrompt || ins.ios) || Date.now() - hiddenAt < 30 * 864e5) return null
  const hide = () => { const t = Date.now(); saveLocal(HIDE, t); setHiddenAt(t) }
  return (
    <div className="banner nudge" role="status">
      <img className="appic" src="/icon-192.png" alt="" width={36} height={36} />
      <span className="bmsg"><b>Install Campus Hub</b> <span>· opens in one tap, works offline, gets notifications</span></span>
      <button className="btn" type="button" onClick={async () => {
        if (ins.canPrompt) { if (await ins.prompt()) toast('Installed. Open Campus Hub from your home screen.') }
        else setSteps(true)
      }}>{ins.canPrompt ? 'Install' : 'How?'}</button>
      <button type="button" aria-label="Not now" onClick={hide}>×</button>
      {steps && <IosSteps onClose={() => setSteps(false)} />}
    </div>
  )
}
