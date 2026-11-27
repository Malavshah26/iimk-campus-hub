import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** A dialog over the page: closes on Escape, the × button or a tap outside. */
export function Modal({ label, head, children, onClose, foot, top }: {
  label: string; head: ReactNode; children: ReactNode; onClose: () => void; foot?: ReactNode; top?: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!box.current?.contains(document.activeElement)) box.current?.focus()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [])
  // Rendered at the end of <body> so it never picks up the styles of whatever opened it (a banner, a card).
  return createPortal(<div className={'modal' + (top ? ' attop' : '')} role="dialog" aria-modal="true" aria-label={label} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="mcard" ref={box} tabIndex={-1}>
      <div className="mhead">{head}<button type="button" className="mx" aria-label="Close" onClick={onClose}>×</button></div>
      {children}
      {foot && <div className="mfoot">{foot}</div>}
    </div>
  </div>, document.body)
}
