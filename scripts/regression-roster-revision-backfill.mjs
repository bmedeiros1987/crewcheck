// Proposal check (not runtime): additive, idempotent backfill rehearsal from the legacy roster table
// into per-competence generations, on a disposable MySQL. Synthetic legacy rows and SYNTHETIC account
// bindings only (the authoritative binding source does not exist yet); no network.
//  - rows without an authoritative binding, with a missing or different crewId, or refused content
//    go to quarantine (never keyed by name);
//  - otherwise the competence is created only if absent (CAS on generation 0, deterministic id per
//    legacy row); generation > 0 (live) and tombstones are never overwritten or resurrected;
//  - crash at any point (between rows or before COMMIT) is resumed by running again: identical end
//    state, nothing duplicated; two workers and concurrent client writes keep every invariant.
// Mutants reintroducing each defect must fail by assertion.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import { mysqlAdapter } from '../server/mysql-platform-adapter.mjs';

// Only a disposable UNIX socket: no DATABASE_URL, TCP, provider or credentials.
const socketPath = String(process.env.CREWCHECK_QA_MYSQL_SOCKET || '');
assert.equal(process.env.CREWCHECK_ROSTER_SYNC_QA, 'isolated-mysql', 'disposable MySQL only');
assert.match(socketPath, /^\/tmp\/[\w.-]+\/mysqld\.sock$/);
assert(fs.statSync(socketPath).isSocket());
globalThis.fetch = () => { throw new Error('External network forbidden'); };
const native = mysql.createPool({ socketPath, user: 'root', password: '', database: 'crewcheck_roster_revision_qa', connectionLimit: 12, dateStrings: true });
const db = mysqlAdapter(native);
assert.equal((await db.query('SELECT DATABASE() AS name')).rows[0].name, 'crewcheck_roster_revision_qa');
const protocolFile = 'docs/proposals/roster-revision-sync/server-protocol.mjs';
const schema = fs.readFileSync('docs/proposals/roster-revision-sync/schema-draft.sql', 'utf8');
const legacyDdl = fs.readFileSync('migrations/20260715_003_aiven_mysql_full_platform.sql', 'utf8').match(/CREATE TABLE IF NOT EXISTS crewcheck_platform_rosters \([\s\S]*?\) ENGINE=InnoDB[^;]*;/)[0];
const NEW_TABLES = ['crewcheck_roster_backfill_quarantine', 'crewcheck_roster_legacy_submissions', 'crewcheck_roster_operation_receipts', 'crewcheck_roster_revisions', 'crewcheck_roster_competences'];

const pad = value => String(value).padStart(2, '0');
function month(year, monthNumber, tag, crewId = 'BP00000001', skip = null) {
  const length = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(), days = [];
  for (let day = 1; day <= length; day += 1) if (day !== skip) days.push({ date: `${pad(day)}/${pad(monthNumber)}/${year}`, type: day === 9 ? 'FLIGHT' : 'DO', legs: day === 9 ? [{ flightNumber: tag }] : [] });
  return { crewId, crewName: 'TRIPULANTE SINTETICO', base: 'GRU', rank: 'CC', year, month: monthNumber, days };
}
const A = 'qa-backfill-a@example.test', B = 'qa-backfill-b@example.test', Cc = 'qa-backfill-c@example.test';
// Synthetic authoritative bindings: account B has none on purpose.
const bindings = { [A]: 'ID:BP00000001', [Cc]: 'ID:BP00000003' };
const binding = { resolveVerifiedCrewKey: async who => bindings[who] || null };
const legacyRows = [
  { id: 'row-a-01', owner: A, key: '2027-01', roster: month(2027, 1, 'LA0101') },
  { id: 'row-a-02', owner: A, key: '2027-02', roster: month(2027, 2, 'LA0202') },
  { id: 'row-a-03', owner: A, key: '2027-03', roster: month(2027, 3, 'LA0303', 'BP00000001', 15) },
  { id: 'row-a-04', owner: A, key: '2027-04', roster: month(2027, 4, 'LA0404', 'BP00000009') },
  { id: 'row-a-06', owner: A, key: '2027-06', roster: month(2027, 6, 'LA0606') },
  { id: 'row-a-07', owner: A, key: '2027-07', roster: month(2027, 7, 'LA0707') },
  { id: 'row-b-01', owner: B, key: '2027-01', roster: month(2027, 1, 'LA9101') },
  { id: 'row-c-05', owner: Cc, key: '2027-05', roster: month(2027, 5, 'LA0505', '') },
];
const EXPECTED_QUARANTINE = { 'row-a-03': 'ROSTER_INCOMPLETE', 'row-a-04': 'CREW_IDENTITY_NOT_BOUND', 'row-b-01': 'CREW_IDENTITY_UNVERIFIED', 'row-c-05': 'CREW_IDENTITY_REQUIRED' };

// Fault injection: the next statement matching `pattern` throws before reaching MySQL.
function faulty(base) {
  const armed = [];
  const wrap = target => ({
    ...target,
    async query(sql, params) {
      const index = armed.findIndex(pattern => pattern.test(String(sql)));
      if (index >= 0) { armed.splice(index, 1); throw Object.assign(new Error('QA fault'), { code: 'QA_FAULT' }); }
      return target.query(sql, params);
    },
    async connect() { return wrap(await target.connect()); },
    release() { target.release?.(); },
  });
  const adapter = wrap(base);
  adapter.arm = pattern => armed.push(pattern);
  return adapter;
}

async function suite(P) {
  const reset = async () => {
    for (const table of [...NEW_TABLES, 'crewcheck_platform_rosters']) await db.query(`DROP TABLE IF EXISTS ${table}`);
    await db.query(legacyDdl);
    for (const statement of schema.split(/;\s*\n/).map(text => text.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) await db.query(statement);
    for (const row of legacyRows) {
      await db.query('INSERT INTO crewcheck_platform_rosters(id,owner_email,roster_key,roster,compliance,gym,source_name,fingerprint,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,FALSE)',
        [row.id, row.owner, row.key, JSON.stringify(row.roster), '{}', '[]', 'sintetico.pdf', crypto.createHash('sha256').update(JSON.stringify(row.roster)).digest('hex')]);
    }
    // Already managed by the new system before the backfill: one live, one tombstone.
    const write = request => P.writeRosterRevision(db, { email: A, crewKey: 'ID:BP00000001', parserVersion: 'qa', ...request }, binding);
    await write({ rosterKey: '2027-06', baseGeneration: 0, operationId: crypto.randomUUID(), roster: month(2027, 6, 'LA6666') });
    await write({ rosterKey: '2027-07', baseGeneration: 0, operationId: crypto.randomUUID(), roster: month(2027, 7, 'LA7777') });
    await write({ rosterKey: '2027-07', operation: 'delete', baseGeneration: 1, operationId: crypto.randomUUID() });
  };
  const state = async () => ({
    competences: (await db.query('SELECT owner_email,crew_key,roster_key,generation,state,content_hash FROM crewcheck_roster_competences WHERE generation>0 ORDER BY owner_email,roster_key')).rows,
    revisions: Number((await db.query('SELECT COUNT(*) AS n FROM crewcheck_roster_revisions')).rows[0].n),
    quarantine: Object.fromEntries((await db.query('SELECT legacy_row_id,reason FROM crewcheck_roster_backfill_quarantine ORDER BY legacy_row_id')).rows.map(row => [row.legacy_row_id, row.reason])),
  });
  const competence = async key => P.readCurrentRoster(db, A, { crewKey: 'ID:BP00000001', rosterKey: key });

  // 1. One run: creates only absent competences of bound rows; quarantines the rest; never overwrites.
  await reset();
  const kept06 = (await competence('2027-06')).contentHash;
  const first = await P.backfillLegacyRosters(db, { ...binding, batchSize: 3 });
  for (const key of ['2027-01', '2027-02']) {
    const created = await competence(key);
    const row = legacyRows.find(item => item.owner === A && item.key === key);
    assert.deepEqual([created.generation, created.contentHash], [1, P.rosterContentHash(row.roster)], `${key} created from the legacy row`);
  }
  assert.deepEqual([(await competence('2027-06')).generation, (await competence('2027-06')).contentHash], [1, kept06], 'a live competence is never overwritten');
  assert.deepEqual([(await competence('2027-07')).generation, (await competence('2027-07')).state], [2, 'deleted'], 'a tombstone is never resurrected');
  assert.equal((await P.readCurrentRoster(db, B, { crewKey: 'ID:BP00009101', rosterKey: '2027-01' })).generation, 0, 'nothing keyed for an unbound account');
  assert.deepEqual((await state()).quarantine, EXPECTED_QUARANTINE, 'unbound, missing/different crewId and refused content are quarantined');
  assert.deepEqual(first.report, { created: 2, already_done: 0, skipped_existing: 2, quarantined: 4 }, 'first run: 2 created, 2 skipped (live, tombstone), 4 quarantined');
  const sources = (await db.query("SELECT generation,base_generation FROM crewcheck_roster_revisions WHERE source_kind='legacy_backfill'")).rows;
  assert.equal(sources.every(row => Number(row.generation) === 1 && Number(row.base_generation) === 0), true, 'backfill only ever creates generation 1 from base 0');
  const afterFirst = await state();

  // 2. Re-run: idempotent (replays), identical end state.
  const second = await P.backfillLegacyRosters(db, { ...binding, batchSize: 3 });
  assert.deepEqual(second.report, { created: 0, already_done: 2, skipped_existing: 2, quarantined: 4 }, 'a re-run replays, it does not write again');
  assert.deepEqual(await state(), afterFirst);

  // 3. Crash and resume: a crash between rows, then a fault before COMMIT; running again converges.
  await reset();
  await assert.rejects(P.backfillLegacyRosters(db, { ...binding, batchSize: 2, afterRow: async (_row, report) => { if (report.created + report.quarantined + report.skipped_existing >= 3) throw Object.assign(new Error('crash'), { code: 'QA_CRASH' }); } }), { code: 'QA_CRASH' });
  const flaky = faulty(db);
  flaky.arm(/^COMMIT$/);
  await assert.rejects(P.backfillLegacyRosters(flaky, { ...binding, batchSize: 2 }), { code: 'QA_FAULT' });
  const resumed = await P.backfillLegacyRosters(db, { ...binding, batchSize: 2 });
  assert.equal(resumed.report.created + resumed.report.already_done, 2);
  assert.deepEqual(await state(), afterFirst, 'after crash and resume the end state is the same as one clean run');

  // 4. Concurrency: two workers and concurrent client writes on the same competences.
  await reset();
  const clientFirst = P.writeRosterRevision(db, { email: A, crewKey: 'ID:BP00000001', rosterKey: '2027-02', baseGeneration: 0, operationId: crypto.randomUUID(), roster: month(2027, 2, 'LA2222'), parserVersion: 'qa' }, binding);
  const [w1, w2] = await Promise.all([P.backfillLegacyRosters(db, { ...binding, batchSize: 2 }), P.backfillLegacyRosters(db, { ...binding, batchSize: 3 }), clientFirst]);
  const final = await state();
  const feb = await competence('2027-02');
  assert.equal(feb.generation, 1, 'exactly one creation of 2027-02, whoever won');
  const client = await clientFirst, clientCreated = client.status === 200 && !client.replay && !client.unchanged ? 1 : 0;
  assert.equal(w1.report.created + w2.report.created + clientCreated, 2, 'one creation per absent competence (2027-01, 2027-02), whoever created it');
  const creations = Number((await db.query("SELECT COUNT(*) AS n FROM crewcheck_roster_revisions WHERE roster_key IN ('2027-01','2027-02')")).rows[0].n);
  assert.equal(creations, 2, 'no duplicated revision under concurrency');
  assert.deepEqual([(await competence('2027-06')).contentHash, (await competence('2027-07')).state], [kept06, 'deleted']);
  assert.deepEqual(final.quarantine, EXPECTED_QUARANTINE);
  const backfillRevisions = (await db.query("SELECT generation,base_generation FROM crewcheck_roster_revisions WHERE source_kind='legacy_backfill'")).rows;
  assert.equal(backfillRevisions.every(row => Number(row.generation) === 1 && Number(row.base_generation) === 0), true, 'never a generation above 1 from backfill');
}

const P = await import(pathToFileURL(path.resolve(protocolFile)).href);
await suite(P);

const source = fs.readFileSync(protocolFile, 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-mutants-'));
const mutants = [
  ['backfill writes on the current generation (overwrite / resurrect)', "          baseGeneration: 0, operationId: legacyOperationId(['legacy_backfill',", "          baseGeneration: (await readCurrentRoster(db, email, { crewKey: binding, rosterKey: String(row.roster_key) })).generation, operationId: legacyOperationId(['legacy_backfill',"],
  ['backfill trusts the PDF crewId without an authoritative binding', 'const binding = typeof resolveVerifiedCrewKey === \'function\' ? await resolveVerifiedCrewKey(email) : null;\n      const rosterCrewKey', 'const rosterCrewKey0 = crewKeyFor(roster?.crewId); const binding = rosterCrewKey0;\n      const rosterCrewKey'],
  ['non-deterministic backfill operation id', "operationId: legacyOperationId(['legacy_backfill', email, String(row.id), String(row.fingerprint)]),", 'operationId: crypto.randomUUID(),'],
  ['refused content not quarantined', "        else await quarantine(String(result.code || `HTTP_${result.status}`));", '        else report.created += 1;'],
];
const killed = [];
for (const [name, from, to] of mutants) {
  assert(source.includes(from), `mutant anchor present: ${name}`);
  const file = path.join(dir, `${killed.length}-server-protocol.mjs`);
  fs.writeFileSync(file, source.replace(from, to));
  let failure = null;
  try { await suite(await import(pathToFileURL(file).href)); } catch (error) { failure = error; }
  assert(failure instanceof assert.AssertionError, `mutant must be killed by an assertion: ${name} (${failure?.message || 'survived'})`);
  killed.push(`${name} → "${failure.message.split('\n')[0]}"`);
}
for (const table of [...NEW_TABLES, 'crewcheck_platform_rosters']) await db.query(`DROP TABLE IF EXISTS ${table}`);
await native.end();
console.log(`PASS backfill rehearsal (synthetic bindings and rows): creates only absent competences of bound rows, quarantines unbound/missing/different crewId/refused content, never overwrites live or tombstone, re-run idempotent, crash between rows and before COMMIT resumes to the same end state, two workers plus concurrent client writes keep every invariant; ${killed.length} mutants killed:\n  ${killed.join('\n  ')}`);
