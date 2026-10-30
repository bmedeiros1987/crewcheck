// Proposal check (pure, no network, no DB): device reconciliation under hostile interleavings, and
// the canonical content hash. Every scenario runs against the proposal modules, then against
// mutants that reintroduce each reviewed defect; every mutant must make the suite fail.
//  - A sent → new local B → ACK(A): B is never marked synced or dropped; it gets A's generation;
//  - duplicated / reordered ACKs: only the answer for the in-flight operationId applies;
//  - reordered reads: a listing or snapshot older than what the device saw never downgrades;
//  - tombstone at a later generation is not recreated by an older read;
//  - logout / account switch / aborted request: the in-flight snapshot is kept and re-sent as is;
//  - conflict keeps the newest local change and the superseded one; keep_server adopts the database
//    snapshot so an older offline cache is never shown again;
//  - hash covers every semantic property (base, rank, …) and ignores only declared noise (rawText).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const clientFile = 'docs/proposals/roster-revision-sync/client-reconcile.mjs', serverFile = 'docs/proposals/roster-revision-sync/server-protocol.mjs';

function suite(C, H) {
  const ids = { accountId: 'A', crewKey: 'ID:BP00000001', rosterKey: '2026-10', rosterKind: 'operated' };
  const key = C.entryKey(ids);
  const roster = tag => ({ crewId: 'BP00000001', crewName: 'TRIPULANTE SINTETICO', base: 'GRU', rank: 'CC', year: 2026, month: 10, days: [{ date: '23/10/2026', type: 'FLIGHT', legs: [{ flightNumber: tag }] }] });
  const r0 = roster('LA0000'), rA = roster('LA1111'), rB = roster('LA2222'), r5 = roster('LA5555');
  const hash = r => H.rosterContentHash(r);
  const change = (store, r, operationId) => C.recordLocalChange(store, ids, { roster: r, contentHash: hash(r), operationId });
  const live = (generation, r) => ({ generation, state: 'live', contentHash: hash(r) });
  const ok = (generation, r) => ({ status: 200, current: live(generation, r) });
  const synced1 = () => ({ entries: { [key]: C.adoptServer(C.newEntry(ids), live(1, r0), r0) } });

  // 1. A sent, B recorded while A is in flight, then ACK(A).
  let store = change(synced1(), rA, 'op-a');
  let { entry, request: sentA } = C.beginSend(store.entries[key]);
  store = { entries: { [key]: entry } };
  store = change(store, rB, 'op-b');
  entry = C.applySendResult(store.entries[key], sentA, ok(2, rA));
  assert.deepEqual([entry.synced.generation, entry.synced.contentHash, entry.synced.roster], [2, hash(rA), rA], 'ACK(A) confirms A, not the newer B');
  assert.equal(entry.pending?.operationId, 'op-b', 'B is still pending, never marked synced');
  assert.equal(entry.pending.baseGeneration, 2, 'B is based on the generation A received');
  const sendB = C.beginSend(entry);
  assert.deepEqual([sendB.request.operationId, sendB.request.baseGeneration, sendB.request.contentHash], ['op-b', 2, hash(rB)]);
  entry = sendB.entry;

  // 2. Duplicated / reordered ACKs.
  assert.equal(C.applySendResult(entry, sentA, { status: 200, replay: true, generation: 2 }), entry, 'late duplicate ACK(A) is ignored while B is in flight');
  entry = C.applySendResult(entry, sendB.request, ok(3, rB));
  assert.deepEqual([entry.synced.generation, entry.synced.contentHash], [3, hash(rB)]);
  assert.equal(C.applySendResult(entry, sentA, ok(2, rA)), entry, 'ACK(A) after ACK(B) is ignored');
  assert.equal(C.applySendResult(entry, sendB.request, ok(3, rB)), entry, 'ACK for an already settled request is ignored');

  // 3. Reordered reads never downgrade.
  const stalePlan = C.planReconcile(entry, live(2, rA), { online: true, listingComplete: true });
  assert.deepEqual([stalePlan.action, stalePlan.reason], ['none', 'stale_read'], 'listing older than the seen generation is obsolete');
  assert.equal(C.adoptServer(entry, live(2, rA), rA), entry, 'an older snapshot is not adopted');
  assert.equal(C.planReconcile(entry, live(4, r5), { online: true, listingComplete: true }).action, 'adopt_server');

  // 4. Tombstone at a later generation is not recreated by an older read.
  entry = C.adoptServer(entry, { generation: 4, state: 'deleted', contentHash: null }, null);
  assert.deepEqual([entry.synced.generation, entry.synced.deleted], [4, true]);
  assert.equal(C.planReconcile(entry, live(3, rB), { online: true, listingComplete: true }).display, 'none', 'older live listing does not recreate the deleted month');
  assert.equal(C.adoptServer(entry, live(3, rB), rB), entry);

  // 5. Logout / account switch / aborted request keep the in-flight snapshot and its operationId.
  store = change({ entries: { [key]: entry } }, rA, 'op-c');
  const sendC = C.beginSend(store.entries[key]);
  store = { entries: { [key]: sendC.entry } };
  assert.equal(C.entriesForAccount(store, 'B').length, 0, 'another account never sees it');
  const aborted = C.applySendResult(store.entries[key], sendC.request, { status: 0 });
  assert.equal(aborted, store.entries[key], 'no response: nothing changes');
  assert.equal(C.beginSend(aborted).request, sendC.request, 're-sent as the same immutable snapshot');
  assert(Object.isFrozen(sendC.request), 'the in-flight snapshot is immutable');

  // 6. 409 keeps the newest local change and the superseded one; the server state is shown.
  store = change({ entries: { [key]: aborted } }, rB, 'op-d');
  const conflicted = C.applySendResult(store.entries[key], sendC.request, { status: 409, code: 'ROSTER_REVISION_CONFLICT', current: live(5, r5) });
  assert.equal(conflicted.conflict.pending.operationId, 'op-d', 'the newest local change is what the user decides on');
  assert.deepEqual(conflicted.conflict.superseded.map(item => item.operationId), ['op-c']);
  assert.equal(conflicted.pending, undefined); assert.equal(conflicted.inflight, undefined);
  assert.equal(C.planReconcile(conflicted, live(5, r5), { online: true, listingComplete: true }).display, 'server');

  // 7. keep_server adopts the database snapshot; the old offline cache never comes back.
  assert.throws(() => C.resolveConflict(conflicted, 'keep_server', { server: live(5, r5) }), /roster/);
  assert.throws(() => C.resolveConflict(conflicted, 'keep_local', { operationId: 'op-x' }), /view the user saw/, 'a choice needs the view the user saw');
  const kept = C.resolveConflict(conflicted, 'keep_server', { server: live(5, r5), roster: r5 });
  assert.deepEqual([kept.synced.generation, kept.synced.roster], [5, r5], 'keep_server adopts the database snapshot');
  assert.equal(C.planReconcile(kept, null, { online: false, listingComplete: false }).display, 'synced');
  assert.deepEqual(kept.discarded.map(item => item.operationId).sort(), ['op-c', 'op-d'], 'archived, recoverable');
  const local = C.resolveConflict(conflicted, 'keep_local', { operationId: 'op-e', server: live(5, r5) });
  assert.deepEqual([local.pending.operationId, local.pending.baseGeneration, local.pending.contentHash], ['op-e', 5, hash(rB)]);

  // 7b. A newer database state arrives while the conflict screen (generation 5) is open: a tombstone
  // at generation 6. The choice made on the old screen is refused and nothing changes; the screen
  // must be shown again with generation 6. The base is never raised to a generation the user did not see.
  const tombstone = { generation: 6, state: 'deleted', contentHash: null };
  assert.equal(C.planReconcile(conflicted, tombstone, { online: true, listingComplete: true }).action, 'adopt_server', 'a newer listing refreshes the open conflict');
  const moved = C.adoptServer(conflicted, tombstone, null);
  assert.deepEqual([moved.seen, moved.synced.deleted, moved.conflict.server.generation, moved.conflict.pending.operationId], [6, true, 6, 'op-d'], 'conflict stays open with the newer view');
  let staleServer = null;
  try { C.resolveConflict(moved, 'keep_server', { server: live(5, r5), roster: r5 }); } catch (error) { staleServer = error; }
  assert.equal(staleServer?.code, 'CONFLICT_VIEW_STALE', 'keep_server on a stale view is refused, entry untouched');
  let staleLocal = null;
  try { C.resolveConflict(moved, 'keep_local', { operationId: 'op-h', server: live(5, r5) }); } catch (error) { staleLocal = error; }
  assert.equal(staleLocal?.code, 'CONFLICT_VIEW_STALE', 'keep_local on a stale view is refused: no base raised to the unseen generation 6');
  assert.deepEqual([moved.conflict.pending.operationId, moved.synced.generation], ['op-d', 6]);
  const reconfirmed = C.resolveConflict(moved, 'keep_local', { operationId: 'op-h', server: tombstone });
  assert.equal(reconfirmed.pending.baseGeneration, 6, 'only an explicit choice on the generation-6 screen bases the change on 6');

  // 8. 409 with the same content adopts the database (no write) and settles the chained change.
  store = change(synced1(), rA, 'op-f');
  const sendF = C.beginSend(store.entries[key]);
  store = change({ entries: { [key]: sendF.entry } }, rB, 'op-g');
  const equal = C.applySendResult(store.entries[key], sendF.request, { status: 409, current: live(7, rA) });
  assert.deepEqual([equal.synced.generation, equal.pending.operationId, equal.pending.baseGeneration], [7, 'op-g', 7]);

  // 8b. Snapshots are deep and immutable: the caller mutating its own object after record,
  // beginSend or adopt changes nothing recorded, sent or adopted.
  const mutable = roster('LA7777');
  store = change(synced1(), mutable, 'op-m');
  mutable.days[0].legs[0].flightNumber = 'LA0BAD';
  assert.equal(store.entries[key].pending.roster.days[0].legs[0].flightNumber, 'LA7777', 'recorded change is a copy');
  const sendM = C.beginSend(store.entries[key]);
  mutable.days[0].type = 'RES';
  assert.deepEqual([sendM.request.roster.days[0].legs[0].flightNumber, sendM.request.roster.days[0].type], ['LA7777', 'FLIGHT'], 'in-flight snapshot unaffected');
  assert.throws(() => { sendM.request.roster.days[0].legs[0].flightNumber = 'LA0BAD'; }, TypeError, 'in-flight snapshot is frozen to the leaves');
  assert.equal(sendM.request.contentHash, hash(roster('LA7777')), 'content and hash still agree');
  const adoptedRoster = roster('LA8888');
  const adopted = C.adoptServer(C.newEntry(ids), live(9, adoptedRoster), adoptedRoster);
  adoptedRoster.days[0].legs[0].flightNumber = 'LA0BAD';
  assert.equal(adopted.synced.roster.days[0].legs[0].flightNumber, 'LA8888', 'adopted roster is a frozen copy');

  // 9. Canonical content hash.
  const base = roster('LA9999'), h = hash(base);
  for (const [label, mutate] of [
    ['base', r => { r.base = 'BSB'; }], ['rank', r => { r.rank = 'CMS'; }], ['airline', r => { r.airline = 'LA'; }],
    ['crewName', r => { r.crewName = 'OUTRO NOME'; }], ['totals', r => { r.totals = { flightHours: 1 }; }],
    ['source coverage', r => { r.aimsFlightSourceCoverage = { complete: false }; }], ['day field', r => { r.days[0].type = 'RES'; }],
    ['leg field', r => { r.days[0].legs[0].flightNumber = 'LA0001'; }], ['added day', r => { r.days.push({ date: '24/10/2026', type: 'DO', legs: [] }); }],
  ]) { const copy = structuredClone(base); mutate(copy); assert.notEqual(hash(copy), h, `hash covers ${label}`); }
  for (const [label, mutate] of [
    ['roster rawText', r => { r.rawText = 'texto bruto'; }], ['day rawText', r => { r.days[0].rawText = 'linha'; }], ['leg rawText', r => { r.days[0].legs[0].rawText = 'x'; }],
    ['key order', r => { const { base: b, ...rest } = r; Object.keys(r).forEach(k => delete r[k]); Object.assign(r, { base: b }, rest); }],
  ]) { const copy = structuredClone(base); mutate(copy); assert.equal(hash(copy), h, `declared noise / ordering does not change the hash: ${label}`); }
}

const [C, H] = await Promise.all([import(pathToFileURL(path.resolve(clientFile)).href), import(pathToFileURL(path.resolve(serverFile)).href)]);
suite(C, H);

// Mutants: each reintroduces one reviewed defect and must make the suite fail.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-mutants-'));
const mutants = [
  ['ACK not correlated to the in-flight operationId', clientFile, "if (!request || !entry.inflight || entry.inflight.operationId !== request.operationId) return entry;", 'if (!entry.inflight && !entry.pending) return entry;'],
  ['ACK applied to the current pending change', clientFile, 'const sent = entry.inflight;', 'const sent = entry.pending || entry.inflight;'],
  ['stale listing not ignored (downgrade)', clientFile, 'if (current.generation < (entry?.seen || 0))', 'if (false)'],
  ['older snapshot adopted (downgrade)', clientFile, 'if (!server || server.generation < (entry.seen || 0) || (entry.synced && server.generation < entry.synced.generation)) return entry;', 'if (!server) return entry;'],
  ['keep_server without adopting the database snapshot', clientFile, "const adopted = adoptServer({ ...entry, conflict: undefined }, server, roster ?? null);", 'const adopted = { ...entry, conflict: undefined };'],
  ['shallow freeze of snapshots', clientFile, 'const freeze = value => deepFreeze(structuredClone(value));', 'const freeze = value => Object.freeze({ ...value });'],
  ['stale conflict view accepted', clientFile, "if (server.generation < (entry.seen || 0)) throw", "if (false) throw"],
  ['keep_local raises the base to an unseen generation', clientFile, "if (server.generation < (entry.seen || 0)) throw Object.assign(new Error('conflict view is stale; show the newer database state again'), { code: 'CONFLICT_VIEW_STALE', seen: entry.seen });", "if (choice !== 'keep_local' && server.generation < (entry.seen || 0)) throw Object.assign(new Error('stale'), { code: 'CONFLICT_VIEW_STALE' }); if (choice === 'keep_local') server = { ...server, generation: Math.max(server.generation, entry.seen || 0) };"],
  ['hash limited to year/month/crew/days', serverFile, 'roster: canonicalRoster(roster) }));', 'roster: canonicalRoster({ year: roster.year, month: roster.month, crewId: roster.crewId, days: roster.days }) }));'],
];
const killed = [];
for (const [name, file, from, to] of mutants) {
  const source = fs.readFileSync(file, 'utf8');
  assert(source.includes(from), `mutant anchor present: ${name}`);
  const target = path.join(dir, `${killed.length}-${path.basename(file)}`);
  fs.writeFileSync(target, source.replace(from, to));
  const mutated = await import(pathToFileURL(target).href);
  let failure = null;
  try { suite(file === clientFile ? mutated : C, file === serverFile ? mutated : H); } catch (error) { failure = error; }
  assert(failure instanceof assert.AssertionError, `mutant must be killed by an assertion, not survive or crash: ${name} (${failure?.message || 'survived'})`);
  killed.push(`${name} → "${failure.message.split('\n')[0]}"`);
}
console.log(`PASS reconcile interleavings and canonical hash; ${killed.length} mutants killed:\n  ${killed.join('\n  ')}`);
