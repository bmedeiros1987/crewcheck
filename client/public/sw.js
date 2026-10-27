importScripts('/crewcheck-gate-receiver-offline.js','/crewcheck-push-offline.js');
const CREWCHECK_UPDATE_BUILD_ID='__CREWCHECK_UPDATE_BUILD_ID__';
const CREWCHECK_UPDATE_ENTRY='__CREWCHECK_UPDATE_ENTRY__';
const CREWCHECK_UPDATE_ASSETS=[];
const CREWCHECK_UPDATE_HTML_HASH='__CREWCHECK_UPDATE_HTML_HASH__';
async function matchesBuildHtml(response){if(!response)return false;const bytes=await response.clone().arrayBuffer();const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');return hash===CREWCHECK_UPDATE_HTML_HASH;}
const UPDATE_READY_KEY='/__crewcheck_update_ready__';
const CACHE_NAME = 'crewcheck-v14.3-offline-shell';
const RUNTIME_CACHE = 'crewcheck-v14.3-offline-runtime';
const SHARED_PDF_CACHE = 'crewcheck-pwa-shared-pdf-v1';
const SHARED_PDF_ROUTE = '/__crewcheck_shared_pdf/';
const SHARED_PDF_TTL_MS = 30 * 60 * 1000;
const SHARED_PDF_MAX_BYTES = 20 * 1024 * 1024;
// Install and retirement share one origin-wide exclusive lock. Unsupported browsers
// still install normally, but retain old caches rather than guess lifecycle safety.
const BUILD_CACHE_LOCK = 'crewcheck-build-cache-lifecycle-v1';
function withBuildCacheLock(action, options = {}) {
  return self.navigator?.locks?.request
    ? self.navigator.locks.request(BUILD_CACHE_LOCK, options, action) : action();
}
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

function hasPrivateCachePolicy(response) {
  return /(?:^|,)\s*private(?:\s|,|=|$)/i.test(response.headers.get('cache-control') || '')
    || /(?:^|,)\s*(?:authorization|cookie|\*)\s*(?:,|$)/i.test(response.headers.get('vary') || '');
}
async function precachePreparedShell() {
  const cache = await caches.open(CACHE_NAME);
  // Preserve the build-owned pair even when every fetch hits the prepared shell.
  await caches.open(RUNTIME_CACHE);
  const indexResponse = await fetch('/', { cache: 'no-store' });
  if (hasPrivateCachePolicy(indexResponse)) throw new Error('Private update entry response');
  if (!indexResponse.ok) throw new Error(`CrewCheck shell unavailable (${indexResponse.status})`);
  const html = await indexResponse.clone().text();
  if(/^[a-f0-9]{20}$/.test(CREWCHECK_UPDATE_BUILD_ID)&&!(await matchesBuildHtml(indexResponse)))throw new Error('Announced worker build does not match served entry');

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
    if(hasPrivateCachePolicy(response))throw new Error('Private update asset response');
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
  event.waitUntil(withBuildCacheLock(precachePreparedShell));
});

// A closing window does not fire activate again. A fresh navigation provides
// another opportunity, but only its brand-new resulting client may be excluded:
// existing/hidden/uncontrolled documents can still need prior build chunks.
async function cleanupRetiredBuildCaches(arrivingClientId = '') {
  if (!self.navigator?.locks?.request || !self.serviceWorker
      || self.registration.installing || self.registration.waiting) return false;
  return withBuildCacheLock(async (lock) => {
    if (!lock) return false;
    // Object identity distinguishes this execution from a replacement using the
    // same script URL. Pending workers pin all build caches, even before their
    // first cache write. The lock prevents installation from writing between
    // these checks and deletion, including a new install after enumeration.
    const ownsRetirement = () => self.registration.active === self.serviceWorker
      && ['activating','activated'].includes(self.serviceWorker.state)
      && !self.registration.installing && !self.registration.waiting;
    const hasExistingPages = async () => (await self.clients.matchAll({type:'window',includeUncontrolled:true}))
      .some(page => page.id !== arrivingClientId);
    if (!ownsRetirement() || await hasExistingPages()) return false;
    const names = await caches.keys();
    for (const name of names) {
      if (!/^crewcheck-v[\d.]+-(?:offline-)?(?:shell|runtime)(?:-[a-zA-Z0-9]+)*$/.test(name)
          || [CACHE_NAME,RUNTIME_CACHE,SHARED_PDF_CACHE].includes(name)) continue;
      if (await hasExistingPages() || !ownsRetirement()) return false;
      await caches.delete(name);
    }
    return true;
  }, {ifAvailable:true});
}

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await withBuildCacheLock(purgeUnsafeRuntimeEntries);
    await cleanupRetiredBuildCaches();
    const openPages=await self.clients.matchAll({type:'window',includeUncontrolled:true});
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
    const valid=/^[a-f0-9]{20}$/.test(CREWCHECK_UPDATE_BUILD_ID)&&ready?.buildId===CREWCHECK_UPDATE_BUILD_ID&&Array.isArray(ready.urls)&&(await matchesBuildHtml(await cache.match('/index.html')))&&(await Promise.all(ready.urls.map(url=>cache.match(url)))).every(Boolean);
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

// Privacy boundary: generic runtime caching is for public static assets only.
function isPublicBuildRequest(request) {
  const url = new URL(request.url);
  return request.method === 'GET' && url.origin === self.location.origin
    && !['authorization','proxy-authorization','cookie','x-api-key','x-auth-token'].some(name => request.headers?.has(name))
    && [...url.searchParams.keys()].every(name => ['v','brand'].includes(name))
    && (url.pathname === '/manifest.json' || (/^(?:\/assets\/|\/icons\/|\/fonts\/)/.test(url.pathname)
      && /\.(?:m?js|css|woff2?|ttf|png|jpe?g|webp|svg|ico|mp3|mp4|ogg|wav|webm|json)$/.test(url.pathname)));
}
function isPublicRuntimeRequest(request) {
  const pathname = new URL(request.url).pathname;
  return isPublicBuildRequest(request) && (pathname === '/manifest.json' || !/\.(?:mp3|mp4|ogg|wav|webm|json)$/.test(pathname));
}
function isPublicAssetType(request, response, listedShell = false) {
  const pathname = new URL(request.url).pathname;
  const type = (response?.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (pathname === '/manifest.json') return type === 'application/json' || type === 'application/manifest+json';
  if (/\.json$/.test(pathname)) return listedShell && type === 'application/json';
  if (/\.m?js$/.test(pathname)) return /^(?:text|application)\/(?:javascript|ecmascript)$/.test(type);
  if (/\.css$/.test(pathname)) return type === 'text/css';
  // The production static server uses octet-stream for public binary assets.
  // Only exact shell-manifest membership may authorize that compatibility path.
  if (listedShell && type === 'application/octet-stream'
      && /\.(?:woff2?|ttf|png|jpe?g|webp|svg|ico|mp3|mp4|ogg|wav|webm)$/.test(pathname)) return true;
  if (/\.(?:mp3|mp4|ogg|wav|webm)$/.test(pathname)) return listedShell && /^(?:audio|video)\//.test(type);
  if (/\.(?:woff2?|ttf)$/.test(pathname)) return /^(?:font\/|application\/(?:font|x-font))/.test(type);
  return /^image\//.test(type);
}
function isPublicRuntimeResponse(request, response) {
  return isPublicRuntimeRequest(request) && isPublicAssetType(request, response) && response?.status === 200
    && /(?:^|,)\s*(?:public|max-age\s*=)/i.test(response.headers.get('cache-control') || '')
    && response.type !== 'opaque' && !response.redirected
    && !/(?:^|,)\s*(?:no-store|private)(?:\s|,|=|$)/i.test(response.headers.get('cache-control') || '')
    && !hasPrivateCachePolicy(response);
}
const BUILD_CACHE_NAME_PATTERN = /^crewcheck-v[\d.]+-(?:offline-)?(?:shell|runtime)(?:-[a-zA-Z0-9]+)*$/;
async function matchPublicBuildAsset(request) {
  // Keep prior build chunks, but never search shared-PDF, OCR or arbitrary origin caches.
  if (!isPublicBuildRequest(request)) return undefined;
  const names = await caches.keys();
  for (const name of new Set([CACHE_NAME, RUNTIME_CACHE, ...names.filter(name => BUILD_CACHE_NAME_PATTERN.test(name))])) {
    const cache = await caches.open(name);
    // Inspect the stored request as well: Cache.match ignores Authorization by default.
    for (const stored of await cache.keys(request)) {
      const response = await cache.match(stored);
      const isShell = /-(?:offline-)?shell(?:-|$)/.test(name);
      const ready = isShell ? await cache.match(UPDATE_READY_KEY) : null;
      const manifest = ready ? await ready.json().catch(() => null) : null;
      const listed = Array.isArray(manifest?.urls) && manifest.urls.some(value => new URL(value, self.location.origin).href === request.url);
      // Prepared shell downloads deliberately use no-store; only explicitly listed
      // public build assets may use that exception, never generic runtime entries.
      const shellSafe = isShell && listed && isPublicBuildRequest(stored)
        && isPublicAssetType(stored, response, true) && response?.status === 200 && !response.redirected
        && !hasPrivateCachePolicy(response);
      if (shellSafe || (isPublicRuntimeResponse(stored, response) && isPublicRuntimeResponse(request, response))) return response;
    }
  }
}
async function purgeUnsafeRuntimeEntries() {
  // Scoped entry deletion only; no whole-cache deletion or shared-PDF/roster mutation.
  for (const name of await caches.keys()) {
    if (!/^crewcheck-v[\d.]+-(?:offline-)?runtime(?:-[a-zA-Z0-9]+)*$/.test(name)) continue;
    const cache = await caches.open(name);
    for (const request of await cache.keys()) {
      if (!isPublicRuntimeResponse(request, await cache.match(request))) await cache.delete(request);
    }
  }
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

  // OCR owns a verified public-model cache; never duplicate it in runtime caches.
  if (url.pathname.startsWith('/ocr/')) return;

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

  if (['authorization','proxy-authorization','cookie','x-api-key','x-auth-token'].some(name => request.headers?.has(name))) {
    event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => Response.error()));
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
      const arrivingClientId = !event.clientId && typeof event.resultingClientId === 'string'
        ? event.resultingClientId : '';
      await cleanupRetiredBuildCaches(arrivingClientId).catch(() => undefined);
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok && !hasPrivateCachePolicy(response) && /^[a-f0-9]{20}$/.test(CREWCHECK_UPDATE_BUILD_ID) && (await matchesBuildHtml(response))) {
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
    const cached = await matchPublicBuildAsset(request);
    if (cached) return cached;
    const runtime = await caches.open(RUNTIME_CACHE);

    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (isPublicRuntimeResponse(request, response)) {
        await runtime.put(new Request(request.url), response.clone());
        await trimCache(RUNTIME_CACHE);
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
