import * as testSendPolicy from '../server/concierge/whatsapp-test-send-policy.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { enqueuePdfJob, runPdfJobs, readDurableSnapshot, writeDurableSnapshot, seedDurableSnapshot } from '../server/concierge/whatsapp-pdf-queue.mjs';
import { importWhatsAppPdf, commitWhatsAppPdf } from '../server/concierge/whatsapp-pdf.mjs';
import { extractWhatsAppInboundMessages, extractWhatsAppEvents, extractWhatsAppStatusDiagnostics, verifyWhatsAppSignature } from '../server/whatsapp.mjs';
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const copy = value => structuredClone(value);
let state, link, now, failFinish, tail, queries, confirms, mediaCalls, parserCalls;
const active = { email: 'a@fixture.invalid', linked_at: '2026-10-07T13:00:00Z', consent_concierge: 1 };
const message = { timestamp: String(Date.parse('2026-10-07T13:01:00Z') / 1000), id: 'fixture-A', from: '5511000000001', phoneNumberId: '200', type: 'document', document: { id: '100', mime_type: 'application/pdf', filename: 'fictional.pdf' } };
const reset = () => { state = new Map(); link = copy(active); now = new Date('2026-10-07T13:01:00Z'); failFinish = false; tail = Promise.resolve(); queries = []; confirms = []; mediaCalls = 0; parserCalls = 0; };
reset();
function execute(target, sql, args = []) {
  queries.push(sql);
  if (sql.startsWith('SELECT email')) return [[copy(link)]];
  if (sql.startsWith('INSERT IGNORE')) { if (target.has(args[0])) return [{ affectedRows: 0 }]; target.set(args[0], parse(args[1])); return [{ affectedRows: 1 }]; }
  if (sql.startsWith('SELECT payload')) return [[...(target.has(args[0]) ? [{ payload: copy(target.get(args[0])) }] : [])]];
  if (sql.startsWith('SELECT state_key')) return [[...target].filter(([key, value]) => key.startsWith('whatsapp-pdf-job:') && ['queued','processing'].includes(value.stage)).map(([state_key, payload]) => ({ state_key, payload: copy(payload) }))];
  if (sql.startsWith('INSERT INTO')) { if (sql.endsWith('state_key=state_key') && target.has(args[0])) return [{ affectedRows: 0 }]; target.set(args[0], parse(args[1])); return [{ affectedRows: 1 }]; }
  if (sql.startsWith('UPDATE')) {
    const [next, key, expected] = args;
    if (expected != null && JSON.stringify(target.get(key)) !== JSON.stringify(parse(expected))) return [{ affectedRows: 0 }];
    if (failFinish && parse(next).stage === 'completed') { failFinish = false; throw Error('synthetic crash after import commit'); }
    target.set(key, parse(next)); return [{ affectedRows: 1 }];
  }
  throw Error('Unexpected SQL: ' + sql);
}
const pool = {
  async query(sql, args) { await tail; return execute(state, sql, args); },
  async getConnection() {
    let transaction, unlock;
    return {
      async beginTransaction() { const previous = tail; tail = new Promise(resolve => { unlock = resolve; }); await previous; transaction = copy(state); },
      async query(sql, args) { return execute(transaction, sql, args); },
      async commit() { state = transaction; unlock(); unlock = null; },
      async rollback() { if (unlock) unlock(); unlock = null; }, release() {},
    };
  },
};
const enqueueDeps = { receiver: () => '200', phoneHash: phone => 'hash:' + phone, encryptPhone: phone => 'encrypted:' + phone, now: () => now };
const options = () => ({ enabled: () => true, receiver: () => '200', now: () => now,
  decryptPhone: cipher => cipher.startsWith('encrypted:') ? cipher.slice(10) : '', findLink: async () => copy(link),
  confirm: async (...args) => confirms.push(args),
  importPdf: input => importWhatsAppPdf(input, { environment: { CREWCHECK_WHATSAPP_PDF_ENABLED: 'true' }, receiver: () => '200', findLink: async () => copy(link),
    download: async () => { mediaCalls++; return { bytes: Buffer.from('%PDF-fictional'), filename: 'fictional.pdf', digest: 'fixture-digest' }; },
    parse: async () => { parserCalls++; return { roster: { rawText: 'private raw fixture', days: [{ date: '2026-10-07', rawText: 'private raw day', legs: [] }] } }; },
    commit: input => commitWhatsAppPdf(pool, input, { receiver: () => '200', phoneHash: enqueueDeps.phoneHash, buildSnapshot: (previous, item) => ({ ...previous, email: item.link.email, source: 'whatsapp-pdf', roster: { ...item.parsed.roster, rawText: '', days: item.parsed.roster.days.map(day => ({ ...day, rawText: '' })) }, whatsappPdfImport: { receivedAt: item.receivedAt, sentAt: item.sentAt }, updatedAt: now.toISOString() }) }),
  }),
});
let enqueued = await enqueuePdfJob(pool, message, enqueueDeps);
assert.equal(enqueued.queued, true); assert.equal((await enqueuePdfJob(pool, message, enqueueDeps)).duplicate, true);
assert.equal(state.size, 1); assert.equal(state.get(enqueued.key).message.from, undefined);
await Promise.all([runPdfJobs(pool, options()), runPdfJobs(pool, options())]);
assert.equal(mediaCalls, 1); assert.equal(confirms.length, 1); assert.equal(state.get(enqueued.key).stage, 'completed');
assert.ok(!state.get(enqueued.key).phoneCipher && !state.get(enqueued.key).message);
assert.equal((await readDurableSnapshot(pool, active.email)).roster.rawText, '');
assert.equal((await enqueuePdfJob(pool, message, enqueueDeps)).duplicate, true); await runPdfJobs(pool, options()); assert.equal(confirms.length, 1);

// Failed attempt remains recoverable, with a durable deadline across a restart.
reset(); enqueued = await enqueuePdfJob(pool, message, enqueueDeps);
await runPdfJobs(pool, { ...options(), importPdf: async () => { throw Error('synthetic media timeout'); } });
assert.equal(state.get(enqueued.key).stage, 'queued'); assert.equal(state.get(enqueued.key).attempts, 1);
await runPdfJobs(pool, options()); assert.equal(mediaCalls, 0);
now = new Date(now.getTime() + 31000); await runPdfJobs(pool, options());
assert.equal(state.get(enqueued.key).stage, 'completed'); assert.equal(confirms.length, 1);

// Commit succeeded but finalization crashed. New worker recovers the expired lease
// and observes the durable receipt, preserving any newer scale and no second send.
reset(); enqueued = await enqueuePdfJob(pool, message, enqueueDeps); failFinish = true;
await assert.rejects(runPdfJobs(pool, options()), /synthetic crash/);
assert.equal(state.get(enqueued.key).stage, 'processing'); assert.equal(confirms.length, 0);
await writeDurableSnapshot(pool, active.email, previous => ({ ...previous, roster: { days: [{ date: '2026-11-01' }] } }));
now = new Date(now.getTime() + 91000); await runPdfJobs(pool, options());
assert.equal(state.get(enqueued.key).stage, 'completed'); assert.equal(confirms.length, 0);
assert.equal((await readDurableSnapshot(pool, active.email)).roster.days[0].date, '2026-11-01');

for (const timestamp of ['', String((now.getTime() - 24 * 60 * 60 * 1000) / 1000), String((now.getTime() + 24 * 60 * 60 * 1000) / 1000)]) {
  reset(); enqueued = await enqueuePdfJob(pool, { ...message, timestamp }, enqueueDeps);
  await runPdfJobs(pool, options()); assert.equal(state.get(enqueued.key).stage, 'completed'); assert.equal(confirms.length, 0, 'unknown/expired/future messaging window cannot trigger outbound');
}

// A newer successful PDF wins while an older job is waiting to retry.
reset(); const older = await enqueuePdfJob(pool, message, enqueueDeps);
await runPdfJobs(pool, { ...options(), importPdf: async () => ({ ok: false, reason: 'import_failed' }) });
now = new Date(now.getTime() + 1000); const newer = await enqueuePdfJob(pool, { ...message, id: 'fixture-B' }, enqueueDeps);
await runPdfJobs(pool, options()); assert.equal(state.get(newer.key).stage, 'completed');
now = new Date(now.getTime() + 31000); await runPdfJobs(pool, options());
assert.equal(state.get(older.key).reason, 'stale_document');
assert.equal((await readDurableSnapshot(pool, active.email)).whatsappPdfImport.receivedAt, '2026-10-07T13:01:01.000Z');

// An old provider message first seen later must not replace a newer PDF.
reset(); now = new Date(now.getTime() + 2000);
await enqueuePdfJob(pool, { ...message, id: 'provider-new', timestamp: String(now.getTime() / 1000) }, enqueueDeps);
await runPdfJobs(pool, options());
now = new Date(now.getTime() + 1000);
const delayed = await enqueuePdfJob(pool, { ...message, id: 'provider-old' }, enqueueDeps);
await runPdfJobs(pool, options()); assert.equal(state.get(delayed.key).reason, 'stale_document');

for (const change of [{ ...active, email: 'b@fixture.invalid' }, { ...active, consent_concierge: 0 }, { ...active, revoked_at: 'now' }, { ...active, linked_at: 'new' }]) {
  reset(); enqueued = await enqueuePdfJob(pool, message, enqueueDeps); link = change;
  await runPdfJobs(pool, options()); assert.equal(state.get(enqueued.key).reason, 'binding_changed'); assert.equal(mediaCalls, 0); assert.equal(confirms.length, 0);
}
reset(); enqueued = await enqueuePdfJob(pool, message, enqueueDeps);
const racing = options(), realImport = racing.importPdf;
racing.importPdf = input => { link = { ...active, email: 'b@fixture.invalid' }; return realImport(input); };
await runPdfJobs(pool, racing);
assert.equal(state.get(enqueued.key).reason, 'binding_changed'); assert.equal(mediaCalls, 0);
reset(); await assert.rejects(enqueuePdfJob(null, message, enqueueDeps), /PDF_QUEUE_UNAVAILABLE/);
assert.equal((await enqueuePdfJob(pool, { ...message, phoneNumberId: '201' }, enqueueDeps)).queued, false);
assert.equal((await enqueuePdfJob(pool, { ...message, document: { ...message.document, mime_type: 'text/html' } }, enqueueDeps)).queued, false);
assert.equal(state.size, 0);
const queryCount = queries.length; await runPdfJobs(pool, { ...options(), enabled: () => false }); assert.equal(queries.length, queryCount);

// Execute the actual generated signed notification path. Gate ON persists jobs
// before ACK; DB failure is retryable 503; invalid signature cannot enqueue.
const whatsapp = fs.readFileSync('server/whatsapp.mjs', 'utf8');
const runtime = whatsapp.slice(whatsapp.indexOf('let whatsappPdfConfiguration'), whatsapp.indexOf('\nfunction envAny('));
const notification = whatsapp.slice(whatsapp.indexOf('async function handleNotification('), whatsapp.indexOf('\nasync function handleLinkStart('));
let configuredEnabled = true, scheduled = [], acknowledgements = [], raw, poolUnavailable = false;
const context = vm.createContext({ ...testSendPolicy, console: { warn() {}, error() {} }, crypto, Buffer,
  whatsappPdfEnabled: () => configuredEnabled, enqueuePdfJob, runPdfJobs,
  extractWhatsAppInboundMessages, phoneNumberId: () => '200', privateHash: enqueueDeps.phoneHash, encryptPhone: enqueueDeps.encryptPhone,
  setInterval: () => ({ unref() {} }), phoneEncryptionKey: () => null,
  appSecret: () => 'synthetic-secret', verifyWhatsAppSignature, readRawBody: async () => raw,
  sendJson: (_res, status, payload) => acknowledgements.push({ status, payload, jobs: state.size }),
  setImmediate: fn => scheduled.push(fn), processWhatsAppPayload: async () => {},
});
vm.runInContext(runtime.replace('export ', '') + '\n' + notification, context);
context.configureWhatsAppPdf({ pool: async () => poolUnavailable ? null : pool, buildSnapshot: () => null });
const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '200' }, messages: [{ id: message.id, from: message.from, timestamp: message.timestamp, type: 'document', document: message.document }] } }] }] };
raw = Buffer.from(JSON.stringify(payload)); const signature = 'sha256=' + crypto.createHmac('sha256', 'synthetic-secret').update(raw).digest('hex');
reset(); await context.handleNotification({ headers: { 'x-hub-signature-256': signature } }, {});
assert.equal(acknowledgements.at(-1).status, 200); assert.equal(acknowledgements.at(-1).jobs, 1);
reset(); poolUnavailable = true; await context.handleNotification({ headers: { 'x-hub-signature-256': signature } }, {});
assert.equal(acknowledgements.at(-1).status, 503); assert.equal(state.size, 0);
poolUnavailable = false; await context.handleNotification({ headers: { 'x-hub-signature-256': 'bad' } }, {});
assert.equal(acknowledgements.at(-1).status, 401); assert.equal(state.size, 0);
const ordinary = copy(payload); ordinary.entry[0].changes[0].value.messages = [{ id: 'text-only', from: message.from, type: 'text', text: { body: 'hoje' } }];
const pdfRaw = raw; raw = Buffer.from(JSON.stringify(ordinary)); poolUnavailable = true;
const textSignature = 'sha256=' + crypto.createHmac('sha256', 'synthetic-secret').update(raw).digest('hex');
await context.handleNotification({ headers: { 'x-hub-signature-256': textSignature } }, {});
assert.equal(acknowledgements.at(-1).status, 200, 'PDF database failure must not change text-only webhook ACK');
poolUnavailable = false; raw = pdfRaw;
configuredEnabled = false; await context.handleNotification({ headers: { 'x-hub-signature-256': signature } }, {});
assert.equal(acknowledgements.at(-1).status, 200); assert.equal(state.size, 0);

const processSource = whatsapp.slice(whatsapp.indexOf('async function processWhatsAppPayload('), whatsapp.indexOf('function webhookHealth('));
let ordinaryClaims = 0, ordinaryDispatch = 0;
const processing = vm.createContext({ ...testSendPolicy, whatsappPdfEnabled: () => true, whatsappPdfConfiguration: {},
  extractWhatsAppInboundMessages, extractWhatsAppEvents, extractWhatsAppStatusDiagnostics,
  payloadHash: () => 'fixture-hash', claimInMemory: () => { ordinaryClaims++; return true; }, claimPersistentEvent: async () => true,
  handleInboundMessage: async () => { ordinaryDispatch++; }, console: { info() {}, warn() {} },
});
vm.runInContext(processSource, processing);
await processing.processWhatsAppPayload(payload, raw);
assert.equal(ordinaryClaims, 0); assert.equal(ordinaryDispatch, 0, 'PDF must not poison the ordinary pre-execution claim');

// Actual canonical helpers: ON ignores stale file cache, and preference/location
// writes preserve the imported roster using the same database transaction.
const server = fs.readFileSync('server.mjs', 'utf8');
const helper = server.slice(server.indexOf('function buildCanonicalWhatsAppPdfSnapshot('), server.indexOf('async function conciergeMergeChatSnapshot('));
let localCalls = 0;
const canonical = vm.createContext({ ...testSendPolicy, whatsappPdfEnabled: () => true, readDurableSnapshot, writeDurableSnapshot, seedDurableSnapshot,
  conciergeDbPool: async () => pool, conciergeSafeKey: value => String(value || '').trim().toLowerCase(),
  conciergeSnapshotForProfile: () => { localCalls++; return { roster: { days: [{ date: 'OLD-CACHE' }] } }; },
  conciergeSaveSnapshot: () => { localCalls++; throw Error('File fallback must not run in PDF mode'); },
});
const minimize = server.slice(server.indexOf('function conciergeMinimizeRoster('), server.indexOf('function conciergeSaveSnapshot('));
vm.runInContext(minimize + '\n' + helper, canonical);
reset(); state.set('snapshot:' + active.email, { email: active.email, durableWhatsAppPdf: true, roster: { days: [{ date: '2026-10-07' }] }, preferences: { preserved: true } });
assert.equal((await canonical.conciergeLoadSnapshot({ email: active.email })).roster.days[0].date, '2026-10-07');
const saved = await canonical.conciergeSaveSnapshotAsync({ email: active.email }, null, { preferences: { location: { latitude: -23, longitude: -46 } } });
assert.equal(saved.roster.days[0].date, '2026-10-07'); assert.equal(saved.preferences.preserved, true); assert.equal(localCalls, 0);
assert.equal((await readDurableSnapshot(pool, active.email)).preferences.location.latitude, -23);
// Only an owned legacy cache can seed a missing database snapshot, and it never
// overwrites one that already exists or turns DB errors into file fallback.
state = new Map();
canonical.conciergeSnapshotForProfile = () => ({ email: active.email, key: active.email, updatedAt: '2020-01-01T00:00:00Z', roster: { rawText: 'PRIVATE', days: [{ date: '2026-10-07', rawText: 'PRIVATE' }] }, preferences: { retained: true } });
let seeded = await canonical.conciergeLoadSnapshot({ email: active.email });
assert.equal(seeded.updatedAt, '2020-01-01T00:00:00Z'); assert.equal(seeded.roster.rawText, ''); assert.equal(seeded.preferences.retained, true);
state.set('snapshot:' + active.email, { email: active.email, durableWhatsAppPdf: true, roster: { days: [{ date: 'NEWER-DB' }] } });
assert.equal((await canonical.conciergeLoadSnapshot({ email: active.email })).roster.days[0].date, 'NEWER-DB');
state.set('snapshot:' + active.email, { email: active.email, updatedAt: '2019-01-01T00:00:00Z', roster: { days: [{ date: 'OLDER-LEGACY-DB' }] } });
assert.equal((await canonical.conciergeLoadSnapshot({ email: active.email })).roster.days[0].date, '2026-10-07');
assert.equal((await readDurableSnapshot(pool, active.email)).durableWhatsAppPdf, true);
state = new Map(); canonical.conciergeSnapshotForProfile = () => ({ email: 'b@fixture.invalid', roster: { days: [{ date: 'OTHER-ACCOUNT' }] } });
assert.equal(await canonical.conciergeLoadSnapshot({ email: active.email }), null); assert.equal(state.size, 0);
canonical.conciergeDbPool = async () => null;
await assert.rejects(canonical.conciergeLoadSnapshot({ email: active.email }), /PDF_SNAPSHOT_DB_UNAVAILABLE/);
await assert.rejects(canonical.conciergeSaveSnapshotAsync({ email: active.email }, null, {}), /PDF_SNAPSHOT_DB_UNAVAILABLE/);
console.log('PASS actual signed webhook/gates/durable-before-ACK; retries and lease recovery; concurrent dedup; binding/sender/stale-job safety; receipt survives crash; canonical DB/cache and preference preservation; all fictional, no real APIs');
