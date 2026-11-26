import { useEffect, useState } from 'react'
import { ALLOWED_DOMAIN, explain, GOOGLE_LOGIN, isAllowedEmail, supabase } from '../lib/supabase'
import { local, saveLocal } from '../lib/util'

/** Reads an error Supabase put in the URL after a failed email-link sign-in, then tidies the URL. */
function linkError(): string {
  const raw = window.location.hash.slice(1) + '&' + window.location.search.slice(1)
  const p = new URLSearchParams(raw)
  const code = p.get('error_code') || p.get('error')
  if (!code) return ''
  history.replaceState(null, '', window.location.pathname)
  if (/otp_expired|expired/i.test(code + (p.get('error_description') || '')))
    return 'That sign-in link has expired or was already used. Each link works once, and only the newest email’s link works. Send yourself a new one below.'
  return 'Sign-in didn’t work: ' + (p.get('error_description') || code).replace(/\+/g, ' ')
}

// Read once at start-up (before anything else can tidy the URL).
let linkMsg = linkError()
const WAIT = 60

export function Login() {
  const [email, setEmail] = useState(() => local('hub.email', ''))
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(linkMsg)
  const [wait, setWait] = useState(0)
  useEffect(() => { linkMsg = '' }, [])

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait(w => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setMsg('')
    if (!isAllowedEmail(email)) { setMsg(`Use your @${ALLOWED_DOMAIN} email address.`); return }
    setBusy(true)
    const addr = email.trim().toLowerCase()
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) {
      const m = error.message
      if (/after (\d+) seconds?/i.test(m)) { setWait(+(m.match(/after (\d+) seconds?/i)![1])); setSent(true); return }
      if (/rate limit/i.test(m)) { setMsg('Too many sign-in emails were sent in the last hour. Wait a while and try again, or ask the council to set up custom email (docs/SETUP.md, step 4).'); return }
      if (error.status === 504 || /\b504\b|timeout|deadline/i.test(m)) { setSent(true); setWait(WAIT); setMsg('The email service was slow to answer, so the email may still arrive. Check your inbox and spam for a minute. If nothing comes, the council should check Supabase → Authentication → Logs (usually the SMTP settings).'); return }
      if (error.status === 500 || /sending .*email/i.test(m)) { setMsg('Campus Hub couldn’t send the email right now. Try again in a few minutes; if it keeps failing, tell the council (their SMTP settings need checking).'); return }
      setMsg(explain(m))
      return
    }
    saveLocal('hub.email', addr)
    setSent(true)
    setWait(WAIT)
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.replace(/\s/g, ''), type: 'email' })
    setBusy(false)
    if (error) setMsg(/expired/i.test(error.message) ? 'That code has expired. Send a new email and use the newest code.' : 'That code didn’t work. Check it, or send a new one.')
  }

  const google = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin, queryParams: { hd: ALLOWED_DOMAIN, prompt: 'select_account' } },
    })
  }

  return (
    <div className="auth">
      <div className="authcard">
        <div className="brand"><img src="/icon.svg" alt="" width={44} height={44} /><div><h1>IIMK Campus Hub</h1><p className="sub">For IIM Kozhikode students</p></div></div>
        {!sent ? (
          <form onSubmit={send}>
            <label htmlFor="email">Your IIMK email</label>
            <input id="email" type="email" inputMode="email" autoComplete="email" required placeholder={`name@${ALLOWED_DOMAIN}`}
              value={email} onChange={e => setEmail(e.target.value)} />
            <button className="btn pri" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</button>
            {GOOGLE_LOGIN && <button className="btn wide" type="button" onClick={google}>Continue with Google</button>}
          </form>
        ) : (
          <form onSubmit={verify}>
            <p>We sent a sign-in email to <b>{email}</b>.</p>
            <ol className="steps">
              <li>Open the <b>newest</b> email from Campus Hub (check spam too).</li>
              <li>Tap the link <b>once</b>, on this device if you can. You’ll come back here signed in.</li>
              <li>If the email shows a code, you can type it here instead.</li>
            </ol>
            <label htmlFor="code">Code from the email (if it has one)</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={e => setCode(e.target.value)} />
            <button className="btn pri" type="submit" disabled={busy || code.replace(/\s/g, '').length < 6}>{busy ? 'Checking…' : 'Sign in with code'}</button>
            <button className="btn wide" type="button" disabled={busy || wait > 0} onClick={() => send()}>{wait > 0 ? `Send again in ${wait}s` : 'Send a new email'}</button>
            <button className="btn wide" type="button" onClick={() => { setSent(false); setCode(''); setMsg('') }}>Use a different email</button>
          </form>
        )}
        {msg && <p className="note err" role="alert">{msg}</p>}
        <p className="note">Only @{ALLOWED_DOMAIN} accounts can sign in.</p>
      </div>
    </div>
  )
}

export function NotConfigured() {
  return (
    <div className="auth">
      <div className="authcard">
        <h1>Almost there</h1>
        <p>This copy of Campus Hub isn’t connected to a database yet.</p>
        <p>Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> as environment variables (see <code>docs/SETUP.md</code>), then redeploy.</p>
      </div>
    </div>
  )
}
