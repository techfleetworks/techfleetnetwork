const CACHE_PURGE_VERSION = '2026-04-27-turnstile-force-cache-reset-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if ('caches' in self) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({ type: 'TECHFLEET_CACHE_PURGED', version: CACHE_PURGE_VERSION }));
  })());
});
