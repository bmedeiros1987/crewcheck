import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.68] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function expect(condition, message) {
  if (!condition) throw new Error(`[v14.3.68] ${message}`);
}
function javaMethodBody(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return '';
}

const home = read('client/src/pages/Home.tsx');
const android = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const manifest = read('android-wrapper/app/src/main/AndroidManifest.xml');
const chain = read('scripts/v14365/apply.mjs');

expect(home.includes("window.addEventListener('crewcheck:native-pdf'"), 'Home não escuta o PDF compartilhado pelo Android.');
expect(home.includes('await handleFile({ target: { files: [file] } }'), 'PDF compartilhado não reutiliza o fluxo canônico handleFile.');
expect(home.includes('AndroidCrewCheckNative?.acknowledgeSharedPdf?.(shareId)'), 'Cliente não confirma o consumo do PDF nativo.');
expect(home.includes('syncRosterWithTelegramConcierge(roster, file.name)'), 'Fluxo canônico deixou de sincronizar a escala com o Concierge/Telegram.');
expect(home.includes('syncPlatformRoster(roster, newCompliance, file.name)'), 'Fluxo canônico deixou de sincronizar a escala com a plataforma.');

expect(android.includes('private String pendingSharedPdfId;'), 'Android não mantém identidade do PDF compartilhado.');
expect(android.includes('intent.getClipData().getItemAt(0).getUri()'), 'Android não aceita URI recebida via ClipData.');
expect(android.includes('payload.put("shareId", pendingSharedPdfId'), 'Payload nativo não envia shareId.');
expect(android.includes('public boolean acknowledgeSharedPdf(final String shareId)'), 'Bridge Android não expõe ACK do PDF.');

const dispatchBody = javaMethodBody(android, 'private void dispatchPendingSharedPdf()');
expect(dispatchBody, 'Não foi possível isolar dispatchPendingSharedPdf.');
expect(!dispatchBody.includes('pendingSharedPdfBase64 = null;'), 'Android ainda apaga o PDF imediatamente após disparar o evento.');
expect(!dispatchBody.includes('pendingSharedPdfName = null;'), 'Android ainda apaga o nome do PDF antes do ACK.');

const ackBody = javaMethodBody(android, 'public boolean acknowledgeSharedPdf(final String shareId)');
expect(ackBody, 'Não foi possível isolar acknowledgeSharedPdf.');
expect(ackBody.includes('pendingSharedPdfBase64 = null;'), 'ACK não libera o buffer do PDF compartilhado.');
expect(ackBody.includes('pendingSharedPdfName = null;'), 'ACK não libera o nome do PDF compartilhado.');
expect(ackBody.includes('pendingSharedPdfId = null;'), 'ACK não libera a identidade do PDF compartilhado.');

expect(manifest.includes('android:mimeType="application/pdf"'), 'Manifest perdeu suporte a application/pdf.');
expect(manifest.includes('android:mimeType="application/octet-stream"'), 'Manifest não aceita compartilhadores que enviam PDF como octet-stream.');
expect(chain.includes("await import('../v14368/apply.mjs');"), 'Hotfix v14.3.68 não está na preparação canônica.');

console.log('[v14.3.68] OK — PDF compartilhado permanece pendente até ACK, usa handleFile e sincroniza Telegram/plataforma.');
