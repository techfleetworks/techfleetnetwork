/**
 * Self-destructing service worker.
 *
 * Tech Fleet does NOT use a service worker. This file exists solely to evict
 * any previously-installed PWA / Workbox service worker that may still be
 * intercepting `fetch` on returning users' devices and serving stale cached
 * HTML/JS — the #1 cause of "site loads blank for me but works for you".
 *
 * On activation: clear every cache, unregister this worker, and tell every
 * controlled client to hard-reload so they pick up the live HTML/asset
 * graph straight from the CDN.
 */
const CACHE_PURGE_VERSION = '2026-05-08-self-destruct-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if ('caches' in self) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((client) => {
      try {
        client.postMessage({ type: 'TECHFLEET_CACHE_PURGED', version: CACHE_PURGE_VERSION });
        // Force-reload bypassing the (now-empty) cache so dead chunk
        // filenames are re-resolved against the current asset manifest.
        client.navigate(client.url).catch(() => { /* ignore cross-origin / non-window clients */ });
      } catch { /* non-fatal */ }
    });
    // Self-destruct so this worker stops intercepting future requests.
    try { await self.registration.unregister(); } catch { /* non-fatal */ }
  })());
});

// Pass-through: never serve from cache. Defensive — should be unreachable
// because activate() unregisters this SW, but covers the brief window
// before unregister completes on the very first activation.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
