// Campus Hub service worker: lets the app open offline (timetable, menu, bus and contacts are
// cached by the app itself) and shows notifications on Android.
// Pages are network-first so a new deploy shows up on the next load; built files under /assets/
// have unique names, so they're cached forever.
const CACHE = 'hub-v2'
const SHELL = ['/', '/icon.svg', '/icon-192.png', '/manifest.webmanifest']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const put = (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) {
    const copy = res.clone()
    caches.open(CACHE).then(c => c.put(req, copy))
  }
  return res
}

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  if (req.mode === 'navigate' && url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => put('/', res)).catch(() => caches.match('/')))
    return
  }
  const hashed = url.origin === location.origin && url.pathname.startsWith('/assets/')
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
  if (hashed || fonts) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => put(req, res))))
    return
  }
  if (url.origin === location.origin && (SHELL.includes(url.pathname) || /^\/(icon|apple-touch-icon|favicon)[\w-]*\.png$/.test(url.pathname))) {
    e.respondWith(fetch(req).then(res => put(req, res)).catch(() => caches.match(req)))
  }
  // Everything else (Supabase data, sign-in) always goes to the network.
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const open = list.find(c => 'focus' in c)
      return open ? open.focus() : self.clients.openWindow('/')
    }),
  )
})
