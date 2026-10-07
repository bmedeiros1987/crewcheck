import fs from 'node:fs';
let source = fs.readFileSync('server/whatsapp.mjs', 'utf8');
const importLine = "import { commitWhatsAppPdf, downloadWhatsAppPdf, importWhatsAppPdf, whatsappPdfEnabled } from './concierge/whatsapp-pdf.mjs';\nimport { enqueuePdfJob, runPdfJobs } from './concierge/whatsapp-pdf-queue.mjs';";
if (!source.includes("from './concierge/whatsapp-pdf-queue.mjs'")) source = importLine + '\n' + source;
if (!source.includes('let whatsappPdfConfiguration')) {
  source = source.replace('let whatsappConciergeHandler = null;', `let whatsappConciergeHandler = null;
let whatsappPdfConfiguration = null;
let pdfQueueBusy = false;
let pdfQueueTimer = null;
export function configureWhatsAppPdf(configuration) {
  whatsappPdfConfiguration = configuration;
  if (whatsappPdfEnabled() && !pdfQueueTimer) {
    pdfQueueTimer = setInterval(() => { void drainWhatsAppPdfJobs(); }, 30000);
    pdfQueueTimer.unref();
  }
}
function decryptWhatsAppPdfPhone(value) {
  const key = phoneEncryptionKey(); if (!key) return '';
  try {
    const [iv, tag, encrypted] = String(value).split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return normalizePhone(Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8'));
  } catch { return ''; }
}
async function drainWhatsAppPdfJobs() {
  if (pdfQueueBusy || !whatsappPdfEnabled() || !whatsappPdfConfiguration) return;
  pdfQueueBusy = true;
  try {
    const pool = await whatsappPdfConfiguration.pool();
    await runPdfJobs(pool, {
      enabled: whatsappPdfEnabled, now: () => new Date(), receiver: phoneNumberId,
      decryptPhone: decryptWhatsAppPdfPhone, findLink: findActiveLinkByPhone,
      importPdf: message => importWhatsAppPdf(message, {
        receiver: phoneNumberId, findLink: findActiveLinkByPhone,
        download: (document, receiver) => downloadWhatsAppPdf(document, { token: accessToken(), receiver, version: graphVersion() }),
        commit: input => commitWhatsAppPdf(pool, input, { phoneHash: privateHash, receiver: phoneNumberId, buildSnapshot: whatsappPdfConfiguration.buildSnapshot }),
      }),
      confirm: (phone, id, receiver, result) => sendWhatsAppText(phone, result.ok
        ? 'Escala importada no Concierge. Consulte “escala”, “hoje”, “próxima programação” ou “diárias” por aqui.'
        : result.reason === 'stale_document'
          ? 'Uma escala mais recente foi preservada. Envie novamente o PDF se quiser substituí-la.'
          : 'Não consegui importar este PDF com segurança. Envie o arquivo oficial novamente, sem senha e com até 20 MB.',
        { replyToMessageId: id, expectedPhoneNumberId: receiver }),
    });
  } catch { console.warn('[crewcheck:whatsapp:pdf]', 'QUEUE_UNAVAILABLE'); }
  finally { pdfQueueBusy = false; }
}
async function enqueueWhatsAppPdfPayload(payload) {
  if (!whatsappPdfEnabled() || !whatsappPdfConfiguration) return false;
  if (!phoneNumberId()) return false;
  const documents = extractWhatsAppInboundMessages(payload).filter(message => message.type === 'document' && message.phoneNumberId === phoneNumberId() && message.document?.mime_type === 'application/pdf');
  if (!documents.length) return false;
  const pool = await whatsappPdfConfiguration.pool();
  for (const message of documents) await enqueuePdfJob(pool, message, { receiver: phoneNumberId, phoneHash: privateHash, encryptPhone, now: () => new Date() });
  return true;
}`);
  const guard = '  if (!expectedPhoneNumberId || message?.phoneNumberId !== expectedPhoneNumberId) return;';
  if (!source.includes(guard)) throw Error('PDF must be prepared after sender binding');
  source = source.replace(guard, `${guard}\n  if (whatsappPdfEnabled() && whatsappPdfConfiguration && message.type === 'document' && message.document?.mime_type === 'application/pdf') return;`);
  const eventAnchor = '  const acceptedMessageIds = new Set();';
  source = source.replace(eventAnchor, `  const pdfIds = new Set(whatsappPdfEnabled() && whatsappPdfConfiguration ? inbound.filter(message => message.type === 'document' && message.document?.mime_type === 'application/pdf').map(message => message.id) : []);
${eventAnchor}`);
  source = source.replace('  for (const event of events) {\n    if (!claimInMemory', "  for (const event of events) {\n    if (event.eventId.startsWith('message:') && pdfIds.has(event.eventId.slice(8))) continue;\n    if (!claimInMemory");
  const ack = '  sendJson(res, 200, { ok: true, queued: true });';
  source = source.replace(ack, `  try { await enqueueWhatsAppPdfPayload(payload); }
  catch { return sendJson(res, 503, { ok: false, message: 'Importação temporariamente indisponível. Tente novamente.' }); }
${ack}`);
  source = source.replace('    processWhatsAppPayload(payload, rawBody).catch', '    void drainWhatsAppPdfJobs();\n    processWhatsAppPayload(payload, rawBody).catch');
}
fs.writeFileSync('server/whatsapp.mjs', source);

let server = fs.readFileSync('server.mjs', 'utf8');
const runtimeImport = "import { readDurableSnapshot, writeDurableSnapshot, seedDurableSnapshot } from './server/concierge/whatsapp-pdf-queue.mjs';\nimport { whatsappPdfEnabled } from './server/concierge/whatsapp-pdf.mjs';";
if (!server.includes("from './server/concierge/whatsapp-pdf-queue.mjs'")) server = runtimeImport + '\n' + server;
server = server.replace("import { configureWhatsAppConcierge, handleWhatsAppRoute } from './server/whatsapp.mjs';", "import { configureWhatsAppConcierge, configureWhatsAppPdf, handleWhatsAppRoute } from './server/whatsapp.mjs';");
if (!server.includes('function buildCanonicalWhatsAppPdfSnapshot')) {
  const helper = `function buildCanonicalWhatsAppPdfSnapshot(previous, profile, roster, metadata = {}) {
  const key = conciergeSafeKey(profile.email);
  const nextRoster = roster ? conciergeMinimizeRoster(roster) : previous.roster || null;
  return { ...previous, ...metadata, key, email: key, durableWhatsAppPdf: true, name: profile.name || previous.name || '',
    chatId: String(profile.chatId || previous.chatId || ''), accessKeyHash: profile.accessKeyHash || previous.accessKeyHash || '',
    roster: nextRoster, diagnostics: nextRoster ? conciergeRosterDiagnostics(nextRoster) : previous.diagnostics || null,
    preferences: { ...(previous.preferences || {}), ...(metadata.preferences || {}) },
    rosterUpdatedAt: roster ? new Date().toISOString() : previous.rosterUpdatedAt || previous.updatedAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
}
`;
  server = server.replace('async function conciergeSaveSnapshotAsync(', helper + 'async function conciergeSaveSnapshotAsync(');
  const save = 'async function conciergeSaveSnapshotAsync(profile = {}, roster = null, metadata = {}) {';
  server = server.replace(save, `${save}
  if (whatsappPdfEnabled()) {
    const key = conciergeSafeKey(profile.email || (profile.chatId ? \`telegram:\${profile.chatId}\` : ''));
    if (!key) return null;
    await conciergeLoadSnapshot(profile);
    return writeDurableSnapshot(await conciergeDbPool(), key, previous => buildCanonicalWhatsAppPdfSnapshot(previous, { ...profile, email: key }, roster, metadata));
  }`);
  const load = 'async function conciergeLoadSnapshot(profile = {}) {';
  server = server.replace(load, `${load}
  if (whatsappPdfEnabled()) {
    const key = conciergeSafeKey(profile.email || (profile.chatId ? \`telegram:\${profile.chatId}\` : ''));
    if (!key) return null;
    const pool = await conciergeDbPool();
    const persisted = await readDurableSnapshot(pool, key);
    if (persisted?.durableWhatsAppPdf || persisted?.whatsappPdfImport) return persisted;
    const legacy = conciergeSnapshotForProfile(profile);
    if (!legacy || conciergeSafeKey(legacy.email) !== key || legacy.whatsappPdfImport || legacy.durableWhatsAppPdf) return persisted;
    return seedDurableSnapshot(pool, key, { ...buildCanonicalWhatsAppPdfSnapshot(legacy, { ...profile, email: key }, legacy.roster), durableWhatsAppPdf: false, updatedAt: legacy.updatedAt || '1970-01-01T00:00:00Z', rosterUpdatedAt: legacy.rosterUpdatedAt || legacy.updatedAt || '1970-01-01T00:00:00Z' });
  }`);
  const binding = `configureWhatsAppPdf({
  pool: conciergeDbPool,
  buildSnapshot: (previous, input) => buildCanonicalWhatsAppPdfSnapshot(previous, { email: input.link.email }, input.parsed.roster, {
    source: 'whatsapp-pdf', fileName: input.filename,
    whatsappPdfImport: { receivedAt: input.receivedAt, sentAt: input.sentAt, digest: input.mediaDigest },
  }),
});
`;
  server = server.replace('configureWhatsAppConcierge(async (', binding + 'configureWhatsAppConcierge(async (');
}
fs.writeFileSync('server.mjs', server);
console.log('[whatsapp-pdf] default-OFF durable queue, canonical parser and transactional snapshots prepared');
