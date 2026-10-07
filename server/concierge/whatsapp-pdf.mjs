import crypto from 'node:crypto';
import { Worker } from 'node:worker_threads';

export const MAX_WHATSAPP_PDF_BYTES = 20 * 1024 * 1024;
export const whatsappPdfEnabled = (environment = process.env) => environment.CREWCHECK_WHATSAPP_PDF_ENABLED === 'true';
const emailOf = link => String(link?.email || '').trim().toLowerCase();
const bindingOf = link => JSON.stringify([emailOf(link), String(link?.linked_at || '')]);
const active = link => Boolean(emailOf(link) && link.linked_at && !link.revoked_at && Number(link.consent_concierge) === 1);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = code => { const error = new Error(code); error.code = code; throw error; };
const filenameOf = value => String(value || 'escala-whatsapp.pdf').split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 160) || 'escala-whatsapp.pdf';

// Deliberately narrow. Do not accept user URLs, subdomain suffixes or redirects.
export function safeMediaUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'lookaside.fbsbx.com' || url.username || url.password || url.port || url.hash) fail('MEDIA_URL_REJECTED');
  return url.href;
}
async function boundedBody(response, limit) {
  if (!response.ok) fail('MEDIA_HTTP_ERROR');
  const length = response.headers.get('content-length');
  if (length != null && (!/^\d+$/.test(length) || Number(length) > limit)) fail('MEDIA_SIZE_REJECTED');
  if (!response.body || typeof response.body.getReader !== 'function') fail('MEDIA_BODY_REJECTED');
  const reader = response.body.getReader();
  let size = 0; const parts = [];
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) fail('MEDIA_SIZE_REJECTED');
      parts.push(Buffer.from(value));
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  return Buffer.concat(parts, size);
}
export async function downloadWhatsAppPdf(document, { token, receiver, version, fetchImpl = fetch }) {
  if (!/^\d{1,80}$/.test(String(document?.id || '')) || document?.mime_type !== 'application/pdf') fail('DOCUMENT_REJECTED');
  if (!token || !/^\d{1,80}$/.test(String(receiver)) || !/^v\d+\.\d+$/.test(String(version))) fail('MEDIA_CONFIGURATION_MISSING');
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
  const options = { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, redirect: 'error' };
  try {
    const endpoint = new URL(`https://graph.facebook.com/${version}/${document.id}`);
    endpoint.searchParams.set('phone_number_id', receiver);
    const response = await fetchImpl(endpoint.href, options);
    const metadataBytes = await boundedBody(response, 16384);
    const metadata = JSON.parse(metadataBytes.toString('utf8'));
    const size = Number(metadata.file_size);
    if (String(metadata.id) !== String(document.id) || metadata.mime_type !== 'application/pdf' || !Number.isSafeInteger(size) || size < 5 || size > MAX_WHATSAPP_PDF_BYTES) fail('MEDIA_METADATA_REJECTED');
    if (metadata.phone_number_id != null && String(metadata.phone_number_id) !== receiver) fail('MEDIA_RECEIVER_MISMATCH');
    const mediaResponse = await fetchImpl(safeMediaUrl(metadata.url), options);
    if (mediaResponse.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/pdf') fail('MEDIA_MIME_REJECTED');
    const bytes = await boundedBody(mediaResponse, MAX_WHATSAPP_PDF_BYTES);
    if (bytes.length !== size || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') fail('MEDIA_CONTENT_REJECTED');
    const digest = crypto.createHash('sha256').update(bytes).digest();
    if (typeof metadata.sha256 !== 'string' || ![digest.toString('hex'), digest.toString('base64')].includes(metadata.sha256)) fail('MEDIA_HASH_REJECTED');
    if (document.sha256 && ![digest.toString('hex'), digest.toString('base64')].includes(document.sha256)) fail('MEDIA_HASH_REJECTED');
    return { bytes, filename: filenameOf(document.filename), digest: digest.toString('hex') };
  } finally { clearTimeout(timeout); }
}

// Reuse the canonical parser in a terminable worker; never duplicate roster rules.
export function parseCanonicalWhatsAppPdf(input) {
  if (typeof input?.dataBase64 !== 'string' || input.dataBase64.length > Math.ceil(MAX_WHATSAPP_PDF_BYTES / 3) * 4) return Promise.reject(new Error('PARSER_INPUT_REJECTED'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./whatsapp-pdf-parser-worker.mjs', import.meta.url), {
      workerData: input, resourceLimits: { maxOldGenerationSizeMb: 192 }, stdout: true, stderr: true,
    });
    // Parser warnings can contain document fragments; drain them privately.
    worker.stdout.resume(); worker.stderr.resume();
    let finished = false;
    const complete = (error, result) => {
      if (finished) return; finished = true; clearTimeout(timeout);
      void worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    const timeout = setTimeout(() => complete(new Error('PARSER_TIMEOUT')), 15000);
    worker.once('message', payload => payload?.ok === true ? complete(null, payload.result) : complete(new Error('PARSER_FAILED')));
    worker.once('error', () => complete(new Error('PARSER_FAILED')));
    worker.once('exit', () => { if (!finished) complete(new Error('PARSER_FAILED')); });
  });
}

/** Dependency boundary permits synthetic tests and prevents fallback local writes. */
export async function importWhatsAppPdf(message, deps) {
  if (!whatsappPdfEnabled(deps.environment)) return { ok: false, reason: 'disabled' };
  const receiver = deps.receiver();
  if (!receiver || message?.phoneNumberId !== receiver || message?.type !== 'document' || !message.id || !/^\d{8,16}$/.test(String(message.from || ''))) return { ok: false, reason: 'invalid_envelope' };
  const link = await deps.findLink(message.from);
  if (!active(link)) return { ok: false, reason: 'not_authorized' };
  if (message.expectedBinding && bindingOf(link) !== message.expectedBinding) return { ok: false, reason: 'binding_changed' };
  if (typeof deps.commit !== 'function') return { ok: false, reason: 'import_not_configured' };
  const current = async () => {
    const linked = await deps.findLink(message.from);
    return receiver === deps.receiver() && active(linked) && bindingOf(linked) === bindingOf(link);
  };
  try {
    const media = await deps.download(message.document, receiver);
    if (!await current()) return { ok: false, reason: 'binding_changed' };
    const parsed = await (deps.parse || parseCanonicalWhatsAppPdf)({ filename: media.filename, dataBase64: media.bytes.toString('base64') });
    if (!parsed?.roster?.days?.length) return { ok: false, reason: 'roster_empty' };
    if (!await current()) return { ok: false, reason: 'binding_changed' };
    const key = `whatsapp-pdf:${hash(JSON.stringify([emailOf(link), receiver, String(message.id)]))}`;
    const committed = await deps.commit({ key, link, phone: message.from, receiver, mediaDigest: media.digest, parsed, filename: media.filename, receivedAt: message.receivedAt, sentAt: message.timestamp, current });
    return committed?.ok === true ? { ok: true, duplicate: Boolean(committed.duplicate) } : { ok: false, reason: 'commit_unconfirmed' };
  } catch (error) { return { ok: false, reason: error?.code === 'STALE_DOCUMENT' ? 'stale_document' : 'import_failed' }; }
}

/** Same InnoDB transaction for receipt + snapshot. No DDL, file or DB fallback. */
export async function commitWhatsAppPdf(pool, input, { phoneHash, buildSnapshot, receiver }) {
  if (!pool?.getConnection || typeof buildSnapshot !== 'function') fail('DURABLE_IMPORT_UNAVAILABLE');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [links] = await connection.query('SELECT email,linked_at,revoked_at,consent_concierge FROM crewcheck_whatsapp_links WHERE phone_hash=? FOR UPDATE', [phoneHash(input.phone)]);
    const linked = links[0];
    if (!active(linked) || bindingOf(linked) !== bindingOf(input.link) || receiver() !== input.receiver) fail('BINDING_CHANGED');
    const [claim] = await connection.query('INSERT IGNORE INTO crewcheck_telegram_state(state_key,payload) VALUES(?,?)', [input.key, JSON.stringify({ source: 'whatsapp-pdf', digest: input.mediaDigest, completed: true })]);
    if (!Number(claim.affectedRows)) { await connection.rollback(); return { ok: true, duplicate: true }; }
    const snapshotKey = `snapshot:${emailOf(linked)}`;
    await connection.query('INSERT IGNORE INTO crewcheck_telegram_state(state_key,payload) VALUES(?,?)', [snapshotKey, '{}']);
    const [rows] = await connection.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [snapshotKey]);
    const value = rows[0]?.payload; const previous = typeof value === 'string' ? JSON.parse(value) : value || {};
    const incomingAt = Date.parse(input.receivedAt || '');
    const previousAt = Date.parse(previous.source === 'whatsapp-pdf' ? previous.whatsappPdfImport?.receivedAt || previous.rosterUpdatedAt || previous.updatedAt || '' : previous.rosterUpdatedAt || previous.updatedAt || '');
    const providerTime = (value, receivedAt) => /^\d{10,11}$/.test(String(value || '')) && Number(value) * 1000 <= receivedAt + 60000 ? Number(value) * 1000 : NaN;
    const incomingProvider = providerTime(input.sentAt, incomingAt);
    const previousProvider = providerTime(previous.whatsappPdfImport?.sentAt, Date.parse(previous.whatsappPdfImport?.receivedAt || ''));
    const providerOrdered = previous.source === 'whatsapp-pdf' && Number.isFinite(incomingProvider) && Number.isFinite(previousProvider);
    if (providerOrdered ? previousProvider > incomingProvider || (previousProvider === incomingProvider && previousAt > incomingAt)
      : Number.isFinite(previousAt) && previousAt > (Number.isFinite(incomingProvider) ? incomingProvider : incomingAt)) fail('STALE_DOCUMENT');
    const snapshot = buildSnapshot(previous, input);
    if (!snapshot || snapshot.email !== emailOf(linked) || !snapshot.roster?.days?.length) fail('SNAPSHOT_REJECTED');
    if (receiver() !== input.receiver) fail('RECEIVER_CHANGED');
    await connection.query('INSERT INTO crewcheck_telegram_state(state_key,payload) VALUES(?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=CURRENT_TIMESTAMP(3)', [snapshotKey, JSON.stringify(snapshot)]);
    if (receiver() !== input.receiver) fail('RECEIVER_CHANGED');
    await connection.commit();
    return { ok: true, duplicate: false, snapshot };
  } catch (error) { await connection.rollback().catch(() => {}); throw error; }
  finally { connection.release(); }
}
