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
const inbox = read('android-wrapper/app/src/main/java/com/crewcheck/app/SharedPdfInbox.java');
const manifest = read('android-wrapper/app/src/main/AndroidManifest.xml');
const chain = read('scripts/v14365/apply.mjs');

expect(home.includes("window.addEventListener('crewcheck:native-pdf'"), 'Home não escuta o PDF compartilhado pelo Android.');
expect(home.includes('processRosterFile(file)'), 'PDF compartilhado não reutiliza o importador canônico.');
expect(home.includes('const imported = await processRosterFile(file);'), 'ACK precisa depender do resultado real da importação.');
expect(home.includes('AndroidCrewCheckNative?.acknowledgeSharedPdf?.(shareId)'), 'Cliente não confirma o consumo do PDF nativo.');
expect(home.includes('syncRosterWithTelegramConcierge(roster, file.name)'), 'Fluxo canônico deixou de sincronizar a escala com o Concierge/Telegram.');
expect(home.includes('syncPlatformRoster(roster, newCompliance, file.name)'), 'Fluxo canônico deixou de sincronizar a escala com a plataforma.');

expect(android.includes('private String pendingSharedPdfId;'), 'Android não mantém identidade do PDF compartilhado.');
expect(android.includes('SharedPdfInbox.capture(this, uri, MAX_PDF_BYTES)'), 'Android não copia o share para inbox privado persistente.');
expect(android.includes('restorePendingSharedPdfFromInbox()'), 'Cold start não restaura PDF pendente.');
expect(android.includes('intent.getClipData().getItemAt(0).getUri()'), 'Android não aceita URI recebida via ClipData.');
expect(android.includes('payload.put("shareId", pending.id)'), 'Payload nativo não envia shareId persistente.');
expect(android.includes('SharedPdfInbox.readBytes(this, pending.id, MAX_PDF_BYTES)'), 'Dispatch deve ler o arquivo persistido, não depender apenas de RAM.');
expect(android.includes('public boolean acknowledgeSharedPdf(final String shareId)'), 'Bridge Android não expõe ACK do PDF.');
expect(android.includes('SharedPdfInbox.acknowledge(MainActivity.this, shareId)'), 'ACK deve remover o item do inbox persistente.');

expect(inbox.includes('context.getFilesDir()'), 'Inbox precisa usar armazenamento privado do app.');
expect(inbox.includes('KEY_CREATED_AT'), 'Inbox deve registrar idade do item pendente.');
expect(inbox.includes('MAX_PENDING_AGE_MS'), 'Inbox deve expirar handoffs abandonados.');
expect(inbox.includes("header[0] != '%'"), 'Inbox deve validar assinatura PDF antes de persistir.');
expect(inbox.includes('public static synchronized boolean acknowledge'), 'Inbox precisa de ACK explícito.');
expect(!inbox.includes('getExternalStorage'), 'Inbox não pode depender de armazenamento externo compartilhado.');

expect(manifest.includes('android:mimeType="application/pdf"'), 'Manifest perdeu suporte a application/pdf.');
expect(manifest.includes('android:mimeType="application/octet-stream"'), 'Manifest não aceita compartilhadores que enviam PDF como octet-stream.');
expect(chain.includes("await import('../v14368/apply.mjs');"), 'Hotfix legado deve continuar na preparação por compatibilidade.');

console.log('[v14.3.68] OK — Android persiste PDF compartilhado até ACK real e usa o importador canônico.');
