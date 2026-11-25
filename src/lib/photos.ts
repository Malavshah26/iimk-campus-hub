import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export const looksImage = (f: File) =>
  /^image\//.test(f.type) || !f.type || /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(f.name)

type Drawable = ImageBitmap | HTMLImageElement

async function decode(file: File): Promise<Drawable> {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file) } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = rej
      i.src = url
    })
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/** Shrinks a photo to at most `max` px on its long side and returns a JPEG. */
export async function compress(file: File, max = 1280, quality = 0.82): Promise<Blob> {
  const img = await Promise.race([
    decode(file),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
  ])
  const w = img.width, h = img.height
  const k = Math.min(1, max / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * k))
  c.height = Math.max(1, Math.round(h * k))
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(img, 0, 0, c.width, c.height)
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', quality))
  if (!blob) throw new Error('encode')
  return blob
}

/** Uploads into photos/<userId>/<random>.jpg and returns the storage path. */
export async function uploadPhoto(userId: string, file: File): Promise<string> {
  let blob: Blob
  try {
    blob = await compress(file)
  } catch {
    throw new Error('Couldn’t read this photo. Try a JPG or a screenshot of it.')
  }
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error('Photo upload failed: ' + error.message)
  return path
}

export async function deletePhoto(path: string | null | undefined) {
  if (path) await supabase.storage.from('photos').remove([path])
}

const cache = new Map<string, { url: string; exp: number }>()

/** Signed (temporary) URLs for private photos, cached for ~50 minutes. */
export function useSignedUrls(paths: (string | null | undefined)[]) {
  const list = Array.from(new Set(paths.filter((p): p is string => !!p)))
  const key = list.join('|')
  const [, bump] = useState(0)
  useEffect(() => {
    const now = Date.now()
    const missing = list.filter(p => !cache.has(p) || cache.get(p)!.exp < now)
    if (!missing.length) return
    let live = true
    supabase.storage.from('photos').createSignedUrls(missing, 3600).then(({ data }) => {
      for (const r of data || []) if (r.signedUrl && r.path) cache.set(r.path, { url: r.signedUrl, exp: Date.now() + 50 * 60000 })
      if (live) bump(n => n + 1)
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return (p: string | null | undefined) => (p ? cache.get(p)?.url : undefined)
}
