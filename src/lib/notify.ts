/**
 * Device notifications. There's no push server, so these fire while Campus Hub is open
 * (in a browser tab, even in the background, or as an installed app).
 */
export const canNotify = () => typeof window !== 'undefined' && 'Notification' in window
export const notifyAllowed = () => canNotify() && Notification.permission === 'granted'
export const notifyBlocked = () => canNotify() && Notification.permission === 'denied'

export async function askNotify(): Promise<boolean> {
  if (!canNotify()) return false
  if (Notification.permission !== 'default') return Notification.permission === 'granted'
  try {
    return (await Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

export async function notify(title: string, body: string, tag?: string) {
  if (!notifyAllowed()) return
  try {
    // Android Chrome only allows notifications through the service worker.
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) await reg.showNotification(title, { body, tag, icon: '/icon.svg', badge: '/icon.svg' })
    else new Notification(title, { body, tag, icon: '/icon.svg' })
  } catch {
    /* notifications unavailable */
  }
}
