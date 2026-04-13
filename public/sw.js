// No-op service worker — exists only so stale registrations can fetch it
// without hitting a redirect. The app's main.tsx unregisters all service workers on load.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
