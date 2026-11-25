import { useState } from 'react'
import { ALLOWED_DOMAIN, GOOGLE_LOGIN, isAllowedEmail, supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    if (!isAllowedEmail(email)) { setMsg(`Use your @${ALLOWED_DOMAIN} email address.`); return }
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setMsg(error.message)
    else setSent(true)
  }

  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setMsg('That code didn’t work. Check it, or send a new one.')
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
            <button className="btn pri" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in code'}</button>
            {GOOGLE_LOGIN && <button className="btn wide" type="button" onClick={google}>Continue with Google</button>}
          </form>
        ) : (
          <form onSubmit={verify}>
            <p>We sent a sign-in email to <b>{email}</b>. Tap the link in it, or type the code here.</p>
            <label htmlFor="code">Code from the email</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={10} required value={code} onChange={e => setCode(e.target.value)} />
            <button className="btn pri" type="submit" disabled={busy}>{busy ? 'Checking…' : 'Sign in'}</button>
            <button className="btn wide" type="button" onClick={() => { setSent(false); setCode('') }}>Use a different email</button>
          </form>
        )}
        {msg && <p className="note err">{msg}</p>}
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
