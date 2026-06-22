const CACHE_NAME = 'crewcheck-10.8.74';

async function clearCrewCheckCaches() {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => /crewcheck|workbox|vite/i.test(name)).map((name) => caches.delete(name)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(clearCrewCheckCaches().then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clearCrewCheckCaches().then(() => self.clients.claim()).catch(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || event.data === 'CLEAR_CREWCHECK_CACHE') {
    event.waitUntil(clearCrewCheckCaches().then(() => self.skipWaiting()).catch(() => undefined));
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => caches.match(event.request)));
});
