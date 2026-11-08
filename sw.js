// Caches the app shell only. Addon requests (cross-origin) are never touched.
// The shell is always asked fresh from the network first (a cheap "has it changed?" check), so an update shows on the next launch;
// the cached copy is only used offline. The remembered catalog rows (streamlet-data) survive updates.
const CACHE = 'streamlet-v208';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && !k.startsWith('streamlet-data')).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  const fresh = e.request.mode === 'navigate' ? new Request(u.href, {cache:'no-cache', credentials:'same-origin'}) : new Request(e.request, {cache:'no-cache'});
  e.respondWith(fetch(fresh).then(r => { if (r.status === 200) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)).catch(() => {}); } return r; }).catch(() => caches.match(e.request)));
});
