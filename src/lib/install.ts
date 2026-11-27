import { useEffect, useState } from 'react'

/**
 * "Install app" support. Chrome/Edge on Android and desktop fire `beforeinstallprompt`, which we keep so the
 * app can show its own Install button (one tap). iPhone/iPad have no such event: we show the Share ->
 * Add to Home Screen steps instead. Imported from main.tsx so the event is caught however early it fires.
 */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: InstallEvent | null = null
let justInstalled = false
const subs = new Set<() => void>()
const emit = () => subs.forEach(f => f())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as InstallEvent; emit() })
  window.addEventListener('appinstalled', () => { deferred = null; justInstalled = true; emit() })
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
/** WhatsApp, Instagram, Gmail etc. open links in their own browser, which can't install apps. */
export const inAppBrowser = () => /FBAN|FBAV|Instagram|Line\/|WhatsApp|GSA\/|; wv\)/i.test(navigator.userAgent)

export function useInstall() {
  const [, bump] = useState(0)
  useEffect(() => {
    const f = () => bump(n => n + 1)
    subs.add(f)
    return () => { subs.delete(f) }
  }, [])
  return {
    installed: justInstalled || isStandalone(),
    canPrompt: !!deferred,
    ios: isIOS(),
    inApp: inAppBrowser(),
    /** Shows the browser's install dialog; true if the student accepted. */
    prompt: async () => {
      if (!deferred) return false
      const d = deferred
      deferred = null
      await d.prompt()
      const { outcome } = await d.userChoice
      if (outcome === 'accepted') justInstalled = true
      emit()
      return outcome === 'accepted'
    },
  }
}
