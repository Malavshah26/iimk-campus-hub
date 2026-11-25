import { useState } from 'react'
import { Art } from '../lib/icons'

/** Shows a photo if there is one, otherwise a drawing. */
export function Pic({ url, art, alt }: { url?: string; art: string; alt: string }) {
  const [broken, setBroken] = useState(false)
  if (url && !broken) return <img src={url} alt={alt} loading="lazy" onError={() => setBroken(true)} />
  return <Art name={art} />
}

export function Lightbox({ title, caption, url, art, onClose }: { title: string; caption: string; url?: string; art: string; onClose: () => void }) {
  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label={title}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
      <div className="lbin">
        <div className="lbh"><h3>{title}</h3><button className="btn" type="button" onClick={onClose} autoFocus>Close</button></div>
        <div className="lbimg"><Pic url={url} art={art} alt={title} /></div>
        <p className="meta">{caption}</p>
      </div>
    </div>
  )
}
