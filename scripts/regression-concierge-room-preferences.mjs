import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

const [historySource, preferencesSource] = await Promise.all([
  read('client/src/lib/conciergeRoomHistory.ts'),
  read('client/src/lib/conciergeRoomPreferences.ts'),
]);

function transpile(source, fileName) {
  const compiled = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  });
  const errors = (compiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, `${fileName} must transpile without syntax errors`);
  return compiled.outputText;
}

const historyOutput = transpile(historySource, 'conciergeRoomHistory.ts');
const historyUrl = 'data:text/javascript;base64,' + Buffer.from(historyOutput).toString('base64');
const preferencesOutput = transpile(preferencesSource, 'conciergeRoomPreferences.ts')
  .replace("from './conciergeRoomHistory'", `from '${historyUrl}'`);
const preferences = await import('data:text/javascript;base64,' + Buffer.from(preferencesOutput).toString('base64'));

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
  };
}

const storage = createMemoryStorage();
const first = preferences.saveConciergeRoomPreference('Hotel São José', 'Quarto 0812', {
  preference: 'prefer',
  quiet: 'good',
  wifi: 'bad',
  observedStayDate: '2026-09-24',
}, { storage, now: new Date('2026-09-24T04:00:00Z') });
assert.equal(first.length, 1);
assert.equal(first[0].hotelKey, 'hotel sao jose');
assert.equal(first[0].roomKey, '812');
assert.equal(first[0].preference, 'prefer');
assert.equal(first[0].quiet, 'good');
assert.equal(first[0].wifi, 'bad');
assert.equal(first[0].observedStayDate, '2026-09-24');

const alias = preferences.findConciergeRoomPreference(first, 'Hôtel São José', 'room 812');
assert.equal(alias?.roomKey, '812', 'hotel and room aliases must resolve to the same preference');

const updated = preferences.saveConciergeRoomPreference('HOTEL SAO JOSE', '812', {
  blackout: 'good',
  observedStayDate: '2026-10-02',
}, { storage, now: new Date('2026-10-02T10:00:00Z') });
assert.equal(updated.length, 1, 'updating the same hotel + room must not duplicate the preference');
assert.equal(updated[0].preference, 'prefer', 'partial updates must preserve previous explicit preference');
assert.equal(updated[0].quiet, 'good');
assert.equal(updated[0].blackout, 'good');
assert.equal(updated[0].observedStayDate, '2026-10-02', 'latest observation must carry the stay date');

const isolated = preferences.saveConciergeRoomPreference('Outro Hotel', '812', {
  preference: 'avoid',
  shower: 'bad',
  observedStayDate: '2026-09-25',
}, { storage, now: new Date('2026-09-25T10:00:00Z') });
assert.equal(isolated.length, 2, 'same room number in another hotel must remain isolated');
assert.equal(preferences.findConciergeRoomPreference(isolated, 'Outro Hotel', '0812')?.preference, 'avoid');
assert.equal(preferences.findConciergeRoomPreference(isolated, 'Hotel São José', '812')?.preference, 'prefer');

assert.equal(preferences.nextConciergeRoomTrait('unknown'), 'good');
assert.equal(preferences.nextConciergeRoomTrait('good'), 'bad');
assert.equal(preferences.nextConciergeRoomTrait('bad'), 'unknown');

storage.setItem(preferences.CONCIERGE_ROOM_PREFERENCES_KEY, JSON.stringify([{ hotelKey: 'Hotel São José', roomKey: '812', preference: 'invented', quiet: 'invented' }]));
const sanitized = preferences.listConciergeRoomPreferences(storage);
assert.equal(sanitized[0].preference, 'neutral', 'invalid preference values must fail safe');
assert.equal(sanitized[0].quiet, 'unknown', 'invalid trait values must fail safe');

assert.doesNotMatch(preferencesSource, /android-wrapper|watchSnapshotV1|canonicalRoster|journeyId|\bAPZ\b/, 'room preferences must remain Concierge-owned and isolated');

console.log('CrewCheck Concierge room preferences regression OK');
