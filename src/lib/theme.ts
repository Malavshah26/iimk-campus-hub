import { local, saveLocal } from './util'

export type Theme = 'auto' | 'light' | 'dark'
const KEY = 'hub.theme'
const dark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches

export const getTheme = (): Theme => {
  const t = local<Theme>(KEY, 'auto')
  return t === 'light' || t === 'dark' ? t : 'auto'
}

/** Sets data-theme on <html> (the stylesheet switches colours with it) and the phone's status bar colour. */
export function applyTheme(t: Theme = getTheme()) {
  const root = document.documentElement
  if (t === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', t)
  const isDark = t === 'dark' || (t === 'auto' && dark())
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#16294a' : '#1f4583')
}

export function setTheme(t: Theme) {
  saveLocal(KEY, t)
  applyTheme(t)
}

/** Keeps Auto in step when the phone switches between light and dark. */
export function watchSystemTheme() {
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (getTheme() === 'auto') applyTheme('auto') })
}
