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
const preparation = read('scripts/v139/apply.mjs');
const buildIdentityFinalizer = read('scripts/p0-build-identity/apply.mjs');

expect(home.includes("window.addEventListener('crewcheck:native-pdf'"), 'Home não escuta o PDF compartilhado pelo Android.');
expect(home.includes('processRosterFile(file)'), 'PDF compartilhado não reutiliza o importador canônico.');
expect(home.includes('nativeBridge.readSharedPdfChunk'), 'Home deve reconstruir o arquivo por chunks do inbox nativo.');
expect(home.includes('const imported = await processRosterFile(file);'), 'ACK precisa depender do resultado real da importação.');
expect(home.includes('const decision = await confirmRosterImport(roster, file.name);'), 'Importador compartilhado deve aguardar a decisão assíncrona do guardião antes de tocar a escala ativa.');
expect(home.includes('AndroidCrewCheckNative?.acknowledgeSharedPdf?.(shareId)'), 'Cliente não confirma o consumo do PDF nativo.');
expect(home.includes('claimPendingPwaSharedPdf()'), 'PWA compartilhado não converge no mesmo importador canônico.');
expect(home.includes('acknowledgePwaSharedPdf(claim.shareId)'), 'PWA não confirma o handoff após importação bem-sucedida.');
expect(home.includes('syncRosterWithTelegramConcierge(roster, file.name)'), 'Fluxo canônico deixou de sincronizar a escala com o Concierge/Telegram.');
expect(home.includes('syncPlatformRoster(roster, newCompliance, file.name)'), 'Fluxo canônico deixou de sincronizar a escala com a plataforma.');

expect(android.includes('private String pendingSharedPdfId;'), 'Android não mantém identidade do PDF compartilhado.');
expect(android.includes('SharedPdfInbox.capture(this, uri, MAX_PDF_BYTES)'), 'Android não copia o share para inbox privado persistente.');
expect(android.includes('restorePendingSharedPdfFromInbox()'), 'Cold start não restaura PDF pendente.');
expect(android.includes('intent.getClipData().getItemAt(0).getUri()'), 'Android não aceita URI recebida via ClipData.');
expect(android.includes('payload.put("shareId", pending.id)'), 'Payload nativo não envia shareId persistente.');
expect(android.includes('payload.put("byteLength", pending.file.length())'), 'Dispatch deve enviar apenas metadados do arquivo persistido.');
expect(android.includes('payload.put("transport", "android-private-inbox")'), 'Payload deve identificar o transporte privado e durável.');
expect(android.includes('readSharedPdfChunk'), 'Bridge Android deve expor leitura em blocos.');
expect(android.includes('SharedPdfInbox.readChunk(MainActivity.this, shareId'), 'Chunks devem sair diretamente do inbox persistente.');
expect(!android.includes('payload.put("dataBase64", pendingSharedPdfBase64)'), 'Dispatch compartilhado não deve injetar Base64 gigante no WebView.');
expect(android.includes('SharedPdfInbox.acknowledge(MainActivity.this, shareId)'), 'ACK deve remover o item do inbox persistente.');

expect(inbox.includes('context.getFilesDir()'), 'Inbox precisa usar armazenamento privado do app.');
expect(inbox.includes('KEY_CREATED_AT'), 'Inbox deve registrar idade do item pendente.');
expect(inbox.includes('MAX_PENDING_AGE_MS'), 'Inbox deve expirar handoffs abandonados.');
expect(inbox.includes("header[0] != '%'"), 'Inbox deve validar assinatura PDF antes de persistir.');
expect(inbox.includes('public static synchronized byte[] readChunk'), 'Inbox deve permitir leitura limitada em blocos.');
expect(inbox.includes('Math.min(requestedLength, 256 * 1024)'), 'Cada leitura deve ter limite rígido de tamanho.');
expect(inbox.includes('public static synchronized boolean acknowledge'), 'Inbox precisa de ACK explícito.');
expect(!inbox.includes('getExternalStorage'), 'Inbox não pode depender de armazenamento externo compartilhado.');

expect(manifest.includes('android:mimeType="application/pdf"'), 'Manifest perdeu suporte a application/pdf.');
expect(manifest.includes('android:mimeType="application/octet-stream"'), 'Manifest não aceita compartilhadores que enviam PDF como octet-stream.');
expect(chain.includes("await import('../v14368/apply.mjs');"), 'Hotfix legado deve continuar na preparação por compatibilidade.');

const durableImport = "await import('../p0-shared-pdf-durable/apply.mjs');";
const rosterWindowImport = "await import('../p0-673-order-independent-window/apply.mjs');";
const finalManualImport = "await import('../ci/sync-canonical-manual.mjs');";
const durableIndex = preparation.indexOf(durableImport);
const rosterWindowIndex = preparation.indexOf(rosterWindowImport);
const finalManualIndex = preparation.indexOf(finalManualImport);
expect(!buildIdentityFinalizer.includes(durableImport), 'Inbox durável não deve reescrever Home antes dos patchers canônicos de roster.');
expect(durableIndex >= 0, 'Preparação final deve reafirmar o inbox durável.');
expect(rosterWindowIndex >= 0 && durableIndex > rosterWindowIndex, 'Inbox durável deve materializar somente depois do P0 #673 preservar a janela canônica.');
expect(finalManualIndex >= 0 && durableIndex > finalManualIndex, 'Inbox durável deve ser o transform final, depois da materialização Android/manual.');
expect(preparation.indexOf(durableImport, durableIndex + 1) < 0, 'Inbox durável deve ser aplicado uma única vez na preparação final.');

console.log('[P0 share] OK — Android/PWA persistem o PDF até ACK real do importador canônico e só materializam após patchers canônicos.');
