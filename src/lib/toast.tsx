import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

const Ctx = createContext<(msg: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('')
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout>>()
  const show = useCallback((m: string) => {
    setMsg(m)
    if (timer) clearTimeout(timer)
    setTimer(setTimeout(() => setMsg(''), 4000))
  }, [timer])
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className={'toast' + (msg ? ' show' : '')} role="status" aria-live="polite">{msg}</div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
