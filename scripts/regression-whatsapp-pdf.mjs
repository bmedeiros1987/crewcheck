import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { downloadWhatsAppPdf, importWhatsAppPdf, commitWhatsAppPdf, whatsappPdfEnabled, MAX_WHATSAPP_PDF_BYTES } from '../server/concierge/whatsapp-pdf.mjs';

const source = fs.readFileSync('server/whatsapp.mjs', 'utf8');
const extractor = source.slice(source.indexOf('export function extractWhatsAppInboundMessages('), source.indexOf('function claimInMemory('));
const extraction = vm.createContext({ normalizePhone: value => String(value).replace(/\D/g, '') });
vm.runInContext(extractor.replace('export ', ''), extraction);
const extracted = extraction.extractWhatsAppInboundMessages({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '200' }, messages: [{ id: 'message', from: '5511000000001', type: 'document', document: { id: '100', mime_type: 'application/pdf', filename: 'escala.pdf', sha256: 'synthetic', url: 'https://evil.invalid' } }] } }] }] });
assert.equal(extracted[0].document.id, '100');
assert.equal(extracted[0].document.mime_type, 'application/pdf');
assert.equal(extracted[0].phoneNumberId, '200');
assert.ok(!Object.hasOwn(extracted[0].document, 'url'), 'never retain webhook/user download URLs');

const bytes = Buffer.from('%PDF-1.7\nsynthetic fixture only\n%%EOF');
const sha = crypto.createHash('sha256').update(bytes).digest('hex');
const metadata = { id: '100', mime_type: 'application/pdf', file_size: bytes.length, sha256: sha, url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/test' };
const doc = { id: '100', mime_type: 'application/pdf', filename: '../../escala.pdf' };
const response = (body, type = 'application/json', options) => new Response(body, { headers: { 'content-type': type }, ...options });
let requests = [];
const download = (meta = metadata, media = bytes, contentType = 'application/pdf') => downloadWhatsAppPdf(doc, {
  token: 'synthetic-token', receiver: '200', version: 'v26.0',
  fetchImpl: async (url, options) => { requests.push({ url, options }); return url.startsWith('https://graph.facebook.com/') ? response(JSON.stringify(meta)) : response(media, contentType); },
});
for (const value of [undefined, '', 'TRUE', true, '1', ' true ', 'false']) assert.equal(whatsappPdfEnabled({ CREWCHECK_WHATSAPP_PDF_ENABLED: value }), false);
assert.equal(whatsappPdfEnabled({ CREWCHECK_WHATSAPP_PDF_ENABLED: 'true' }), true);
const media = await download();
assert.deepEqual(media.bytes, bytes); assert.equal(media.filename, 'escala.pdf');
assert.match(requests[0].url, /\/100\?phone_number_id=200$/);
assert.ok(requests.every(item => item.options.redirect === 'error'));
assert.ok(requests.every(item => item.options.signal instanceof AbortSignal));
for (const override of [
  { id: '101' }, { mime_type: 'text/html' }, { file_size: MAX_WHATSAPP_PDF_BYTES + 1 }, { file_size: 0 }, { file_size: 4.5 }, { sha256: 'wrong' }, { phone_number_id: '201' },
  ...['http://lookaside.fbsbx.com/x', 'https://lookaside.fbsbx.com.evil.invalid/x', 'https://user:pass@lookaside.fbsbx.com/x', 'https://127.0.0.1/x', 'https://lookaside.fbsbx.com:8443/x'].map(url => ({ url })),
]) { requests = []; await assert.rejects(download({ ...metadata, ...override })); }
await assert.rejects(download(metadata, Buffer.alloc(bytes.length), 'application/pdf'), /MEDIA_CONTENT_REJECTED/);
await assert.rejects(download(metadata, bytes, 'text/html'), /MEDIA_MIME_REJECTED/);
await assert.rejects(download({ ...metadata, file_size: bytes.length + 1 }), /MEDIA_CONTENT_REJECTED/);
// Even absent/misleading content-length cannot bypass streamed byte limits.
await assert.rejects(download(metadata, Buffer.alloc(MAX_WHATSAPP_PDF_BYTES + 1)), /MEDIA_SIZE_REJECTED/);
let cancelled = false;
await assert.rejects(downloadWhatsAppPdf(doc, { token: 'test', receiver: '200', version: 'v26.0', fetchImpl: async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(Buffer.alloc(16385)); }, cancel() { cancelled = true; } });
  return response(stream);
} }), /MEDIA_SIZE_REJECTED/);
assert.equal(cancelled, true);
requests = []; await assert.rejects(downloadWhatsAppPdf({ ...doc, id: 'https://evil.invalid' }, { fetchImpl: async () => { requests.push('unsafe'); } })); assert.equal(requests.length, 0);

const link = { email: 'a@fixture.invalid', linked_at: '2026-10-07T00:00:00Z', consent_concierge: 1 };
const envelope = { id: 'fixture-message', from: '5511000000001', phoneNumberId: '200', type: 'document', document: doc };
let currentLink, currentReceiver, parserCalls, commitCalls, downloadCalls;
const reset = () => { currentLink = structuredClone(link); currentReceiver = '200'; parserCalls = []; commitCalls = []; downloadCalls = []; };
const deps = () => ({ environment: { CREWCHECK_WHATSAPP_PDF_ENABLED: 'true' }, receiver: () => currentReceiver,
  findLink: async () => currentLink && structuredClone(currentLink), download: async document => { downloadCalls.push(document); return media; },
  parse: async input => { parserCalls.push(input); return { roster: { days: [{ date: '2026-10-07' }] } }; },
  commit: async input => { commitCalls.push(input); return { ok: true }; },
});
reset(); assert.deepEqual(await importWhatsAppPdf(envelope, deps()), { ok: true, duplicate: false });
assert.equal(parserCalls[0].dataBase64, bytes.toString('base64'));
assert.equal(commitCalls[0].link.email, link.email); assert.match(commitCalls[0].key, /^whatsapp-pdf:[a-f0-9]{64}$/);
assert.doesNotMatch(commitCalls[0].key, /fixture|5511|200/);
const keyA = commitCalls[0].key;
reset(); currentLink.email = 'b@fixture.invalid'; await importWhatsAppPdf(envelope, deps()); assert.notEqual(commitCalls[0].key, keyA);
for (const mutation of [() => { currentLink = null; }, () => { currentLink.consent_concierge = 0; }, () => { currentLink.revoked_at = 'now'; }, () => { currentLink.linked_at = 'new'; }, () => { currentLink.email = 'other@fixture.invalid'; }, () => { currentReceiver = '201'; }]) {
  for (const phase of ['download', 'parse']) {
    reset(); const options = deps(); const original = options[phase]; options[phase] = async (...args) => { const result = await original(...args); mutation(); return result; };
    assert.equal((await importWhatsAppPdf(envelope, options)).reason, 'binding_changed'); assert.equal(commitCalls.length, 0);
  }
}
for (const override of [{ phoneNumberId: '201' }, { id: '' }, { from: 'bad' }, { type: 'text' }]) {
  reset(); assert.equal((await importWhatsAppPdf({ ...envelope, ...override }, deps())).reason, 'invalid_envelope'); assert.equal(downloadCalls.length, 0);
}
reset(); currentLink = null; assert.equal((await importWhatsAppPdf(envelope, deps())).reason, 'not_authorized'); assert.equal(downloadCalls.length, 0);
reset(); assert.equal((await importWhatsAppPdf(envelope, { ...deps(), environment: {} })).reason, 'disabled'); assert.equal(downloadCalls.length, 0);
reset(); assert.equal((await importWhatsAppPdf(envelope, { ...deps(), commit: null })).reason, 'import_not_configured'); assert.equal(downloadCalls.length, 0);
reset(); assert.equal((await importWhatsAppPdf(envelope, { ...deps(), parse: async () => ({ roster: { days: [] } }) })).reason, 'roster_empty'); assert.equal(commitCalls.length, 0);
reset(); assert.equal((await importWhatsAppPdf(envelope, { ...deps(), commit: async () => ({ ok: false }) })).reason, 'commit_unconfirmed');
reset(); assert.equal((await importWhatsAppPdf(envelope, { ...deps(), parse: async () => { throw Error('PRIVATE PARSER DETAILS'); } })).reason, 'import_failed');

// Transaction fixture: state survives new connection/process instances, rollback
// removes both receipt and snapshot, and concurrent duplicate calls serialize.
let state = new Map(), savedLink = structuredClone(link), failure = '', queue = Promise.resolve(), releases = 0;
const pool = { getConnection: async () => {
  let staged, unlock;
  return {
    async beginTransaction() { const previous = queue; queue = new Promise(resolve => { unlock = resolve; }); await previous; staged = structuredClone(state); },
    async query(sql, args) {
      if (sql.startsWith('SELECT email')) return [[structuredClone(savedLink)]];
      if (sql.startsWith('INSERT IGNORE')) { if (staged.has(args[0])) return [{ affectedRows: 0 }]; staged.set(args[0], args[1]); return [{ affectedRows: 1 }]; }
      if (sql.startsWith('SELECT payload')) return [[...(staged.has(args[0]) ? [{ payload: staged.get(args[0]) }] : [])]];
      if (sql.startsWith('INSERT INTO')) { if (failure === 'snapshot') throw Error('synthetic write failure'); staged.set(args[0], args[1]); return [{ affectedRows: 1 }]; }
      throw Error('Unexpected fixture SQL');
    },
    async commit() { if (failure === 'commit') throw Error('synthetic commit failure'); state = staged; unlock(); unlock = null; },
    async rollback() { if (unlock) unlock(); unlock = null; }, release() { releases++; },
  };
} };
const input = { key: keyA, link, phone: envelope.from, receiver: '200', mediaDigest: sha, parsed: { roster: { days: [{ date: '2026-10-07' }] } } };
const storeOptions = { phoneHash: value => crypto.createHash('sha256').update(value).digest('hex'), receiver: () => '200', buildSnapshot: (previous, item) => ({ ...previous, email: item.link.email, roster: item.parsed.roster, source: 'whatsapp-pdf' }) };
const result = await Promise.all([commitWhatsAppPdf(pool, input, storeOptions), commitWhatsAppPdf(pool, input, storeOptions)]);
assert.deepEqual(result.map(item => item.duplicate), [false, true]); assert.equal(state.size, 2); assert.equal(releases, 2);
const snapshotKey = `snapshot:${link.email}`;
state.set(snapshotKey, JSON.stringify({ email: link.email, roster: { days: [{ date: '2026-11-01' }] } }));
assert.equal((await commitWhatsAppPdf(pool, input, storeOptions)).duplicate, true);
assert.equal(JSON.parse(state.get(snapshotKey)).roster.days[0].date, '2026-11-01', 'duplicate must not reactivate an older scale');
for (const mode of ['snapshot', 'commit']) {
  state = new Map(); failure = mode; await assert.rejects(commitWhatsAppPdf(pool, input, storeOptions)); assert.equal(state.size, 0);
  failure = ''; assert.equal((await commitWhatsAppPdf(pool, input, storeOptions)).duplicate, false); assert.equal(state.size, 2);
}
for (const changed of [{ ...link, email: 'b@fixture.invalid' }, { ...link, revoked_at: 'now' }, { ...link, consent_concierge: 0 }, { ...link, linked_at: 'new' }]) {
  state = new Map(); savedLink = changed; await assert.rejects(commitWhatsAppPdf(pool, input, storeOptions), /BINDING_CHANGED/); assert.equal(state.size, 0);
}
savedLink = structuredClone(link); state = new Map();
await assert.rejects(commitWhatsAppPdf(null, input, storeOptions), /DURABLE_IMPORT_UNAVAILABLE/);
await assert.rejects(commitWhatsAppPdf(pool, input, { ...storeOptions, receiver: () => '201' }), /BINDING_CHANGED/);
assert.equal(state.size, 0);
console.log('PASS PDF gate/auth/receiver/media allowlist/MIME/size/stream/hash/parser; account/relink isolation; atomic durable receipt+snapshot, rollback/retry/concurrent duplicate and newer-scale preservation; all synthetic, no external calls');
