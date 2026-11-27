import { useEffect, useRef } from 'react'

/** The item part of a deep link: '#events/<id>' -> '<id>' (used by search to open a specific thing). */
export const hashId = () => {
  try { return decodeURIComponent(window.location.hash.slice(1).split('/')[1] || '') } catch { return '' }
}

/**
 * When the address names an item (#tab/<id>), scrolls to the element with id `it-<id>` and highlights it.
 * `prepare` runs first (e.g. switch a filter so the item is shown). Runs once `ready` and on every address change.
 */
export function useFocusItem(ready: boolean, prepare?: (id: string) => void) {
  const prep = useRef(prepare)
  prep.current = prepare
  useEffect(() => {
    if (!ready) return
    let t: ReturnType<typeof setTimeout>
    const go = () => {
      const id = hashId()
      if (!id) return
      prep.current?.(id)
      clearTimeout(t)
      t = setTimeout(() => {
        const el = document.getElementById('it-' + id)
        if (!el) return
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        el.classList.add('flash')
        setTimeout(() => el.classList.remove('flash'), 2400)
      }, 150)
    }
    go()
    window.addEventListener('hashchange', go)
    return () => { clearTimeout(t); window.removeEventListener('hashchange', go) }
  }, [ready])
}
