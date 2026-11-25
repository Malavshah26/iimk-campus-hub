import type { ReactNode } from 'react'

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>

export function Chips<T extends string>({ value, options, onChange, label }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; label: string
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map(([v, t]) => (
        <button key={v} type="button" className={'chip' + (v === value ? ' on' : '')} aria-pressed={v === value} onClick={() => onChange(v)}>{t}</button>
      ))}
    </div>
  )
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" style={{ gridTemplateColumns: `repeat(${options.length},1fr)` }}>
      {options.map(([v, t]) => (
        <button key={v} type="button" className={v === value ? 'on' : ''} aria-pressed={v === value} onClick={() => onChange(v)}>{t}</button>
      ))}
    </div>
  )
}

export const Loading = () => <div className="empty">Loading…</div>
export const ErrorNote = ({ error }: { error: string | null }) => (error ? <div className="status show">Couldn’t load: {error}</div> : null)
