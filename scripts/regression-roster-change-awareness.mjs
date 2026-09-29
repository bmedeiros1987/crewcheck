import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

function compileCommonJs(path) {
  return ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    fileName: path,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
}

function evaluate(code, requireFn) {
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: requireFn,
    console,
    Map,
    Set,
    Date,
    JSON,
    Math,
    String,
    Number,
    Array,
    Object,
    RegExp,
    encodeURIComponent,
  });
  return module.exports;
}

const comparison = evaluate(compileCommonJs('client/src/lib/rosterComparison.ts'), () => ({}));
function loadAwareness() {
  return evaluate(compileCommonJs('client/src/lib/rosterChangeAwareness.ts'), (id) => {
    if (id === './rosterComparison') return comparison;
    if (id === './authClient') return { getStoredUser: () => null };
    return {};
  });
}
let awareness = loadAwareness();

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}
const storage = memoryStorage();

const leg = (flightNumber, departureTime, arrivalTime, extra = {}) => ({
  flightNumber,
  origin: 'GRU',
  destination: 'GIG',
  departureTime,
  arrivalTime,
  workType: 'OP',
  ...extra,
});
const day = (date, legs = [], type = 'VOO', pairingCode = '1234') => ({
  date,
  dayOfWeek: '',
  type,
  pairingCode,
  dutyReport: legs[0]?.departureTime || null,
  dutyDebrief: legs.at(-1)?.arrivalTime || null,
  legs,
  dutyHours: null,
  flyingHours: null,
  isNextDay: false,
  hotel: null,
  base: 'GRU',
});
const roster = (days, month = 7) => ({
  crewName: 'Teste CrewCheck',
  crewId: '1',
  base: 'GRU',
  rank: 'CCM',
  month,
  year: 2026,
  days,
  rawText: '',
});

const first = roster([day('01/07/2026', [leg('LA100', '08:00', '10:00')])]);
let state = awareness.registerRosterPublication(storage, 'A', first, 'primeira.pdf', '2026-07-01T10:00:00.000Z');
assert.equal(state.ledger.active.length, 0, 'first import must become a baseline without yellow rows');
assert.equal(state.ledger.generation, 0);
state = awareness.registerRosterPublication(storage, 'A', first, 'repetida.pdf', '2026-07-01T10:05:00.000Z');
assert.equal(state.ledger.active.length, 0, 'identical reimport must not create a change');
assert.equal(state.ledger.generation, 0, 'identical reimport must not create a revision');

const second = roster([day('01/07/2026', [leg('LA100', '09:00', '11:00')])]);
state = awareness.registerRosterPublication(storage, 'A', second, 'segunda.pdf', '2026-07-01T11:00:00.000Z');
assert.equal(state.ledger.active.length, 1);
const revisionOne = state.ledger.active[0];
assert.equal(revisionOne.kind, 'changed');
assert.equal(revisionOne.acknowledgedAt, null);
assert.ok(revisionOne.currentRenderKey);
state = awareness.acknowledgeRosterChange(storage, 'A', revisionOne.revisionId, state.ledger.current.fingerprint, '2026-07-01T11:01:00.000Z');
assert.equal(state.ledger.active[0].acknowledgedAt, '2026-07-01T11:01:00.000Z');

const third = roster([day('01/07/2026', [leg('LA100', '09:30', '11:30')])]);
const staleFingerprint = state.ledger.current.fingerprint;
state = awareness.registerRosterPublication(storage, 'A', third, 'terceira.pdf', '2026-07-01T12:00:00.000Z');
const revisionTwo = state.ledger.active[0];
assert.notEqual(revisionTwo.revisionId, revisionOne.revisionId, 'a new edit on the same changed day must create a new revision');
assert.equal(revisionTwo.acknowledgedAt, null, 'a new edit must become unread again');
const concurrent = awareness.acknowledgeRosterChange(storage, 'A', revisionOne.revisionId, staleFingerprint, '2026-07-01T12:01:00.000Z');
assert.equal(concurrent.ledger.active[0].revisionId, revisionTwo.revisionId);
assert.equal(concurrent.ledger.active[0].acknowledgedAt, null, 'late acknowledgement must not clear a newer revision');

const duplicateBaseline = roster([day('02/07/2026', [
  leg('LA200', '08:00', '10:00'),
  leg('LA200', '08:00', '10:00'),
])]);
awareness.registerRosterPublication(storage, 'DUP', duplicateBaseline, 'dup-1.pdf', '2026-07-02T10:00:00.000Z');
const duplicateChanged = roster([day('02/07/2026', [
  leg('LA200', '08:00', '10:00'),
  leg('LA200', '08:00', '10:30'),
])]);
const duplicateState = awareness.registerRosterPublication(storage, 'DUP', duplicateChanged, 'dup-2.pdf', '2026-07-02T11:00:00.000Z');
assert.equal(duplicateState.ledger.active.length, 1, 'only the edited repeated occurrence must change');
assert.match(duplicateState.ledger.active[0].descriptions.join(' '), /10:00.*10:30/);
assert.ok(duplicateState.ledger.active[0].occurrenceId, 'repeated occurrences need their own stable occurrence id');

const removalBaseline = roster([
  day('02/07/2026', [leg('LA200', '08:00', '10:30')]),
  day('03/07/2026', [leg('LA201', '12:00', '14:00')]),
]);
awareness.registerRosterPublication(storage, 'REMOVED', removalBaseline, 'removed-1.pdf', '2026-07-02T11:00:00.000Z');
const removedState = awareness.registerRosterPublication(
  storage,
  'REMOVED',
  roster([day('03/07/2026', [leg('LA201', '12:00', '14:00')])]),
  'removed-2.pdf',
  '2026-07-02T12:00:00.000Z',
);
assert.ok(removedState.ledger.active.some((record) => record.kind === 'removed' && record.current === null), 'removals must remain in the change history');
assert.equal(removedState.ledger.current.roster.days.length, 1);

const accountB = awareness.registerRosterPublication(storage, 'B', third, 'conta-b.pdf', '2026-07-01T12:00:00.000Z');
assert.equal(accountB.ledger.active.length, 0, 'another account must get an independent baseline');
assert.equal(awareness.readRosterChangeAwareness(storage, 'A').ledger.active[0].revisionId, revisionTwo.revisionId, 'account A state must not leak or be overwritten');

awareness = loadAwareness();
const reloaded = awareness.readRosterChangeAwareness(storage, 'A');
assert.equal(reloaded.ledger.active[0].revisionId, revisionTwo.revisionId, 'revision and acknowledgement state must survive reload');

const august = roster([day('01/08/2026', [leg('LA300', '08:00', '10:00')])], 8);
const monthTurn = awareness.registerRosterPublication(storage, 'A', august, 'agosto.pdf', '2026-08-01T08:00:00.000Z');
assert.equal(monthTurn.ledger.active.length, 0, 'month rollover must establish a new baseline, not yellow the whole month');
assert.ok(monthTurn.ledger.history.length >= 2, 'prior before/after history must survive month rollover');

const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
const blockedState = awareness.registerRosterPublication(blocked, 'BLOCKED', first, 'offline.pdf', '2026-07-01T10:00:00.000Z');
assert.equal(blockedState.persisted, false);
assert.match(blockedState.message, /Não foi possível salvar/, 'storage failure must be described honestly');

const aims = fs.readFileSync('client/src/components/v1391/AimsRosterTable.tsx', 'utf8');
assert.match(aims, /data-change-status=\{unread \? 'unread'/);
assert.match(aims, /onKeyDown=.*keyboardOpen/);
assert.match(aims, /event\.key !== 'Enter' && event\.key !== ' '/);
assert.match(aims, /acknowledgeRosterChange/);
assert.match(aims, /Retiradas da publicação atual/);
assert.match(aims, /não significa concordância ou aceite contratual/);
assert.doesNotMatch(aims, /changedDays|markAlertsRead/, 'AIMS acknowledgement must not use aggregate changedDays or alert-read state');

const css = fs.readFileSync('client/src/components/v1391/roster-layout.css', 'utf8');
assert.match(css, /tr\[data-change-status="unread"\][\s\S]*#fef3c7/);
assert.match(css, /html:not\(\[data-crew-theme="light"\]\)[\s\S]*data-change-status="unread"/);
assert.match(css, /\.cc-aims-change-badge/);

console.log('PASS: first import, identical reimport, exact revision acknowledgement, concurrent change, duplicate occurrence, removal history, account isolation, reload, month rollover and blocked storage');
