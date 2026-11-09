// Offline support: network first for the app's own files, cached copy when offline.
// Supabase API calls are never cached.
const CACHE = 'tml-shell-v5';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.json',
  'js/app.js', 'js/config.js', 'js/store.js', 'js/rates.js', 'js/dates.js', 'js/tax.js',
  'js/deadlines.js', 'js/csv.js', 'js/model.js', 'js/format.js', 'js/charts.js', 'js/guides.js', 'js/push.js',
  'js/screens/login.js', 'js/screens/today.js', 'js/screens/deadlines.js', 'js/screens/money.js', 'js/screens/guides.js', 'js/screens/more.js',
  'icons/icon-192.png', 'icons/icon-180.png',
];
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === self.location.origin;
  const lib = url.href.startsWith('https://cdn.jsdelivr.net/npm/@supabase/');
  if (!own && !lib) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
  );
});

// Push: show the notification, open the matching item when tapped.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'TML Group', {
    body: d.body || '', tag: d.tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', data: { url: d.url || './#today' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './#today', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
