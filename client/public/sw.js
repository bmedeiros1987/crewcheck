importScripts('/crewcheck-push-offline.js');
const CREWCHECK_UPDATE_BUILD_ID='__CREWCHECK_UPDATE_BUILD_ID__';
const CREWCHECK_UPDATE_ENTRY='__CREWCHECK_UPDATE_ENTRY__';
const CREWCHECK_UPDATE_ASSETS=[];
const UPDATE_READY_KEY='/__crewcheck_update_ready__';
const CACHE_NAME = 'crewcheck-v14.3-offline-shell';
const RUNTIME_CACHE = 'crewcheck-v14.3-offline-runtime';
const SHARED_PDF_CACHE = 'crewcheck-pwa-shared-pdf-v1';
const SHARED_PDF_ROUTE = '/__crewcheck_shared_pdf/';
const SHARED_PDF_TTL_MS = 30 * 60 * 1000;
const SHARED_PDF_MAX_BYTES = 20 * 1024 * 1024;
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
  const html = await indexResponse.clone().text();
  if(/^[a-f0-9]{20}$/.test(CREWCHECK_UPDATE_BUILD_ID)&&!html.includes(CREWCHECK_UPDATE_ENTRY))throw new Error('Announced worker build does not match served entry');

  await cache.put('/', indexResponse.clone());
  await cache.put('/index.html', indexResponse.clone());

  const urls = new Set([...APP_SHELL,...CREWCHECK_UPDATE_ASSETS]);
  const assetPattern = /(?:src|href)=["']([^"']+)["']/g;
  let match;
  while ((match = assetPattern.exec(html))) {
    const value = match[1];
    if (!value || value.startsWith('data:') || !isSameOriginAsset(value)) continue;
    const url = new URL(value, self.location.origin);
    urls.add(`${url.pathname}${url.search}`);
  }

  await Promise.all([...urls].map(async (url) => {
    if (url === '/' || url === '/index.html') return;
    const response = await fetch(url, { cache: 'no-store' });
    if(!response.ok)throw new Error('Incomplete update download');
    if(/\.(?:m?js)(?:\?|$)/.test(url)&&!/(?:java|ecma)script/.test(response.headers.get('content-type')||''))throw new Error('Update script was not served');
    if(/\.css(?:\?|$)/.test(url)&&!/(?:text\/css)/.test(response.headers.get('content-type')||''))throw new Error('Update stylesheet was not served');
    await cache.put(url, response.clone());
  }));
  await cache.put(UPDATE_READY_KEY,new Response(JSON.stringify({buildId:CREWCHECK_UPDATE_BUILD_ID,urls:[...urls]}),{headers:{'content-type':'application/json'}}));
}

async function cleanupSharedPdfs() {
  const cache = await caches.open(SHARED_PDF_CACHE);
  const keys = await cache.keys();
  const now = Date.now();
  const keep = [];

  for (const request of keys) {
    const response = await cache.match(request);
    const createdAt = Number(response?.headers.get('x-crewcheck-created-at') || 0);
    if (!response || !createdAt || now - createdAt > SHARED_PDF_TTL_MS) {
      await cache.delete(request);
      continue;
    }
    keep.push(request);
  }

  if (keep.length > 3) {
    await Promise.all(keep.slice(0, keep.length - 3).map((request) => cache.delete(request)));
  }
}

function sharedPdfErrorRedirect(reason) {
  const target = new URL('/?view=import', self.location.origin);
  target.searchParams.set('crewcheckShareError', reason);
  return Response.redirect(target.toString(), 303);
}

async function receiveSharedPdf(request) {
  try {
    const form = await request.formData();
    const file = form.get('pdf');
    if (!file || typeof file.arrayBuffer !== 'function') return sharedPdfErrorRedirect('missing_pdf');
    if (!file.size || file.size > SHARED_PDF_MAX_BYTES) return sharedPdfErrorRedirect('invalid_size');

    const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const signature = new TextDecoder('ascii').decode(bytes);
    if (signature !== '%PDF-') return sharedPdfErrorRedirect('invalid_pdf');

    const shareId = self.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const cache = await caches.open(SHARED_PDF_CACHE);
    const storageUrl = new URL(`${SHARED_PDF_ROUTE}${encodeURIComponent(shareId)}`, self.location.origin).toString();
    const filename = String(file.name || 'CrewCheck-escala.pdf').slice(0, 180);

    await cache.put(
      new Request(storageUrl),
      new Response(file, {
        status: 200,
        headers: {
          'content-type': 'application/pdf',
          'cache-control': 'no-store',
          'x-crewcheck-created-at': String(Date.now()),
          'x-crewcheck-filename': encodeURIComponent(filename),
        },
      }),
    );
    await cleanupSharedPdfs();

    const target = new URL('/?view=import', self.location.origin);
    target.searchParams.set('crewcheckSharedPdf', shareId);
    return Response.redirect(target.toString(), 303);
  } catch {
    return sharedPdfErrorRedirect('share_failed');
  }
}

self.addEventListener('install', (event) => {
  // Do not call skipWaiting here. The client coordinator decides when an update
  // can activate without interrupting an active operational session.
  event.waitUntil(precachePreparedShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const openPages=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    await Promise.all(
      names
        .filter((name) => openPages.length===0 && /crewcheck|workbox|vite/i.test(name) && ![CACHE_NAME, RUNTIME_CACHE, SHARED_PDF_CACHE].includes(name))
        .map((name) => caches.delete(name)),
    );
    if(openPages.length===0)await cleanupSharedPdfs();
    await self.clients.claim();
  })().catch(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  const type = typeof event.data === 'string' ? event.data : event.data?.type;
  // Old hidden/idle coordinators must not bypass the new explicit-consent protocol.
  if(type==='CREWCHECK_UPDATE_INFO'||type==='CREWCHECK_ACTIVATE_UPDATE')event.waitUntil((async()=>{
    let own=false;try{own=event.source?.type==='window'&&new URL(event.source.url).origin===self.location.origin;}catch{}
    if(!own)return;
    const cache=await caches.open(CACHE_NAME),response=await cache.match(UPDATE_READY_KEY),ready=response?await response.json().catch(()=>null):null;
    const valid=/^[a-f0-9]{20}$/.test(CREWCHECK_UPDATE_BUILD_ID)&&ready?.buildId===CREWCHECK_UPDATE_BUILD_ID&&Array.isArray(ready.urls)&&(await Promise.all(ready.urls.map(url=>cache.match(url)))).every(Boolean);
    if(type==='CREWCHECK_UPDATE_INFO'){event.ports[0]?.postMessage({ready:valid,buildId:CREWCHECK_UPDATE_BUILD_ID});return;}
    const accepted=valid&&event.data.buildId===CREWCHECK_UPDATE_BUILD_ID;
    event.ports[0]?.postMessage({accepted,buildId:CREWCHECK_UPDATE_BUILD_ID});
    if(accepted)await self.skipWaiting();
  })());
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
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(receiveSharedPdf(request));
    return;
  }

  if (request.method !== 'GET') return;

  if (url.pathname.startsWith(SHARED_PDF_ROUTE)) {
    event.respondWith((async () => {
      await cleanupSharedPdfs();
      const cache = await caches.open(SHARED_PDF_CACHE);
      const response = await cache.match(request);
      if (!response) return new Response('', { status: 404 });
      await cache.delete(request);
      return response;
    })());
    return;
  }

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
        if (response.ok && /^[a-f0-9]{20}$/.test(CREWCHECK_UPDATE_BUILD_ID) && (await response.clone().text()).includes(CREWCHECK_UPDATE_ENTRY)) {
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
    // Preserve old chunks used by still-open forms/tabs after explicit activation.
    const cached = (await shell.match(request)) || (await runtime.match(request)) || (await caches.match(request));
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
