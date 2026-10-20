// The app's offline support at the network level: the app shell opens
// with no connection, and already-loaded files work from cache. (The data
// -- Home's newest posts, messages written offline -- is kept by the app
// itself; see src/utils/offlineStore.js.) The app is live by nature, so
// everything else still needs the network.
//
// Day 72: two caches.
// - SHELL_CACHE: the app shell (index.html, manifest, icons) and the other
//   small same-origin files, network-first, so a page opens offline.
// - ASSETS_CACHE: the build's hashed files (/assets/...), cache-first --
//   a hashed name never changes content -- and trimmed to the newest
//   MAX_ASSETS, so the files of earlier deploys don't pile up forever (they
//   did with the single cache before).
// A version suffix is the "start over" switch: activate deletes every cache
// that isn't one of these two (v1 was the old single cache).
const SHELL_CACHE = 'mysocialapp-shell-v2';
const ASSETS_CACHE = 'mysocialapp-assets-v1';
const MAX_ASSETS = 60;
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE && key !== ASSETS_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// Oldest entries first (a cache keeps insertion order).
async function trim(cache, max) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((key) => cache.delete(key)));
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSETS_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trim(cache, MAX_ASSETS);
  }
  return response;
}

// Network-first, falling back to the cache: correctness (the live app when
// online) matters more than raw speed. A page load (any route of the SPA)
// is kept as /index.html, so every route opens offline.
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const key = request.mode === 'navigate' ? '/index.html' : request;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(key, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw err;
  }
}

// Only same-origin GETs: the API (another origin) is left to the network,
// and so are photos (the app shows what it has when they can't load).
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(url.pathname.startsWith('/assets/') ? cacheFirstAsset(request) : networkFirst(request));
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
