// Proposal check (not runtime): transactional operation receipts, on a disposable MySQL with
// docs/proposals/roster-revision-sync/schema-draft.sql and the reference server protocol.
// Every decision taken under the competence lock — applied, unchanged (no-op), conflict, rejected —
// records ONE receipt bound to the operationId and its request hash, in the same transaction as any
// revision and competence change. Replay returns the original response, never the current state as
// an old ACK. Synthetic accounts/rosters only; no network.
// Scenarios: reuse after no-op / delete no-op / conflict / rejection, replay of the original answer
// after the competence advanced, concurrent duplicates of one operation on one competence and on
// distinct competences, fault injection before COMMIT and inside the transaction, legacy deterministic
// ids, retention (no purge path). Then mutants that reintroduce each defect must fail.
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

async function resetSchema() {
  for (const table of ['crewcheck_roster_operation_receipts', 'crewcheck_roster_revisions', 'crewcheck_roster_competences']) await db.query(`DROP TABLE IF EXISTS ${table}`);
  for (const statement of schema.split(/;\s*\n/).map(text => text.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)) await db.query(statement);
}

// Fault injection: the next statement matching `pattern` throws before reaching MySQL.
function faulty(base) {
  const armed = [];
  const wrap = target => ({
    ...target,
    async query(sql, params) {
      const index = armed.findIndex(pattern => pattern.test(String(sql)));
      if (index >= 0) { armed.splice(index, 1); throw Object.assign(new Error(`QA fault at ${sql.slice(0, 40)}`), { code: 'QA_FAULT' }); }
      return target.query(sql, params);
    },
    async connect() { return wrap(await target.connect()); },
    release() { target.release?.(); },
  });
  const adapter = wrap(base);
  adapter.arm = pattern => armed.push(pattern);
  return adapter;
}

const pad = value => String(value).padStart(2, '0');
function february(tag, crewId = 'BP00000001') {
  const days = [];
  for (let day = 1; day <= 28; day += 1) days.push({ date: `${pad(day)}/02/2027`, type: day === 10 ? 'FLIGHT' : 'DO', legs: day === 10 ? [{ flightNumber: tag }] : [] });
  return { crewId, crewName: 'TRIPULANTE SINTETICO', year: 2027, month: 2, days };
}
const march = tag => { const days = []; for (let day = 1; day <= 31; day += 1) days.push({ date: `${pad(day)}/03/2027`, type: day === 3 ? 'FLIGHT' : 'DO', legs: day === 3 ? [{ flightNumber: tag }] : [] }); return { crewId: 'BP00000001', year: 2027, month: 3, days }; };
const A = february('LA1000'), B = february('LA2000'), C = february('LA3000'), D = february('LA4000');
const crewKey = 'ID:BP00000001', email = 'qa-receipts@example.test';
const binding = { resolveVerifiedCrewKey: async who => (who === email ? crewKey : null) };
const without = (value, key) => { const { [key]: _omitted, ...rest } = value; return rest; };

async function suite(P) {
  const write = (request, adapter = db) => P.writeRosterRevision(adapter, { email, crewKey, rosterKey: '2027-02', parserVersion: 'qa', ...request }, binding);
  const generation = async (rosterKey = '2027-02') => (await P.readCurrentRoster(db, email, { crewKey, rosterKey })).generation;
  const count = async table => Number((await db.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
  const receipt = async operationId => (await db.query('SELECT outcome,generation_at_decision,revision_id FROM crewcheck_roster_operation_receipts WHERE owner_email=$1 AND client_operation_id=$2', [email, operationId])).rows[0] || null;

  // 1. No-op (same content on the current base) records a receipt; reusing its id is refused.
  await resetSchema();
  assert.equal((await write({ baseGeneration: 0, operationId: crypto.randomUUID(), roster: A })).generation, 1);
  const noop = crypto.randomUUID();
  const unchanged = await write({ baseGeneration: 1, operationId: noop, roster: A });
  assert.deepEqual([unchanged.status, unchanged.unchanged], [200, true]);
  assert.equal((await receipt(noop))?.outcome, 'unchanged', 'the no-op decision is recorded under its operationId');
  assert.equal((await write({ baseGeneration: 1, operationId: noop, roster: B })).code, 'OPERATION_ID_REUSED', 'a no-op id cannot be reused for other content');
  assert.equal(await generation(), 1, 'nothing applied by the reuse attempt');
  assert.deepEqual(without(await write({ baseGeneration: 1, operationId: noop, roster: A }), 'replay'), unchanged, 'replay of the no-op returns the original answer');

  // 2. Delete on an absent competence is a no-op with a receipt too.
  const deleteNoop = crypto.randomUUID();
  assert.equal((await write({ rosterKey: '2027-03', operation: 'delete', baseGeneration: 0, operationId: deleteNoop })).unchanged, true);
  assert.equal((await receipt(deleteNoop))?.outcome, 'unchanged');
  assert.equal((await write({ rosterKey: '2027-03', baseGeneration: 0, operationId: deleteNoop, roster: march('LA5000') })).code, 'OPERATION_ID_REUSED');
  assert.equal(await generation('2027-03'), 0);

  // 3. Conflict (stale base) records a receipt: a corrected retry needs a new id; replay repeats the 409.
  const stale = crypto.randomUUID();
  const conflict = await write({ baseGeneration: 0, operationId: stale, roster: B });
  assert.equal(conflict.status, 409);
  assert.equal((await receipt(stale))?.outcome, 'conflict', 'the conflict decision is recorded under its operationId');
  assert.equal((await write({ baseGeneration: 1, operationId: stale, roster: B })).code, 'OPERATION_ID_REUSED', 'a conflicting id is not silently reused with a corrected base');
  assert.deepEqual(without(await write({ baseGeneration: 0, operationId: stale, roster: B }), 'replay'), conflict);
  assert.equal(await generation(), 1);

  // 4. Rejection of an incomplete roster records a receipt (the valid revision stays).
  const rejected = crypto.randomUUID();
  const incomplete = { ...B, days: B.days.filter(day => day.date !== '15/02/2027') };
  assert.equal((await write({ baseGeneration: 1, operationId: rejected, roster: incomplete })).code, 'ROSTER_INCOMPLETE');
  assert.equal((await receipt(rejected))?.outcome, 'rejected');
  assert.equal((await write({ baseGeneration: 1, operationId: rejected, roster: B })).code, 'OPERATION_ID_REUSED');
  assert.equal(await generation(), 1);

  // 5. Lost ACK: the replay returns the ORIGINAL response even after the competence advanced.
  const lost = crypto.randomUUID();
  const original = await write({ baseGeneration: 1, operationId: lost, roster: B });
  assert.deepEqual([original.status, original.generation], [200, 2]);
  await write({ baseGeneration: 2, operationId: crypto.randomUUID(), roster: C });
  await write({ baseGeneration: 3, operationId: crypto.randomUUID(), roster: D });
  const replay = await write({ baseGeneration: 1, operationId: lost, roster: B });
  assert.equal(replay.replay, true);
  assert.deepEqual(without(replay, 'replay'), original, 'the old ACK is the original decision, not the current state (generation 4)');
  assert.equal(await generation(), 4);
  assert.equal((await receipt(lost))?.revision_id, original.revisionId, 'the receipt points at the revision it applied');

  // 6. One operation sent four times at once on one competence: applied once, three identical replays.
  await resetSchema();
  await write({ baseGeneration: 0, operationId: crypto.randomUUID(), roster: A });
  const duplicated = crypto.randomUUID();
  const copies = await Promise.all([1, 2, 3, 4].map(() => write({ baseGeneration: 1, operationId: duplicated, roster: B })));
  assert.equal(copies.filter(answer => !answer.replay).length, 1, 'exactly one copy decides');
  const decided = copies.find(answer => !answer.replay);
  for (const copy of copies) assert.deepEqual(without(copy, 'replay'), decided, 'every copy gets the same original answer');
  assert.deepEqual([await generation(), await count('crewcheck_roster_revisions'), await count('crewcheck_roster_operation_receipts')], [2, 2, 2]);

  // 7. One operation id raced on two distinct competences: one decides, the other is refused.
  const shared = crypto.randomUUID();
  const raced = await Promise.all([
    write({ baseGeneration: 2, operationId: shared, roster: C }),
    write({ rosterKey: '2027-03', baseGeneration: 0, operationId: shared, roster: march('LA6000') }),
    write({ baseGeneration: 2, operationId: shared, roster: C }),
    write({ rosterKey: '2027-03', baseGeneration: 0, operationId: shared, roster: march('LA6000') }),
  ]);
  const winners = raced.filter(answer => answer.status === 200 && !answer.replay);
  assert.equal(winners.length, 1, 'one competence decides the shared id');
  assert.equal(raced.filter(answer => answer.code === 'OPERATION_ID_REUSED').length, 2, 'both requests for the other competence are refused');
  assert.equal(raced.filter(answer => answer.replay).length, 1);
  const after = { '2027-02': await generation(), '2027-03': await generation('2027-03') };
  const advanced = Object.entries(after).filter(([key, value]) => value === { '2027-02': 2, '2027-03': 0 }[key] + 1).map(([key]) => key);
  const untouched = Object.entries(after).filter(([key, value]) => value === { '2027-02': 2, '2027-03': 0 }[key]).map(([key]) => key);
  assert.deepEqual([advanced.length, untouched.length], [1, 1], 'exactly one competence advanced by one generation, the other untouched');
  assert.equal(winners[0].current.generation, after[advanced[0]], 'the winning answer belongs to the competence that advanced');
  assert.equal(await count('crewcheck_roster_operation_receipts'), 3, 'one receipt per decided id');

  // 8. Atomicity: a failure before COMMIT or inside the transaction leaves no receipt, no revision,
  // no generation change; the retry with the same id then applies exactly once.
  await resetSchema();
  await write({ baseGeneration: 0, operationId: crypto.randomUUID(), roster: A });
  for (const pattern of [/^COMMIT$/, /INSERT INTO crewcheck_roster_operation_receipts/, /^UPDATE crewcheck_roster_competences/]) {
    const before = [await generation(), await count('crewcheck_roster_revisions'), await count('crewcheck_roster_operation_receipts')];
    const flaky = faulty(db), id = crypto.randomUUID();
    flaky.arm(pattern);
    await assert.rejects(write({ baseGeneration: before[0], operationId: id, roster: before[0] % 2 ? B : A }, flaky), { code: 'QA_FAULT' });
    assert.deepEqual([await generation(), await count('crewcheck_roster_revisions'), await count('crewcheck_roster_operation_receipts')], before, `fault at ${pattern}: nothing persisted`);
    assert.equal(await receipt(id), null);
    const retried = await write({ baseGeneration: before[0], operationId: id, roster: before[0] % 2 ? B : A });
    assert.deepEqual([retried.status, retried.replay, retried.generation], [200, undefined, before[0] + 1], `fault at ${pattern}: retry applies once`);
  }
  // Same for the no-op path: a failed COMMIT leaves no receipt; the retry records it.
  const flaky = faulty(db), noopRetry = crypto.randomUUID();
  flaky.arm(/^COMMIT$/);
  const now = await generation(), content = now % 2 ? A : B;
  await assert.rejects(write({ baseGeneration: now, operationId: noopRetry, roster: content }, flaky), { code: 'QA_FAULT' });
  assert.equal(await receipt(noopRetry), null);
  assert.equal((await write({ baseGeneration: now, operationId: noopRetry, roster: content })).unchanged, true);
  assert.equal((await receipt(noopRetry))?.outcome, 'unchanged');

  // 9. Legacy clients: deterministic ids; create once, replay; refusal (428) recorded and replayed.
  await resetSchema();
  const legacy = await P.writeRosterRevision(db, { email, crewKey, rosterKey: '2027-02', roster: A }, binding);
  assert.deepEqual([legacy.status, legacy.generation], [200, 1]);
  assert.deepEqual(without(await P.writeRosterRevision(db, { email, crewKey, rosterKey: '2027-02', roster: A }, binding), 'replay'), legacy);
  const refused = await P.writeRosterRevision(db, { email, crewKey, rosterKey: '2027-02', roster: B }, binding);
  assert.equal(refused.status, 428);
  assert.deepEqual(without(await P.writeRosterRevision(db, { email, crewKey, rosterKey: '2027-02', roster: B }, binding), 'replay'), refused);
  assert.equal(await generation(), 1, 'no legacy overwrite');

  // 10. Retention is fail-closed: the protocol has no purge path; receipts are never deleted.
  const code = fs.readFileSync(protocolFile, 'utf8');
  assert.doesNotMatch(code, /DELETE\s+FROM\s+crewcheck_roster_operation_receipts|TRUNCATE\s+(TABLE\s+)?crewcheck_roster_operation_receipts|DROP\s+TABLE[^;]*crewcheck_roster_operation_receipts/i, 'no receipt purge in the reference protocol');
}

const P = await import(pathToFileURL(path.resolve(protocolFile)).href);
await suite(P);

// Mutants: each reintroduces a defect and must make the suite fail by assertion.
const source = fs.readFileSync(protocolFile, 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-mutants-'));
const mutants = [
  ['no-op not recorded (ROLLBACK + 200)', "if (noop) return await decide('unchanged', unchanged);", "if (noop) { await client.query('ROLLBACK'); return unchanged; }"],
  ['conflict not recorded', "if (moved) return await decide(legacy ? 'rejected' : 'conflict', conflict);", "if (moved) { await client.query('ROLLBACK'); return conflict; }"],
  ['replay answers with the current state', 'return { ...storedResponse(previous.response), replay: true };', 'return outcome(200, { replay: true, generation: Number(current.generation), current: competenceView(current) });'],
  ['request hash not compared on replay', 'if (previous.request_hash !== requestHash)', 'if (false)'],
  ['receipt written outside the transaction', 'await recordReceipt(client, {', 'await recordReceipt(db, {'],
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
await resetSchema();
await native.end();
console.log(`PASS roster revision receipts: reuse after no-op/delete no-op/conflict/rejection refused, original answer replayed after the competence advanced, concurrent duplicates on one and on distinct competences, faults before COMMIT and inside the transaction persist nothing, legacy deterministic ids, no purge path; ${killed.length} mutants killed:\n  ${killed.join('\n  ')}`);
