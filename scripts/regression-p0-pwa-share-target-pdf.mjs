import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync('client/public/manifest.json', 'utf8'));
const sw = fs.readFileSync('client/public/sw.js', 'utf8');
const runtime = fs.readFileSync('client/src/lib/pwaSharedPdfRuntime.ts', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
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
assert(sw.includes('SHARED_PDF_TTL_MS = 24 * 60 * 60 * 1000'), 'arquivo compartilhado deve sobreviver a login/reload por janela suficiente');
assert(sw.includes("'cache-control': 'no-store'"), 'PDF temporário não deve ser tratado como cache público');
assert(sw.includes("url.pathname.startsWith(SHARED_PDF_ROUTE)"), 'service worker deve servir somente a rota temporária dedicada');
assert(sw.includes('ACK_SHARED_PDF'), 'service worker deve apagar o PDF apenas após ACK do importador');
assert(sw.includes('cache.delete(new Request(storageUrl))'), 'ACK deve remover exatamente o share persistido');
assert(sw.includes('name !== SHARED_PDF_CACHE'), 'limpeza genérica de cache deve preservar o PDF pendente até ACK/TTL');
assert(!sw.includes('await cache.delete(request);\n      return response;'), 'GET do handoff não pode apagar o PDF antes do parser terminar');
assert(!sw.includes('mimeType="*/*"'), 'não ampliar aceite para wildcard');

assert(main.includes("import './lib/pwaSharedPdfRuntime';"), 'runtime PWA deve carregar no bootstrap');
assert(runtime.includes('PENDING_SHARE_KEY'), 'shareId deve sobreviver a autenticação/reload');
assert(runtime.includes('window.localStorage.setItem(PENDING_SHARE_KEY'), 'shareId precisa ser persistido antes de navegar');
assert(runtime.includes('claimPendingPwaSharedPdf'), 'Home precisa poder reclamar o PDF depois da autenticação');
assert(runtime.includes('acknowledgePwaSharedPdf'), 'runtime deve confirmar importação concluída');
assert(runtime.includes("worker?.postMessage({ type: 'ACK_SHARED_PDF'"), 'ACK precisa alcançar o service worker');
assert(runtime.includes('new File([blob], filename'), 'PWA deve entregar File real ao importador canônico');
assert(!runtime.includes('bytesToBase64'), 'PWA não deve converter PDF inteiro para Base64 sem necessidade');

assert(home.includes('claimPendingPwaSharedPdf()'), 'Home deve reclamar share PWA persistido.');
assert(home.includes('await importSharedPdfFile(claim.file'), 'claim PWA deve entrar no wrapper comum de compartilhamento.');
assert(home.includes('const imported = await processRosterFile(file);'), 'wrapper comum deve chamar o importador canônico e observar sucesso real.');
assert(home.includes('await acknowledgePwaSharedPdf(claim.shareId)'), 'PWA só pode apagar share após importação bem-sucedida.');

console.log('[p0-pwa-share-target] contrato PWA durável protegido: share sobrevive a login/reload e só some após ACK.');
