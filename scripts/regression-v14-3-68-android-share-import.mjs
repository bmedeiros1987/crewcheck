import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.68] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}
function expect(condition, message) {
  if (!condition) throw new Error(`[v14.3.68] ${message}`);
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

const dispatchStart = android.indexOf('private void dispatchPendingSharedPdf()');
const dispatchEnd = android.indexOf('private void injectIFlightAutomation(', dispatchStart);
expect(dispatchStart >= 0 && dispatchEnd > dispatchStart, 'Não foi possível isolar dispatchPendingSharedPdf.');
const dispatchBlock = android.slice(dispatchStart, dispatchEnd);
expect(!dispatchBlock.includes('pendingSharedPdfBase64 = null;'), 'Android ainda apaga o PDF imediatamente após disparar o evento.');
expect(!dispatchBlock.includes('pendingSharedPdfName = null;'), 'Android ainda apaga o nome do PDF antes do ACK.');

expect(manifest.includes('android:mimeType="application/pdf"'), 'Manifest perdeu suporte a application/pdf.');
expect(manifest.includes('android:mimeType="application/octet-stream"'), 'Manifest não aceita compartilhadores que enviam PDF como octet-stream.');
expect(chain.includes("await import('../v14368/apply.mjs');"), 'Hotfix v14.3.68 não está na preparação canônica.');

console.log('[v14.3.68] OK — PDF compartilhado permanece pendente até ACK, usa handleFile e sincroniza Telegram/plataforma.');
