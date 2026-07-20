const CACHE_NAME = 'crewcheck-v14.0.5-shell';
const RUNTIME_CACHE = 'crewcheck-v14.0.5-runtime';
const APP_SHELL = ['/', '/index.html', '/manifest.json'];

async function trimCache(cacheName, maxEntries = 120) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((request) => cache.delete(request)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => /crewcheck|workbox|vite/i.test(name) && ![CACHE_NAME, RUNTIME_CACHE].includes(name)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })().catch(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data === 'CLEAR_CREWCHECK_CACHE') {
    event.waitUntil(caches.keys().then((names) => Promise.all(names.filter((name) => /crewcheck|workbox|vite/i.test(name)).map((name) => caches.delete(name)))).catch(() => undefined));
  }
});

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isApiRequest(url)) {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => new Response(JSON.stringify({ ok: false, offline: true, message: 'CrewCheck offline. Dados locais ativos; sincronização automática ao voltar a conexão.' }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8' } })));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request, { cache: 'no-store' }).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy)).catch(() => undefined);
      return response;
    }).catch(() => caches.match('/index.html').then((cached) => cached || caches.match('/'))));
    return;
  }

  event.respondWith(fetch(request, { cache: 'no-store' }).then((response) => {
    if (response && response.status === 200) {
      const copy = response.clone();
      caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy).then(() => trimCache(RUNTIME_CACHE))).catch(() => undefined);
    }
    return response;
  }).catch(() => caches.match(request)));
});
