// Proposal check (not runtime): monotonic per-competence generation + stable identity, on a
// disposable MySQL with docs/proposals/roster-revision-sync/schema-draft.sql, the reference server
// protocol and the pure device reconciliation. Synthetic accounts/rosters only; no network.
// Scenarios: offline→online, distinct months, two devices importing on the same base, latency race
// and lost ACK, reimport of the same content, ABA, tombstone (no resurrection), legacy client
// without revision token (no blind overwrite), identity (crewId, account switch), incomplete PDF,
// planned vs operated, clock skew, operation id reuse and duplicated send.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import { mysqlAdapter } from '../server/mysql-platform-adapter.mjs';
import { writeRosterRevision, listRosterCompetences, readCurrentRoster, rosterContentHash, crewKeyFor } from '../docs/proposals/roster-revision-sync/server-protocol.mjs';
import { entryKey, entriesForAccount, newEntry, recordLocalChange, beginSend, planReconcile, adoptServer, applySendResult, resolveConflict } from '../docs/proposals/roster-revision-sync/client-reconcile.mjs';

// Only a disposable UNIX socket: no DATABASE_URL, TCP, provider or credentials.
const socketPath = String(process.env.CREWCHECK_QA_MYSQL_SOCKET || '');
assert.equal(process.env.CREWCHECK_ROSTER_SYNC_QA, 'isolated-mysql', 'disposable MySQL only');
assert.match(socketPath, /^\/tmp\/[\w.-]+\/mysqld\.sock$/);
assert(fs.statSync(socketPath).isSocket());
globalThis.fetch = () => { throw new Error('External network forbidden'); };
const native = mysql.createPool({ socketPath, user: 'root', password: '', database: 'crewcheck_roster_revision_qa', connectionLimit: 8, dateStrings: true });
const db = mysqlAdapter(native);
assert.equal((await db.query('SELECT DATABASE() AS name')).rows[0].name, 'crewcheck_roster_revision_qa');
const schema = fs.readFileSync('docs/proposals/roster-revision-sync/schema-draft.sql', 'utf8');
assert.match(schema, /^-- PROPOSTA — NÃO APLICAR/);
assert.equal(fs.readdirSync('migrations').some(name => fs.readFileSync(`migrations/${name}`, 'utf8').includes('crewcheck_roster_competences')), false, 'the draft is not a migration');

async function resetSchema() {
  await db.query('DROP TABLE IF EXISTS crewcheck_roster_revisions');
  await db.query('DROP TABLE IF EXISTS crewcheck_roster_competences');
  for (const statement of schema.split(/;\s*\n/).map(text => text.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) await db.query(statement);
}

// Synthetic rosters: complete months; changes per civil day.
const pad = value => String(value).padStart(2, '0');
function month(year, monthNumber, changes = {}, crewId = 'BP00000001') {
  const length = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(), days = [];
  for (let day = 1; day <= length; day += 1) days.push({ date: `${pad(day)}/${pad(monthNumber)}/${year}`, ...(changes[day] || { type: 'DO', legs: [] }) });
  return { crewId, crewName: 'TRIPULANTE SINTETICO', year, month: monthNumber, days };
}
const flight = code => ({ type: 'FLIGHT', legs: [{ flightNumber: code, origin: 'AAA', destination: 'BBB', departureTime: '08:00', arrivalTime: '10:00' }] });
const reserve = { type: 'RES', dutyReport: '06:00', dutyDebrief: '18:00', legs: [] };
const crewKey = crewKeyFor('BP00000001');
const ids = (accountId, rosterKey, rosterKind = 'operated') => ({ accountId, crewKey, rosterKey, rosterKind });
const counts = async () => (await db.query('SELECT COUNT(*) AS n FROM crewcheck_roster_revisions')).rows[0].n;
const current = async (email, rosterKey, rosterKind = 'operated') => readCurrentRoster(db, email, { crewKey, rosterKey, rosterKind });

// Authoritative account→crew binding is a precondition the proposal does not implement; tests
// inject a synthetic one. The PDF's printed crewId alone never proves identity.
const accountA = 'qa-account-a@example.test', accountB = 'qa-account-b@example.test';
const bindings = { [accountA]: 'ID:BP00000001', [accountB]: 'ID:BP00000002' };
const write = request => writeRosterRevision(db, request, { resolveVerifiedCrewKey: async email => bindings[email] || null });

// A device: its own store, account session and connectivity. sync() is the reconnect pass.
function device(name, accountId, email) {
  return { name, accountId, email, online: true, store: { entries: {} }, view: {}, loseNextAck: false };
}
function changeLocally(dev, rosterKey, roster, { rosterKind = 'operated', operation = 'import' } = {}) {
  dev.store = recordLocalChange(dev.store, ids(dev.accountId, rosterKey, rosterKind), { operation, roster, contentHash: roster ? rosterContentHash(roster) : null, operationId: crypto.randomUUID() });
}
async function send(dev, entry, request) {
  assert.equal(entry.accountId, dev.accountId, 'a device never sends another account\'s change');
  const result = await write({ email: dev.email, crewKey: entry.crewKey, rosterKey: entry.rosterKey, rosterKind: entry.rosterKind, operation: request.operation, baseGeneration: request.baseGeneration, operationId: request.operationId, roster: request.roster, parserVersion: 'qa-synthetic' });
  if (dev.loseNextAck) { dev.loseNextAck = false; return { status: 0 }; }
  return result;
}
async function sync(dev) {
  const listing = dev.online ? await listRosterCompetences(db, dev.email) : null;
  const server = new Map((listing?.competences || []).map(item => [entryKey({ accountId: dev.accountId, ...item }), item]));
  const keys = new Set([...entriesForAccount(dev.store, dev.accountId).map(entryKey), ...server.keys()]);
  for (const key of keys) {
    const listed = server.get(key) || null;
    let entry = dev.store.entries[key] || newEntry({ accountId: dev.accountId, crewKey: listed.crewKey, rosterKey: listed.rosterKey, rosterKind: listed.rosterKind });
    let plan = planReconcile(entry, listed, { online: Boolean(listing), listingComplete: Boolean(listing?.complete) });
    if (plan.action === 'send') {
      const started = beginSend(entry);
      entry = started.entry;
      if (started.request) {
        const result = await send(dev, entry, started.request);
        entry = applySendResult(entry, started.request, result);
        if (!result.status) { dev.store.entries[key] = entry; dev.view[key] = entry.inflight.roster; continue; }
        const fresh = (await listRosterCompetences(db, dev.email)).competences.find(item => entryKey({ accountId: dev.accountId, ...item }) === key) || null;
        plan = planReconcile(entry, fresh, { online: true, listingComplete: true });
        if (plan.action === 'adopt_server') { const now = await current(dev.email, entry.rosterKey, entry.rosterKind); entry = adoptServer(entry, now, now.roster); }
      }
    } else if (plan.action === 'adopt_server') {
      const now = await current(dev.email, entry.rosterKey, entry.rosterKind);
      entry = adoptServer(entry, now, now.roster);
    }
    dev.store.entries[key] = entry;
    dev.view[key] = plan.display === 'pending' ? (entry.pending || entry.inflight || entry.conflict?.pending)?.roster ?? null
      : plan.display === 'synced' ? entry.synced?.roster ?? null
      : plan.display === 'server' ? (await current(dev.email, entry.rosterKey, entry.rosterKind)).roster
      : null;
  }
}
const shown = (dev, rosterKey, rosterKind = 'operated') => dev.view[entryKey(ids(dev.accountId, rosterKey, rosterKind))] ?? null;
const sameRoster = (a, b) => a && b && rosterContentHash(a) === rosterContentHash(b);
const entryOf = (dev, rosterKey, rosterKind = 'operated') => dev.store.entries[entryKey(ids(dev.accountId, rosterKey, rosterKind))];

const passed = [];
const run = async (name, fn) => { await resetSchema(); await fn(); passed.push(name); };

// Synthetic revisions.
const octA = month(2026, 10, { 23: reserve }), octB = month(2026, 10, { 23: flight('LA9101') }), octC = month(2026, 10, { 23: flight('LA9201') }), octD = month(2026, 10, { 23: flight('LA9301') });
const novN = month(2026, 11, { 2: flight('LA9401') }), novN2 = month(2026, 11, { 2: flight('LA9402') }), decZ = month(2026, 12, { 5: flight('LA9501') });

await run('offline→online, distinct months: offline edits shown from the device, uploaded on reconnect, months independent', async () => {
  const phone = device('phone', 'A', accountA);
  changeLocally(phone, '2026-10', octA); await sync(phone);
  assert.equal((await current(accountA, '2026-10')).generation, 1);
  phone.online = false;
  changeLocally(phone, '2026-10', octB); changeLocally(phone, '2026-11', novN); await sync(phone);
  assert(sameRoster(shown(phone, '2026-10'), octB) && sameRoster(shown(phone, '2026-11'), novN), 'offline: device cache, pending edits visible');
  assert.equal((await current(accountA, '2026-10')).generation, 1, 'nothing reached the database while offline');
  phone.online = true; await sync(phone);
  assert.deepEqual([(await current(accountA, '2026-10')).generation, (await current(accountA, '2026-11')).generation], [2, 1], 'one generation per accepted write, per month');
  assert(sameRoster(shown(phone, '2026-10'), octB) && sameRoster(shown(phone, '2026-11'), novN), 'online: database');
  assert.equal(entryOf(phone, '2026-10').pending, undefined);
});

await run('two devices import on the same base at once: one accepted, the other an explicit conflict, nothing lost', async () => {
  const phone = device('phone', 'A', accountA), tablet = device('tablet', 'A', accountA);
  changeLocally(phone, '2026-10', octA); await sync(phone); await sync(tablet);
  changeLocally(phone, '2026-10', octB); changeLocally(tablet, '2026-10', octC);
  await Promise.all([sync(phone), sync(tablet)]);
  const now = await current(accountA, '2026-10');
  assert.equal(now.generation, 2, 'exactly one write accepted');
  const [winner, loser] = sameRoster(now.roster, octB) ? [phone, tablet] : [tablet, phone];
  assert(entryOf(loser, '2026-10').conflict, 'the other import becomes an explicit conflict');
  assert(sameRoster(entryOf(loser, '2026-10').conflict.pending.roster, sameRoster(now.roster, octB) ? octC : octB), 'and its content is kept');
  assert(sameRoster(shown(loser, '2026-10'), now.roster), 'online the database is shown while the conflict waits for a choice');
  loser.store.entries[entryKey(ids('A', '2026-10'))] = resolveConflict(entryOf(loser, '2026-10'), 'keep_local', { operationId: crypto.randomUUID() });
  await sync(loser); await sync(winner);
  assert.equal((await current(accountA, '2026-10')).generation, 3);
  assert(sameRoster(shown(winner, '2026-10'), shown(loser, '2026-10')), 'both devices converge on the chosen revision');
});

await run('lost ACK and latency race: the retry is a replay, never a second write over a newer revision', async () => {
  const phone = device('phone', 'A', accountA), tablet = device('tablet', 'A', accountA);
  changeLocally(phone, '2026-10', octA); await sync(phone); await sync(tablet);
  changeLocally(phone, '2026-10', octB); const sentId = entryOf(phone, '2026-10').pending.operationId; phone.loseNextAck = true; await sync(phone);
  assert.equal(entryOf(phone, '2026-10').inflight?.operationId, sentId, 'no response: the sent snapshot stays in flight with the same operation id');
  assert.equal((await current(accountA, '2026-10')).generation, 2, 'but the database did commit it');
  await sync(tablet); changeLocally(tablet, '2026-10', octC); await sync(tablet);
  assert.equal((await current(accountA, '2026-10')).generation, 3);
  const before = await counts();
  await sync(phone);
  assert.equal(await counts(), before, 'the retry wrote nothing');
  assert(sameRoster((await current(accountA, '2026-10')).roster, octC), 'the newer revision from the tablet survives');
  assert(sameRoster(shown(phone, '2026-10'), octC), 'the phone adopts it after its replay is confirmed');
});

await run('reimport of the same content: no new generation; a stale base with the same hash is not a write authorisation', async () => {
  const phone = device('phone', 'A', accountA), stale = device('stale', 'A', accountA);
  changeLocally(phone, '2026-10', octA); await sync(phone); await sync(stale);
  changeLocally(phone, '2026-10', octB); await sync(phone);
  changeLocally(phone, '2026-10', octB); await sync(phone);
  assert.equal((await current(accountA, '2026-10')).generation, 2, 'same content on the current base is a no-op');
  const before = await counts();
  const direct = await write({ email: accountA, crewKey, rosterKey: '2026-10', baseGeneration: 1, operationId: crypto.randomUUID(), roster: octB });
  assert.equal(direct.status, 409, 'same hash with an old base is a conflict at the server');
  changeLocally(stale, '2026-10', octB); await sync(stale);
  assert.equal(await counts(), before, 'the device resolves "already equal" by adopting the database, without writing');
  assert.equal(entryOf(stale, '2026-10').conflict, undefined);
});

await run('ABA: A→B→A on the database does not let an edit based on the first A through', async () => {
  const phone = device('phone', 'A', accountA), stale = device('stale', 'A', accountA);
  changeLocally(phone, '2026-11', novN); await sync(phone); await sync(stale);
  changeLocally(phone, '2026-11', novN2); await sync(phone);
  changeLocally(phone, '2026-11', novN); await sync(phone);
  const now = await current(accountA, '2026-11');
  assert.equal(now.generation, 3); assert.equal(now.contentHash, rosterContentHash(novN), 'content is back to A');
  stale.online = false; changeLocally(stale, '2026-11', month(2026, 11, { 9: flight('LA9999') })); stale.online = true; await sync(stale);
  assert(entryOf(stale, '2026-11').conflict, 'generation 1 ≠ 3: explicit conflict even though the hash matches the base content');
  assert.equal((await current(accountA, '2026-11')).generation, 3);
});

await run('tombstone: deletion advances the generation; a device that never saw it cannot resurrect the month', async () => {
  const phone = device('phone', 'A', accountA), tablet = device('tablet', 'A', accountA);
  changeLocally(phone, '2026-10', octA); await sync(phone); await sync(tablet);
  changeLocally(phone, '2026-10', null, { operation: 'delete' }); await sync(phone);
  assert.deepEqual([(await current(accountA, '2026-10')).generation, (await current(accountA, '2026-10')).state], [2, 'deleted']);
  tablet.online = false; changeLocally(tablet, '2026-10', octB); tablet.online = true; await sync(tablet);
  assert(entryOf(tablet, '2026-10').conflict, 'edit based on the pre-delete generation: conflict, not resurrection');
  assert.equal(shown(tablet, '2026-10'), null, 'online the database says deleted');
  const legacy = await write({ email: accountA, crewKey, rosterKey: '2026-10', roster: octA });
  assert.equal(legacy.status, 428, 'a legacy client cannot resurrect it either');
  tablet.store.entries[entryKey(ids('A', '2026-10'))] = resolveConflict(entryOf(tablet, '2026-10'), 'keep_local', { operationId: crypto.randomUUID() });
  await sync(tablet);
  assert.deepEqual([(await current(accountA, '2026-10')).generation, (await current(accountA, '2026-10')).state], [3, 'live'], 'recreation only after an explicit choice on the tombstone generation');
  const reader = device('reader', 'A', accountA); await sync(reader);
  assert(sameRoster(shown(reader, '2026-10'), octB));
});

await run('legacy client without revision token: creates an absent month only; never overwrites; retry is idempotent', async () => {
  const phone = device('phone', 'A', accountA);
  changeLocally(phone, '2026-10', octA); await sync(phone);
  const overwrite = await write({ email: accountA, crewKey, rosterKey: '2026-10', roster: octD });
  assert.equal(overwrite.status, 428); assert(sameRoster((await current(accountA, '2026-10')).roster, octA), 'no blind overwrite');
  const create = await write({ email: accountA, crewKey, rosterKey: '2026-12', roster: decZ });
  assert.equal(create.status, 200); assert.equal(create.generation, 1);
  const retry = await write({ email: accountA, crewKey, rosterKey: '2026-12', roster: decZ });
  assert.equal(retry.status, 200); assert.equal(retry.replay, true, 'deterministic legacy operation id: replay, not a second write');
  assert.equal((await current(accountA, '2026-12')).generation, 1);
});

await run('identity: crewId required and matching, never the name; accounts isolated; account switch keeps pending changes in their account', async () => {
  const unnamed = { ...octA, crewId: '' };
  assert.equal((await write({ email: accountA, crewKey, rosterKey: '2026-10', baseGeneration: 0, operationId: crypto.randomUUID(), roster: unnamed })).code, 'CREW_IDENTITY_REQUIRED');
  assert.equal((await write({ email: accountA, crewKey, rosterKey: '2026-10', baseGeneration: 0, operationId: crypto.randomUUID(), roster: { ...octA, crewId: 'BP00000002' } })).code, 'CREW_IDENTITY_MISMATCH');
  assert.equal(crewKeyFor('000000'), null, 'placeholder ids are not identities');
  assert.equal((await writeRosterRevision(db, { email: accountA, crewKey, rosterKey: '2026-10', baseGeneration: 0, operationId: crypto.randomUUID(), roster: octA })).code, 'CREW_IDENTITY_UNVERIFIED', 'without the authoritative binding nothing is written, whatever the PDF says');
  assert.equal((await writeRosterRevision(db, { email: 'unbound@example.test', crewKey, rosterKey: '2026-10', baseGeneration: 0, operationId: crypto.randomUUID(), roster: octA }, { resolveVerifiedCrewKey: async () => null })).code, 'CREW_IDENTITY_UNVERIFIED');
  assert.equal((await write({ email: accountB, crewKey, rosterKey: '2026-10', baseGeneration: 0, operationId: crypto.randomUUID(), roster: octA })).code, 'CREW_IDENTITY_NOT_BOUND', 'a textual crewId of another crew member is refused for account B');
  const shared = device('shared', 'A', accountA);
  shared.online = false; changeLocally(shared, '2026-10', octB);
  // Logout + login as account B on the same device.
  Object.assign(shared, { accountId: 'B', email: accountB, online: true }); await sync(shared);
  assert.equal((await current(accountB, '2026-10')).generation, 0, 'account A\'s pending change is never sent as account B');
  assert.equal((await current(accountA, '2026-10')).generation, 0);
  assert.equal(entriesForAccount(shared.store, 'B').length, 0);
  Object.assign(shared, { accountId: 'A', email: accountA }); await sync(shared);
  assert(sameRoster((await current(accountA, '2026-10')).roster, octB), 'back on account A the pending change is delivered');
  assert.equal((await listRosterCompetences(db, accountB)).competences.length, 0, 'account B sees nothing of account A');
});

await run('incomplete PDF is refused before any write; the valid revision stays', async () => {
  const phone = device('phone', 'A', accountA);
  changeLocally(phone, '2026-10', octA); await sync(phone);
  const incomplete = { ...octB, days: octB.days.filter(day => day.date !== '15/10/2026') };
  const result = await write({ email: accountA, crewKey, rosterKey: '2026-10', baseGeneration: 1, operationId: crypto.randomUUID(), roster: incomplete });
  assert.equal(result.code, 'ROSTER_INCOMPLETE');
  changeLocally(phone, '2026-10', incomplete); await sync(phone);
  assert.equal(entryOf(phone, '2026-10').conflict.rejected, 'ROSTER_INCOMPLETE', 'kept on the device as a rejected change, visible, not silently dropped');
  assert(sameRoster((await current(accountA, '2026-10')).roster, octA) && (await current(accountA, '2026-10')).generation === 1);
});

await run('planned and operated revisions of the same month are independent', async () => {
  const phone = device('phone', 'A', accountA);
  changeLocally(phone, '2026-10', octA, { rosterKind: 'planned' }); changeLocally(phone, '2026-10', octB); await sync(phone);
  changeLocally(phone, '2026-10', octC); await sync(phone);
  assert(sameRoster((await current(accountA, '2026-10', 'planned')).roster, octA), 'planned unchanged');
  assert.deepEqual([(await current(accountA, '2026-10', 'planned')).generation, (await current(accountA, '2026-10')).generation], [1, 2]);
});

await run('metadata-only revision (base, rank) is a new generation; operation id binds parser, schema and source', async () => {
  const phone = device('phone', 'A', accountA);
  changeLocally(phone, '2026-10', { ...octA, base: 'GRU', rank: 'CC' }); await sync(phone);
  changeLocally(phone, '2026-10', { ...octA, base: 'BSB', rank: 'CC' }); await sync(phone);
  changeLocally(phone, '2026-10', { ...octA, base: 'BSB', rank: 'CMS' }); await sync(phone);
  const now = await current(accountA, '2026-10');
  assert.deepEqual([now.generation, now.roster.base, now.roster.rank], [3, 'BSB', 'CMS'], 'base and rank changes are revisions, never "unchanged"');
  const operationId = crypto.randomUUID();
  assert.equal((await write({ email: accountA, crewKey, rosterKey: '2026-10', baseGeneration: 3, operationId, roster: octB, parserVersion: 'parser-1' })).status, 200);
  assert.equal((await write({ email: accountA, crewKey, rosterKey: '2026-10', baseGeneration: 3, operationId, roster: octB, parserVersion: 'parser-2' })).code, 'OPERATION_ID_REUSED', 'same operation id with another parser version is not a replay');
  assert.equal((await write({ email: accountA, crewKey, rosterKey: '2026-10', baseGeneration: 3, operationId, roster: octB, parserVersion: 'parser-1', sourceKind: 'telegram' })).code, 'OPERATION_ID_REUSED', 'nor with another source');
  assert.equal((await write({ email: accountA, crewKey, rosterKey: '2026-10', baseGeneration: 3, operationId, roster: octB, parserVersion: 'parser-1' })).replay, true);
});

await run('clock skew: the same race gives the same result with device clocks in 1999 and 2099', async () => {
  const RealDate = globalThis.Date, outcomes = [];
  try {
    for (const offset of [-27 * 365 * 86400_000, 73 * 365 * 86400_000]) {
      await resetSchema();
      globalThis.Date = class extends RealDate { constructor(...args) { if (args.length) super(...args); else super(RealDate.now() + offset); } static now() { return RealDate.now() + offset; } };
      const phone = device('phone', 'A', accountA), tablet = device('tablet', 'A', accountA);
      changeLocally(phone, '2026-10', octA); await sync(phone); await sync(tablet);
      changeLocally(tablet, '2026-10', octC); await sync(tablet);
      changeLocally(phone, '2026-10', octB); await sync(phone);
      outcomes.push([(await current(accountA, '2026-10')).generation, rosterContentHash((await current(accountA, '2026-10')).roster), Boolean(entryOf(phone, '2026-10').conflict)]);
    }
  } finally { globalThis.Date = RealDate; }
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.deepEqual(outcomes[0].slice(0, 1).concat(outcomes[0][2]), [2, true], 'first accepted write wins; the later stale one is a conflict, whatever the clocks say');
  for (const file of ['client-reconcile.mjs', 'server-protocol.mjs']) {
    const code = fs.readFileSync(`docs/proposals/roster-revision-sync/${file}`, 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /Date\.now|new Date\(\)|performance\.now|createdAt|created_at|updated_at/, `${file}: ordering never reads a clock`);
  }
});

await run('operation id reuse with other content is refused; a duplicated send commits once', async () => {
  const operationId = crypto.randomUUID();
  const sends = await Promise.all([1, 2].map(() => write({ email: accountA, crewKey, rosterKey: '2026-10', baseGeneration: 0, operationId, roster: octA })));
  assert.deepEqual(sends.map(result => result.status), [200, 200]);
  assert.equal(sends.filter(result => result.replay).length, 1, 'second copy is a replay');
  assert.equal((await current(accountA, '2026-10')).generation, 1);
  assert.equal((await write({ email: accountA, crewKey, rosterKey: '2026-10', baseGeneration: 1, operationId, roster: octB })).code, 'OPERATION_ID_REUSED');
});

await resetSchema();
await native.end();
console.log(`PASS roster revision sync proposal (${passed.length}): ${passed.join('; ')}`);
