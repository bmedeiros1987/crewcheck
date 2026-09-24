import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

const [queueSource, syncSource] = await Promise.all([
  read('client/src/lib/conciergeStayQueue.ts'),
  read('client/src/lib/conciergeStaySync.ts'),
]);

const compiled = ts.transpileModule(queueSource, {
  fileName: 'conciergeStayQueue.ts',
  reportDiagnostics: true,
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
});
const errors = (compiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, 'conciergeStayQueue.ts must transpile without syntax errors');
const queue = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputText).toString('base64'));

const serverId = 'c7eb47e2-9ac9-4f4f-a49a-1da04c012f3b';
assert.equal(queue.isServerStayId(serverId), true);
assert.equal(queue.isServerStayId('2026-09-23'), false);

const clean = queue.sanitizeConciergeStayPatch({ id: '2026-09-23', stayDate: '2026-09-23', hotelName: 'Hotel A' });
assert.equal(Object.hasOwn(clean, 'id'), false, 'synthetic offline cache ids must never be replayed as server ids');

let pending = queue.coalescePendingConciergeStays([], {
  stayDate: '2026-09-23', hotelName: 'Hotel A', room: '812', presentationTime: '07:10',
}, '2026-09-23T22:00:00.000Z');
pending = queue.coalescePendingConciergeStays(pending, {
  id: '2026-09-23', stayDate: '2026-09-23', hotelName: 'Hotel A', room: '814',
}, '2026-09-23T22:05:00.000Z');
assert.equal(pending.length, 1, 'multiple offline edits for the same stay day must coalesce');
assert.equal(pending[0].patch.room, '814', 'latest offline room edit must win');
assert.equal(Object.hasOwn(pending[0].patch, 'id'), false, 'coalesced patch must keep synthetic ids out');
assert.equal(pending[0].attempts, 0, 'a new local edit resets retry attempts');

const overlaid = queue.overlayPendingConciergeStays([
  { id: serverId, stayDate: '2026-09-23', hotelName: 'Hotel A', room: '812' },
], pending);
assert.equal(overlaid.length, 1);
assert.equal(overlaid[0].id, serverId, 'pending overlay must preserve a real server id');
assert.equal(overlaid[0].room, '814', 'pending local edit must stay visible until sync completes');

const withServerId = queue.sanitizeConciergeStayPatch({ id: serverId, stayDate: '2026-09-24', room: '901' });
assert.equal(withServerId.id, serverId, 'real UUID stay ids must remain editable after reconnect');

const syncCompiled = ts.transpileModule(syncSource, {
  fileName: 'conciergeStaySync.ts',
  reportDiagnostics: true,
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
});
const syncErrors = (syncCompiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
assert.equal(syncErrors.length, 0, 'conciergeStaySync.ts must transpile without syntax errors');

assert.match(syncSource, /crewcheck_concierge_stays_pending_v1/, 'sync layer needs its own durable pending queue');
assert.match(syncSource, /for \(const pending of snapshot\)/, 'pending stays must replay sequentially');
assert.match(syncSource, /payload\?\.localOnly/, 'network fallback must remain queued instead of being discarded');
assert.match(syncSource, /overlayPendingConciergeStays/, 'server refresh must not hide unsynced local edits');
assert.match(syncSource, /listPlatformStays/, 'Concierge sync facade must read stays through the existing platform boundary');
assert.match(syncSource, /updatePlatformStay/, 'Concierge sync facade must write stays through the existing platform boundary');
assert.doesNotMatch(syncSource, /addEventListener\(|PresentationStayManagerView|android-wrapper|watchSnapshotV1|Data Layer|watch face|\bTV\b/, 'reconnect lifecycle and device-shell hooks belong to Mobile Core/Peripherals, not Concierge sync');
assert.doesNotMatch(syncSource, /canonicalRoster|journeyId|\bAPZ\b/, 'offline stay sync must stay isolated from the canonical roster core');

console.log('Concierge offline stay sync regression: PASS');
