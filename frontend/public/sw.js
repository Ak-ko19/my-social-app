// The app's offline support at the network level: the app shell and every
// screen's code open with no connection. (The data
// -- Home's newest posts, messages written offline -- is kept by the app
// itself; see src/utils/offlineStore.js.) The app is live by nature, so
// everything else still needs the network.
//
// Day 72: two caches.
// - SHELL_CACHE: the app shell (index.html, manifest, icons) and the other
//   small same-origin files, network-first, so a page opens offline.
// - ASSETS_CACHE: the build's hashed files (/assets/...), cache-first --
//   a hashed name never changes content. Day 75: every script and style of
//   this build (PRECACHE) is fetched on install, so any screen opens offline
//   (before, only the ones already visited). Other files -- fonts, and the
//   files of earlier deploys, which a tab still open on one may need --
//   are trimmed to the newest MAX_OTHER_ASSETS, so they don't pile up.
// A version suffix is the "start over" switch: activate deletes every cache
// that isn't one of these two (v1 was the old single cache).
const SHELL_CACHE = 'mysocialapp-shell-v2';
const ASSETS_CACHE = 'mysocialapp-assets-v1';
const MAX_OTHER_ASSETS = 40;
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png'];
// Filled in at build time (vite-plugins/swPrecache.js); empty in dev.
const PRECACHE = [];
const CURRENT = new Set(PRECACHE);

// Best effort: a file that can't be fetched now is fetched on first use.
async function precacheAssets() {
  const cache = await caches.open(ASSETS_CACHE);
  await Promise.all(PRECACHE.map(async (file) => {
    if (await cache.match(file)) return;
    try {
      const response = await fetch(file);
      if (response.ok) await cache.put(file, response);
    } catch {
      // offline or a blip: left to cacheFirstAsset
    }
  }));
  await trim(cache);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(precacheAssets)
      .then(() => self.skipWaiting())
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

// This build's files always stay; of the others, the oldest go first (a
// cache keeps insertion order).
async function trim(cache) {
  const others = (await cache.keys()).filter((key) => !CURRENT.has(new URL(key.url).pathname));
  await Promise.all(others.slice(0, Math.max(0, others.length - MAX_OTHER_ASSETS)).map((key) => cache.delete(key)));
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSETS_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trim(cache);
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
