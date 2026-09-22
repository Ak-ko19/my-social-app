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
