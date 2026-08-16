import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('client/public/manifest.json', 'utf8'));
const sw = fs.readFileSync('client/public/sw.js', 'utf8');
const runtime = fs.readFileSync('client/src/lib/pwaSharedPdfRuntime.ts', 'utf8');
const main = fs.readFileSync('client/src/main.tsx', 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`[p0-pwa-share-target] ${message}`);
}

assert(manifest.share_target?.action === '/share-target', 'manifest deve declarar action /share-target');
assert(manifest.share_target?.method === 'POST', 'share target deve usar POST');
assert(manifest.share_target?.enctype === 'multipart/form-data', 'share target deve usar multipart/form-data');
const files = manifest.share_target?.params?.files;
assert(Array.isArray(files) && files.some((entry) => entry?.name === 'pdf' && entry?.accept?.includes('application/pdf')), 'share target deve aceitar PDF explicitamente');

assert(sw.includes("request.method === 'POST' && url.pathname === '/share-target'"), 'service worker deve interceptar POST do share target');
assert(sw.includes("signature !== '%PDF-'"), 'service worker deve validar assinatura PDF');
assert(sw.includes('SHARED_PDF_MAX_BYTES'), 'service worker deve limitar tamanho do PDF');
assert(sw.includes('SHARED_PDF_TTL_MS'), 'arquivo compartilhado deve expirar');
assert(sw.includes("'cache-control': 'no-store'"), 'PDF temporário não deve ser tratado como cache público');
assert(sw.includes("url.pathname.startsWith(SHARED_PDF_ROUTE)"), 'service worker deve servir somente a rota temporária dedicada');
assert(sw.includes('const response = await cache.match(request);'), 'handoff temporário deve ler uma única resposta dedicada');
assert(sw.includes('if (!response) return new Response(\'\', { status: 404 });'), 'segunda tentativa do mesmo handoff deve falhar de forma fechada');
assert(sw.includes('await cache.delete(request);\n      return response;'), 'handoff PWA deve ser single-use e apagar o PDF temporário após entrega');
assert(!sw.includes("mimeType=\"*/*\""), 'não ampliar aceite para wildcard');

assert(main.includes("import './lib/pwaSharedPdfRuntime';"), 'runtime PWA deve carregar no bootstrap');
assert(runtime.includes("signature !== '%PDF-'"), 'cliente deve revalidar assinatura antes de encaminhar');
assert(runtime.includes("__crewcheckPendingNativePdf"), 'PWA deve reutilizar o bridge canônico já consumido pelo Home');
assert(runtime.includes("crewcheck:native-pdf"), 'PWA deve reutilizar o mesmo evento da importação Android');
assert(runtime.includes('window.history.replaceState'), 'query com id temporário deve ser removida após consumo');
assert(!runtime.includes('handleFile('), 'runtime PWA não deve implementar parser/importador paralelo');

console.log('[p0-pwa-share-target] contrato PWA PDF share target protegido, incluindo handoff single-use.');
