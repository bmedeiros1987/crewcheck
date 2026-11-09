/** VM contract for the actual raw/prepared PWA service worker. No browser stub
 * replaces the separate real-pixel OCR suite. /ocr alone bypasses SW caching.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { stampServiceWorkerBuild } from './ci/stamp-service-worker-build.mjs';

const source = fs.readFileSync(process.env.STAY_SCREENSHOT_SW_SOURCE || 'client/public/sw.js', 'utf8');
const bypass = "  // OCR owns a verified public-model cache; never duplicate it in runtime caches.\n  if (url.pathname.startsWith('/ocr/')) return;\n\n";
assert.equal(source.split(bypass).length, 2, 'exactly one scoped OCR bypass');
const legacy = source.replace(bypass, '');
const origin = 'https://crewcheck.example';
const html = '<!doctype html><html><head><link rel="stylesheet" href="/assets/main.css"></head><body><script src="/assets/main.js"></script></body></html>';
const modelUrl = origin + '/ocr/v7/eng.traineddata.gz';
function harness(script) {
  const events = new Map(), cacheCalls = [], fetches = [], imports = [], stores = new Map();
  const key = request => new URL(typeof request === 'string' ? request : request.url, origin).href;
  const cacheStorage = {
    async open(name) {
      cacheCalls.push(['open', name]); if (!stores.has(name)) stores.set(name, new Map()); const store = stores.get(name);
      return {
        async match(request) { cacheCalls.push(['match', name, key(request)]); return store.get(key(request))?.clone(); },
        async put(request, response) { cacheCalls.push(['put', name, key(request)]); store.set(key(request), response.clone()); },
        async delete(request) { cacheCalls.push(['delete', name, key(request)]); return store.delete(key(request)); },
        async keys() { cacheCalls.push(['keys', name]); return [...store.keys()].map(url => new Request(url)); },
      };
    },
    async keys() { cacheCalls.push(['cacheKeys']); return [...stores.keys()]; },
    async match(request) { cacheCalls.push(['globalMatch', key(request)]); for (const store of stores.values()) if (store.has(key(request))) return store.get(key(request)).clone(); },
    async delete(name) { cacheCalls.push(['cacheDelete', name]); return stores.delete(name); },
  };
  const context = { URL, Request, Response, Headers, FormData, File, TextDecoder, Uint8Array, Date, Math, Set, Promise, JSON, crypto: webcrypto, caches: cacheStorage, importScripts: path => imports.push(path),
    fetch: async (request, options) => {
      const url = key(request); fetches.push({ url, cache: options?.cache });
      if (url.endsWith('/api/offline')) throw new Error('synthetic offline');
      return new Response(url === origin + '/' || url === origin + '/index.html' ? html : 'network:' + url, { headers: { 'content-type': url.endsWith('.js') ? 'application/javascript' : url.endsWith('.css') ? 'text/css' : 'text/html' } });
    },
    self: { location: { origin }, crypto: { randomUUID: () => 'synthetic-pdf-id' }, navigator: {}, registration: {}, clients: { matchAll: async () => [], claim: async () => {} }, addEventListener: (name, callback) => events.set(name, callback), skipWaiting: async () => {} },
  };
  vm.runInNewContext(script, context, { filename: 'actual-service-worker.js' });
  async function dispatch(path, options = {}) {
    let responded = false, responsePromise; const waits = [];
    const request = { url: new URL(path, origin).href, method: options.method || 'GET', mode: options.mode || 'cors', ...options };
    events.get('fetch')({ request, respondWith(value) { assert(!responded, 'one response only'); responded = true; responsePromise = Promise.resolve(value); }, waitUntil(value) { waits.push(value); } });
    const response = await responsePromise; await Promise.all(waits);
    return { responded, status: response?.status, body: response ? await response.clone().text() : undefined, location: response?.headers.get('location') };
  }
  return { events, cacheCalls, fetches, stores, dispatch, cacheStorage };
}

for (const [label, script] of [['raw-or-prepared', source], ['stamped-build', stampServiceWorkerBuild(source, html, ['/assets/main.js', '/assets/main.css']).source]]) {
  const h = harness(script);
  // A stale cross-build cache AND the dedicated model cache must not get read by
  // the outer service worker. The OCR worker itself validates its own model cache.
  h.stores.set('crewcheck-v0-runtime-old', new Map([[modelUrl, new Response('stale-runtime-copy')]]));
  h.stores.set('crewcheck-ocr-models-v7-synthetic', new Map([[modelUrl, new Response('public-model-copy')]]));
  for (const path of ['/ocr/v7/eng.traineddata.gz', '/ocr/v7/por.traineddata.gz?test=1', '/ocr/v7/worker-123.js', '/ocr/v7/tesseract-core-lstm.wasm.js', '/ocr/future/model', '/ocr/']) {
    assert.deepEqual(await h.dispatch(path), { responded: false, status: undefined, body: undefined, location: undefined }, label + ': OCR is native fetch, not respondWith');
  }
  assert.equal(h.cacheCalls.length, 0, label + ': no cache read/write/open/global match for OCR');
  assert.equal(h.fetches.length, 0, label + ': SW does not wrap/alter original OCR fetch options');
  // Defense in depth: removing only the OCR bypass must still not recover an
  // old generic cache entry now that the privacy boundary restricts lookup.
  // The bypass above remains required to avoid all outer-worker cache/network wrapping.
  const before = harness(script.replace(bypass, '')); before.stores.set('crewcheck-v0-runtime-old', new Map([[modelUrl, new Response('stale-runtime-copy')]]));
  assert.equal((await before.dispatch('/ocr/v7/eng.traineddata.gz')).body, 'network:' + modelUrl);
  assert(!before.cacheCalls.some(call => call[0] === 'globalMatch' || call[0] === 'put'), 'no generic replay/admission even without OCR bypass');
  assert(before.cacheCalls.length > 0);
}

// The one new path guard must preserve every other branch, including near-prefix
// /ocr-not, APIs, navigation, shared-PDF POST/GET and non-GET handling.
for (const options of [
  { path: '/assets/test.js' }, { path: '/ocr-not/test.js' }, { path: '/ocr' },
  { path: '/api/status' }, { path: '/api/offline' }, { path: '/auth/status' },
  { path: '/', mode: 'navigate' }, { path: '/ordinary', method: 'POST' },
  { path: '/__crewcheck_shared_pdf/missing' },
]) {
  const a = harness(source), b = harness(legacy); const { path, ...request } = options;
  assert.deepEqual(await a.dispatch(path, request), await b.dispatch(path, request), 'unaffected route ' + path);
  assert.deepEqual(a.cacheCalls, b.cacheCalls, 'same cache operations for ' + path); assert.deepEqual(a.fetches, b.fetches, 'same fetch operations for ' + path);
}
for (const script of [source, legacy]) {
  const h = harness(script); const file = new File(['%PDF-1.7\nsynthetic PDF'], 'synthetic.pdf', { type: 'application/pdf' });
  const formData = async () => { const form = new FormData(); form.append('pdf', file); return form; };
  const post = await h.dispatch('/share-target', { method: 'POST', formData });
  assert.equal(post.status, 303); assert(post.location.includes('crewcheckSharedPdf=synthetic-pdf-id'));
  const first = await h.dispatch('/__crewcheck_shared_pdf/synthetic-pdf-id'); assert.equal(first.status, 200); assert(first.body.startsWith('%PDF-'));
  assert.equal((await h.dispatch('/__crewcheck_shared_pdf/synthetic-pdf-id')).status, 404, 'legacy PDF one-use semantics remain unchanged');
}
// Current producer guarantees /assets-only; the actual install must fetch no OCR
// assets and must keep the whole OCR inventory outside the eager shell manifest.
const stamped = stampServiceWorkerBuild(source, html, ['/assets/main.js', '/assets/main.css']);
assert.throws(() => stampServiceWorkerBuild(source, html, ['/ocr/v7/eng.traineddata.gz']), /Invalid build asset URL/);
const installed = harness(stamped.source); let installation;
installed.events.get('install')({ waitUntil(value) { installation = value; } }); await installation;
assert(installed.fetches.length > 0); assert(!installed.fetches.some(item => new URL(item.url).pathname.startsWith('/ocr/')), 'OCR stays lazy at SW install');
assert(!installed.cacheCalls.some(item => item[0] === 'put' && item[2]?.includes('/ocr/')));
assert(!/(?:src|href)=[\"'][^\"']*\/ocr\//.test(fs.readFileSync('client/index.html', 'utf8')), 'current HTML shell contains no eager OCR URL');
const vite = fs.readFileSync('vite.config.ts', 'utf8');
assert(vite.includes("fs.readdirSync(path.join(root, 'assets')"), 'Vite inventories only the built /assets directory');
assert(vite.includes(".map(name => '/assets/'"), 'Vite stamps only /assets URLs');
console.log('PASS actual raw/prepared + stamped SW: exclusive /ocr bypass, privacy defense in depth, zero OCR respondWith/cache calls, unchanged non-OCR and single-use PDF routes, lazy /assets-only install.');
