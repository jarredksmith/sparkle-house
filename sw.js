// Sparkle House service worker: keeps the app shell available offline.
// Bump VERSION whenever you change index.html so phones pick up the update.
const VERSION = 'sparkle-v15';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './house.js',
  './vendor/three.module.min.js',
  './vendor/three.core.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      // Only clear old app-shell caches; saved voice lines (sparkle-voice-*) are kept.
      Promise.all(keys.filter((k) => /^sparkle-v\d/.test(k) && k !== VERSION && k !== VERSION + '-fonts').map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never touch AI calls
  const url = new URL(req.url);

  // Fonts: cache after first load so the app looks right offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(VERSION + '-fonts').then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Pages: network first so updates arrive quickly, cache as fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});

/* ---------- Reminders (Web Push) ---------- */
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  const shown = self.registration.showNotification(d.title || 'Sparkle House', {
    body: d.body || 'Fluff has a sparkle idea for you!',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: d.tag || 'sparkle',
    data: { url: d.url || './' }
  });
  let badge = null;
  if (typeof d.badge === 'number' && self.navigator && 'setAppBadge' in self.navigator) {
    badge = (d.badge > 0 ? self.navigator.setAppBadge(d.badge) : self.navigator.clearAppBadge()).catch(() => {});
  }
  event.waitUntil(Promise.all([shown, badge]));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) { w.postMessage({ type: 'open', url }); return w.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
