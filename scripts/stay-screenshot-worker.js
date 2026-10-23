/* CrewCheck local OCR boundary. No application data may leave this worker. */
'use strict';
{
  const base = new URL('./', self.location.href);
  const scripts = new Set(['worker.min.js', 'tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'].map(name => new URL(name, base).href));
  const models = new Map([
    ['eng.traineddata.gz', { bytes: 1984273, hash: '18c1ac52b75e35d44735fb6c2a60acfaf23033524653200738e98f0243edb75b' }],
    ['por.traineddata.gz', { bytes: 1009185, hash: '7b0f1749aa255a593b14160c75f74690be740edcae94c5a45efc24ab50235f4d' }],
  ].map(([name, metadata]) => [new URL(name, base).href, metadata]));
  const modelCacheName = 'crewcheck-ocr-models-v7-18c1ac52-7b0f1749';
  const nativeFetch = self.fetch.bind(self);
  const nativeImport = self.importScripts.bind(self);
  async function verifiedBytes(response, metadata) {
    if (!response?.ok || !response.body) throw new Error('OCR model unavailable');
    const reader = response.body.getReader();
    const bytes = new Uint8Array(metadata.bytes); let offset = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (offset + value.length > bytes.length) throw new Error('OCR model size mismatch');
        bytes.set(value, offset); offset += value.length;
      }
    } finally { await reader.cancel().catch(() => {}); }
    if (offset !== bytes.length) throw new Error('OCR model size mismatch');
    const hash = Array.from(new Uint8Array(await self.crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== metadata.hash) throw new Error('OCR model integrity mismatch');
    return bytes;
  }
  const modelResponse = bytes => new Response(bytes, { headers: { 'Content-Type': 'application/gzip', 'Content-Length': String(bytes.length) } });
  self.fetch = async (input, init = {}) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input), base).href;
    const method = String(init.method || request?.method || 'GET').toUpperCase();
    const metadata = models.get(url);
    if (!metadata || method !== 'GET' || init.body != null || request?.body != null) throw new Error('OCR asset request rejected');
    // This cache is deliberately public-model-only. No image/text/job payload
    // enters this function: request allowlisting happens before any cache access.
    let cache;
    try {
      cache = await self.caches?.open(modelCacheName);
      const cached = await cache?.match(url);
      if (cached) {
        try { return modelResponse(await verifiedBytes(cached, metadata)); }
        catch { await cache.delete(url); }
      }
    } catch { cache = undefined; } // Restricted/private storage: normal download.
    const response = await nativeFetch(url, { method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store' });
    const bytes = await verifiedBytes(response, metadata);
    try { await cache?.put(url, modelResponse(bytes)); } catch {} // Quota does not break recognition.
    return modelResponse(bytes);
  };
  self.importScripts = (...urls) => {
    const resolved = urls.map(url => new URL(String(url), base).href);
    if (resolved.some(url => !scripts.has(url))) throw new Error('OCR script request rejected');
    return nativeImport(...resolved);
  };
  // Upstream diagnostics never become screenshot/evidence logs.
  for (const key of ['log', 'info', 'warn', 'error', 'debug', 'trace']) self.console[key] = () => {};
  self.importScripts(new URL('worker.min.js', base).href);
}
