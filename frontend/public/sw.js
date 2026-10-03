// Basic offline app-shell caching -- not a full offline-first strategy (this
// app is fundamentally live/real-time: feed, messaging, notifications all
// need a network connection to mean anything), just enough that the shell
// still loads instead of showing the browser's own offline error page, and
// that already-visited pages/assets work from cache when the network drops
// briefly.
//
// CACHE_NAME's version suffix is the manual "bust the old cache" switch --
// bump it whenever the precache list below changes, so activate's cleanup
// actually has a new name to diff against.
const CACHE_NAME = 'mysocialapp-shell-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Network-first, falling back to cache -- correctness (always prefer the
// live app/API response when online) matters more here than raw speed.
// Only GET requests are ever cacheable; API calls to a different origin
// (the backend) are left to the network/browser entirely, not intercepted.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Navigations (loading a route directly) fall back to the shell so
        // the SPA can still boot and render its own offline-aware UI,
        // rather than the browser's native "no internet" page.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/index.html');
          if (shell) return shell;
        }
        throw new Error('No cached response available');
      })
  );
});

// Day 22: web push (backend services/pushService.js). The payload is
// { title, body, url, tag }; a tag replaces the earlier notification about
// the same conversation/post instead of stacking them.
self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'MySocialApp', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: typeof data.url === 'string' ? data.url : '/' }
    })
  );
});

// Tapping it opens the right page -- in an open tab of the app if there is
// one. Only ever a page of this site (never a URL from the payload's
// origin, whatever it says).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ('navigate' in open) await open.navigate(target.href);
        return;
      }
      await self.clients.openWindow(target.href);
    })()
  );
});
