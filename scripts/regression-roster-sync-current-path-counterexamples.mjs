// Counterexamples on the CURRENT roster read/write path, end to end, before any fix.
// Real prepared client (databaseClient.ts) on two isolated synthetic devices -> real prepared
// /api/rosters handler (server/platform.mjs) -> disposable MySQL over a UNIX socket. Only the
// session gate and the pool are replaced (requireMain, readBody); every roster SQL statement,
// summary mapping, local-history rule and display-window selection is the shipped code.
// Synthetic accounts and rosters only; no network, no provider, no credentials.
// Each assertion pins today's behaviour and is labelled with the invariant it breaks, so a fix
// has to flip it consciously. The last block shows why a content-fingerprint CAS without a
// schema change cannot restore those invariants (ABA, delete/recreate, replay after uncertain ACK).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import mysql from 'mysql2/promise';
import { mysqlAdapter } from '../server/mysql-platform-adapter.mjs';
import { moduleClosure } from './lib/qa-module-closure.mjs';

const socketPath = '/tmp/crewcheck-notification-qa-socket/mysqld.sock';
assert.equal(process.env.CREWCHECK_ROSTER_SYNC_QA, 'isolated-mysql', 'disposable MySQL only');
assert(fs.statSync(socketPath).isSocket());
assert.match(fs.readFileSync('server/platform.mjs', 'utf8'), /async function syncRosterForContext/, 'run after node scripts/v139/apply.mjs (prepared sources)');
assert.match(fs.readFileSync('client/src/lib/databaseClient.ts', 'utf8'), /export async function openRosterDisplayWindow/, 'run after node scripts/v139/apply.mjs (prepared sources)');
globalThis.fetch = () => { throw new Error('External network forbidden'); };

const native = mysql.createPool({ socketPath, user: 'root', password: '', database: 'crewcheck_roster_revision_qa', connectionLimit: 8, dateStrings: true, decimalNumbers: true });
const db = mysqlAdapter(native);
assert.equal((await db.query('SELECT DATABASE() AS name')).rows[0].name, 'crewcheck_roster_revision_qa');
const migration = fs.readFileSync('migrations/20260715_003_aiven_mysql_full_platform.sql', 'utf8');
for (const table of ['crewcheck_platform_stays', 'crewcheck_platform_hotel_rules', 'crewcheck_platform_rosters', 'crewcheck_platform_profiles']) {
  await db.query(`DROP TABLE IF EXISTS ${table}`);
}
for (const table of ['crewcheck_platform_profiles', 'crewcheck_platform_rosters', 'crewcheck_platform_hotel_rules', 'crewcheck_platform_stays']) {
  await db.query(migration.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\) ENGINE=InnoDB[^;]*;`))[0]);
}
const accounts = { 'qa-token-account-a': 'qa-account-a@example.test', 'qa-token-account-b': 'qa-account-b@example.test' };
for (const email of Object.values(accounts)) await db.query('INSERT INTO crewcheck_platform_profiles(email,public_id,display_name) VALUES($1,$2,$3)', [email, email.split('@')[0], 'Tripulante sintético']);

// Real /api/rosters handler; only the session gate and body reader are replaced.
const server = await moduleClosure('server/platform.mjs', ['handleLegacyDatabase', 'rosterFingerprint', 'sanitizeRoster'], {
  readBody: async req => req.body,
  requireMain: async (req, res) => {
    const email = accounts[String(req.headers.authorization || '').replace(/^Bearer /, '')];
    if (!email) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, code: 'AUTH_REQUIRED' })); return null; }
    return { identity: { email, authenticated: true }, db, profile: { email } };
  },
});
async function serve(url, init = {}) {
  const parsed = new URL(url, 'https://qa.invalid');
  const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
  const req = { method: String(init.method || 'GET').toUpperCase(), headers, body: init.body ? JSON.parse(init.body) : {} };
  const res = { status: 200, body: '', setHeader() {}, writeHead(status) { this.status = status; }, end(body) { this.body = String(body || ''); } };
  await server.handleLegacyDatabase(req, res, parsed);
  return new Response(res.body || '{}', { status: res.status, headers: { 'content-type': 'application/json' } });
}

// Real prepared client, one isolated instance per device (own storage, clock and session).
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-sync-current-'));
await build({ entryPoints: ['client/src/lib/databaseClient.ts'], bundle: true, format: 'iife', globalName: 'CrewCheckDatabaseClient', platform: 'browser', outfile: path.join(dir, 'client.js'), logLevel: 'silent', alias: { '@': path.resolve('client/src') }, define: { 'import.meta.env': '{}' } });
const clientCode = fs.readFileSync(path.join(dir, 'client.js'), 'utf8');
function storage() {
  const map = new Map();
  return { getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), clear: () => map.clear(), key: index => [...map.keys()][index] ?? null, get length() { return map.size; } };
}
function device({ token, user, skewMs = 0, online = true }) {
  const local = storage(), session = storage(), RealDate = Date;
  class DeviceDate extends RealDate { constructor(...args) { if (args.length) super(...args); else super(RealDate.now() + skewMs); } static now() { return RealDate.now() + skewMs; } }
  const window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, location: { origin: 'https://qa.invalid', href: 'https://qa.invalid/app' }, navigator: { onLine: online } };
  if (token) { local.setItem('crewcheck_auth_token', token); local.setItem('crewcheck_auth_user', JSON.stringify(user)); }
  const state = { online };
  const fetchImpl = (url, init) => (state.online ? serve(url, init) : Promise.reject(new TypeError('offline')));
  const api = new Function('window', 'localStorage', 'sessionStorage', 'fetch', 'Date', 'CustomEvent', 'navigator', `${clientCode};return CrewCheckDatabaseClient;`)(
    window, local, session, fetchImpl, DeviceDate, class { constructor(type, init) { this.type = type; this.detail = init?.detail; } }, window.navigator);
  return { api, local, state };
}

// Synthetic October (revision A: reserve on 23/10; B: shortened reserve + two flights) and November.
const pad = value => String(value).padStart(2, '0');
const leg = (flightNumber, departureTime, arrivalTime) => ({ flightNumber, origin: 'AAA', destination: 'BBB', departureTime, arrivalTime, aircraftType: 'A320' });
function month(year, monthNumber, changes = {}) {
  const length = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(), days = [];
  for (let day = 1; day <= length; day += 1) days.push({ date: `${pad(day)}/${pad(monthNumber)}/${year}`, ...(changes[day] || { type: 'DO', pairingCode: 'DO', isDayOff: true, legs: [] }) });
  return { crewId: 'BP00000001', crewName: 'TRIPULANTE SINTETICO', base: 'BSB', year, month: monthNumber, days };
}
const octoberA = month(2026, 10, { 23: { type: 'RES', pairingCode: 'RES', dutyReport: '06:00', dutyDebrief: '18:00', legs: [] } });
const octoberB = month(2026, 10, { 23: { type: 'RES', pairingCode: 'RES', dutyReport: '06:00', dutyDebrief: '09:00', legs: [leg('LA9101', '10:00', '12:00'), leg('LA9102', '13:00', '15:00')] } });
const octoberC = month(2026, 10, { 23: { type: 'FLIGHT', pairingCode: 'P23', dutyReport: '07:00', dutyDebrief: '15:00', legs: [leg('LA9201', '08:00', '10:00')] } });
const november = month(2026, 11, { 2: { type: 'FLIGHT', pairingCode: 'P02', dutyReport: '07:00', dutyDebrief: '15:00', legs: [leg('LA9301', '08:00', '10:00')] } });
const payload = roster => ({ roster: JSON.parse(JSON.stringify(roster)), compliance: { score: 0, alerts: [] }, gym: [], sourceFileName: 'sintetico.pdf' });
const fp = roster => server.rosterFingerprint(server.sanitizeRoster(JSON.parse(JSON.stringify(roster))));
const row = async (email, key) => (await db.query('SELECT id,roster_key,fingerprint,created_at,updated_at FROM crewcheck_platform_rosters WHERE owner_email=$1 AND roster_key=$2', [email, key])).rows[0] || null;
const octoberDay23Legs = roster => (roster.days.find(day => day.date === '23/10/2026')?.legs || []).length;
const passed = [];
const run = async (name, fn) => { await fn(); passed.push(name); };
const accountA = accounts['qa-token-account-a'];
const userA = { id: 'qa-account-a', email: accountA }, userB = { id: 'qa-account-b', email: accounts['qa-token-account-b'] };

await run('stale local revision on another device wins the display window (createdAt, client clock)', async () => {
  const phone = device({ token: 'qa-token-account-a', user: userA });
  const tablet = device({ token: 'qa-token-account-a', user: userA, skewMs: 2 * 86400_000 });
  await phone.api.saveRosterAnalysis(payload(octoberA));
  await tablet.api.saveRosterAnalysis(payload(octoberA));
  await phone.api.saveRosterAnalysis(payload(octoberB));
  assert.equal((await row(accountA, '2026-10')).fingerprint, fp(octoberB), 'database holds revision B');
  const accountRow = await row(accountA, '2026-10');
  assert.match(accountRow.created_at, /^\d{4}-\d{2}-\d{2} \d{2}:/, 'account summaries carry the DB datetime string (first import)');
  await tablet.api.saveRosterAnalysis(payload(november));
  const tabletWindow = await tablet.api.openRosterDisplayWindow(JSON.parse(JSON.stringify(november)));
  assert.equal(octoberDay23Legs(tabletWindow), 0, 'CURRENT (defect): the tablet shows its local revision A, not revision B from the database');
  await phone.api.saveRosterAnalysis(payload(november));
  const phoneWindow = await phone.api.openRosterDisplayWindow(JSON.parse(JSON.stringify(november)));
  assert.equal(octoberDay23Legs(phoneWindow), 2, 'the device that imported B shows B');
  // Clock skew decides it: the same tablet with its clock behind the database shows B.
  const lateTablet = device({ token: 'qa-token-account-a', user: userA, skewMs: -2 * 86400_000 });
  await lateTablet.api.saveRosterAnalysis(payload(octoberA));
  await phone.api.saveRosterAnalysis(payload(octoberB));
  await lateTablet.api.saveRosterAnalysis(payload(november));
  assert.equal(octoberDay23Legs(await lateTablet.api.openRosterDisplayWindow(JSON.parse(JSON.stringify(november)))), 2, 'CURRENT (defect): the winner depends on the device clock');
});

await run('legacy/stale replay overwrites a newer revision blindly', async () => {
  const phone = device({ token: 'qa-token-account-a', user: userA });
  const tablet = device({ token: 'qa-token-account-a', user: userA });
  await phone.api.saveRosterAnalysis(payload(octoberB));
  await tablet.api.saveRosterAnalysis(payload(octoberA));
  assert.equal((await row(accountA, '2026-10')).fingerprint, fp(octoberA), 'CURRENT (defect): a re-save of the stale revision silently replaces B; no precondition, no conflict');
});

await run('deleted competence is resurrected by a stale re-save', async () => {
  const phone = device({ token: 'qa-token-account-a', user: userA });
  const tablet = device({ token: 'qa-token-account-a', user: userA });
  const saved = await phone.api.saveRosterAnalysis(payload(octoberB));
  await tablet.api.saveRosterAnalysis(payload(octoberB));
  assert.equal(await phone.api.deleteRosterAnalysis(saved.id, octoberB), true);
  assert.equal(await row(accountA, '2026-10'), null, 'deleted in the database (hard delete, no tombstone)');
  await tablet.api.saveRosterAnalysis(payload(octoberA));
  assert.equal((await row(accountA, '2026-10'))?.fingerprint, fp(octoberA), 'CURRENT (defect): the deletion is undone by a device that never saw it');
});

await run('two concurrent imports of the same base: both acknowledged, one silently lost', async () => {
  await db.query('DELETE FROM crewcheck_platform_rosters WHERE owner_email=$1', [accountA]);
  const phone = device({ token: 'qa-token-account-a', user: userA });
  const tablet = device({ token: 'qa-token-account-a', user: userA });
  await phone.api.saveRosterAnalysis(payload(octoberA));
  const results = await Promise.all([phone.api.saveRosterAnalysis(payload(octoberB)), tablet.api.saveRosterAnalysis(payload(octoberC))]);
  assert.equal(results.every(summary => summary && summary.storageProvider === 'database'), true, 'both writers are told the account saved their revision');
  const final = (await row(accountA, '2026-10')).fingerprint;
  assert.equal([fp(octoberB), fp(octoberC)].includes(final), true);
  assert.equal(results.filter(summary => summary.checksum === final).length, 1, 'CURRENT (defect): exactly one acknowledged revision survives; the other is lost without a conflict');
});

await run('offline import is kept only on the device and never retried', async () => {
  await db.query('DELETE FROM crewcheck_platform_rosters WHERE owner_email=$1', [accountA]);
  const phone = device({ token: 'qa-token-account-a', user: userA, online: false });
  const summary = await phone.api.saveRosterAnalysis(payload(octoberB));
  assert.equal(summary.storageProvider === 'database', false, 'offline save returns the local summary');
  phone.state.online = true;
  await phone.api.listSavedRosters(72);
  assert.equal(await row(accountA, '2026-10'), null, 'CURRENT (gap): reconnecting does not upload the pending offline import (no queue, no pending marker)');
});

await run('account switch: local history is scoped to the signed-in account', async () => {
  const shared = device({ token: 'qa-token-account-a', user: userA });
  await shared.api.saveRosterAnalysis(payload(octoberB));
  shared.local.setItem('crewcheck_auth_token', 'qa-token-account-b');
  shared.local.setItem('crewcheck_auth_user', JSON.stringify(userB));
  const visible = await shared.api.listSavedRosters(72);
  assert.equal(visible.some(item => item.month === 10 && item.year === 2026), false, 'account B does not see account A\'s local or database rosters');
});

// Checksum families (clarifies the earlier report, which read the raw sources):
//  - offlineSync.checksumRoster, prepared by v14.3.72: SHA-256 over {year,month,crewId,days} of the
//    roster as the client holds it — content based, described as compatible with the server — but
//    the server hashes AFTER sanitizeRoster (rawText blanked, legs capped), so the two differ for
//    the same revision; and saveRosterOfflineFirst has no caller in the shipped client;
//  - prepared local history: FNV-1a over the same shape, client side;
//  - server rosterFingerprint: SHA-256 after sanitizeRoster.
// None of them pairs a local copy with its database row, so listSavedRosters keeps both and the
// display window falls back to createdAt. No functional collision is claimed: there is no live
// path where two revisions share a checksum.
await run('checksum families are distinct; offline-first checksum is not on a live path', async () => {
  await build({ entryPoints: ['client/src/lib/offlineSync.ts'], bundle: true, format: 'esm', platform: 'neutral', outfile: path.join(dir, 'offline.mjs'), logLevel: 'silent', alias: { '@': path.resolve('client/src') }, define: { 'import.meta.env': '{}' } });
  globalThis.localStorage = storage();
  const offline = await import(path.join(dir, 'offline.mjs'));
  assert.notEqual(await offline.checksumRoster(payload(octoberA)), await offline.checksumRoster(payload(octoberB)), 'prepared offline-first checksum is per revision');
  assert.notEqual(await offline.checksumRoster(payload(octoberB)), fp(octoberB), 'but it is not the server fingerprint of the same revision (server hashes after sanitizeRoster)');
  assert.notEqual(fp(octoberA), fp(octoberB), 'server fingerprint is per content');
  const callers = [];
  const walk = folder => { for (const entry of fs.readdirSync(folder, { withFileTypes: true })) { const full = path.join(folder, entry.name); if (entry.isDirectory()) walk(full); else if (/\.(ts|tsx)$/.test(entry.name) && !full.endsWith('offlineSync.ts') && fs.readFileSync(full, 'utf8').includes('saveRosterOfflineFirst')) callers.push(full); } };
  walk('client/src');
  assert.deepEqual(callers, [], 'saveRosterOfflineFirst is not called by the shipped client');
  const phone = device({ token: 'qa-token-account-a', user: userA });
  await db.query('DELETE FROM crewcheck_platform_rosters WHERE owner_email=$1', [accountA]);
  await phone.api.saveRosterAnalysis(payload(octoberB));
  const october = (await phone.api.listSavedRosters(72)).filter(item => item.year === 2026 && item.month === 10);
  assert.equal(october.length, 2, 'the same revision appears twice (database + local) because the checksums differ');
  assert.notEqual(october[0].checksum, october[1].checksum);
});

// Why a content-fingerprint CAS (no schema) is not enough. The rule under test is the rejected
// design: "accept a write when the stored fingerprint equals the client's base fingerprint".
await run('content fingerprint is not a generation: ABA, delete/recreate and replay are accepted', async () => {
  const fingerprintCas = (stored, base) => stored === base;
  // ABA: A -> B -> A on the database while an offline device edited from A.
  const history = [fp(octoberA), fp(octoberB), fp(octoberA)];
  assert.equal(fingerprintCas(history.at(-1), fp(octoberA)), true, 'stale edit based on generation 1 is accepted over generation 3 (two intervening revisions ignored)');
  // Delete then recreate with identical content: the pre-delete base matches again.
  assert.equal(fingerprintCas(fp(octoberA), fp(octoberA)), true, 'a write based on the deleted generation is accepted after recreation');
  // Replay after an uncertain ACK: the original write C landed, then C -> D -> C happened elsewhere.
  // "Same hash, so already applied" cannot tell the replay from a new revision; neither can it
  // carry the activation side effect safely.
  const generations = [{ hash: fp(octoberC), generation: 2 }, { hash: fp(octoberB), generation: 3 }, { hash: fp(octoberC), generation: 4 }];
  assert.equal(generations[0].hash === generations[2].hash && generations[0].generation !== generations[2].generation, true);
});

await native.end();
console.log(`PASS current roster path counterexamples (${passed.length}): ${passed.join('; ')}`);
