const CACHE_NAME = 'crewcheck-v14.3-offline-shell';
const RUNTIME_CACHE = 'crewcheck-v14.3-offline-runtime';
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/icons/crewcheck-icon-v2.png'];

async function trimCache(cacheName, maxEntries = 160) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((request) => cache.delete(request)));
}

function isSameOriginAsset(value) {
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/auth/');
  } catch {
    return false;
  }
}

async function precachePreparedShell() {
  const cache = await caches.open(CACHE_NAME);
  const indexResponse = await fetch('/', { cache: 'no-store' });
  if (!indexResponse.ok) throw new Error(`CrewCheck shell unavailable (${indexResponse.status})`);

  await cache.put('/', indexResponse.clone());
  await cache.put('/index.html', indexResponse.clone());

  const html = await indexResponse.text();
  const urls = new Set(APP_SHELL);
  const assetPattern = /(?:src|href)=["']([^"']+)["']/g;
  let match;
  while ((match = assetPattern.exec(html))) {
    const value = match[1];
    if (!value || value.startsWith('data:') || !isSameOriginAsset(value)) continue;
    const url = new URL(value, self.location.origin);
    urls.add(`${url.pathname}${url.search}`);
  }

  await Promise.allSettled([...urls].map(async (url) => {
    if (url === '/' || url === '/index.html') return;
    const response = await fetch(url, { cache: 'no-store' });
    if (response.ok) await cache.put(url, response.clone());
  }));
}

self.addEventListener('install', (event) => {
  // Do not call skipWaiting here. The client coordinator decides when an update
  // can activate without interrupting an active operational session.
  event.waitUntil(precachePreparedShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => /crewcheck|workbox|vite/i.test(name) && ![CACHE_NAME, RUNTIME_CACHE].includes(name))
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })().catch(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  const type = typeof event.data === 'string' ? event.data : event.data?.type;
  if (type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (type === 'CLEAR_CREWCHECK_CACHE') {
    event.waitUntil(
      caches.keys()
        .then((names) => Promise.all(names.filter((name) => /crewcheck|workbox|vite/i.test(name)).map((name) => caches.delete(name))))
        .catch(() => undefined),
    );
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
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() => new Response(
        JSON.stringify({
          ok: false,
          offline: true,
          message: 'CrewCheck offline. Dados locais ativos; sincronização automática ao voltar a conexão.',
        }),
        { status: 503, headers: { 'content-type': 'application/json; charset=utf-8' } },
      )),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put('/', response.clone());
          await cache.put('/index.html', response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const shell = await caches.open(CACHE_NAME);
    const runtime = await caches.open(RUNTIME_CACHE);
    const cached = (await shell.match(request)) || (await runtime.match(request));
    if (cached) return cached;

    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response && response.status === 200) {
        await runtime.put(request, response.clone());
        await trimCache(RUNTIME_CACHE);
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
