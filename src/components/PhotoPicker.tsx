import { useEffect, useRef, useState } from 'react'
import { looksImage } from '../lib/photos'

/** File picker + paste box. Calls onChange with the chosen image (or null). */
export function PhotoPicker({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [preview, setPreview] = useState<string>()

  useEffect(() => {
    if (!file) { setPreview(undefined); if (input.current) input.current.value = ''; return }
    const u = URL.createObjectURL(file)
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  const take = (f: File | null | undefined) => {
    setMsg('')
    if (!f) return onChange(null)
    if (!looksImage(f)) { setMsg('That file isn’t a photo. Pick a JPG or PNG.'); return onChange(null) }
    if (f.size > 25 * 1024 * 1024) { setMsg('That photo is over 25 MB.'); return onChange(null) }
    onChange(f)
  }

  return (
    <div>
      <div className="ph">
        <input ref={input} type="file" accept="image/*" aria-label="Choose a photo" onChange={e => take(e.target.files?.[0])} />
        {preview && <img className="phprev" src={preview} alt="Selected" onError={() => setMsg('Photo selected. It will be converted when you post.')} />}
        {file && <button type="button" className="btn" onClick={() => onChange(null)}>Remove</button>}
      </div>
      <input className="paste" placeholder="Or tap here and paste a copied photo" aria-label="Paste a photo" autoComplete="off" value=""
        onChange={() => {}}
        onPaste={e => {
          const cd = e.clipboardData
          let f = Array.from(cd.files || []).find(looksImage)
          if (!f) f = Array.from(cd.items || []).find(i => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile() || undefined
          if (f) { e.preventDefault(); take(f); setMsg('Photo added.') }
          else setMsg('No photo found on the clipboard. Copy the photo first, then paste.')
        }} />
      {msg && <p className="note">{msg}</p>}
    </div>
  )
}
