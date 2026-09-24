import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

const [historySource, noiseSource, noiseCardSource] = await Promise.all([
  read('client/src/lib/conciergeRoomHistory.ts'),
  read('client/src/lib/conciergeRoomNoise.ts'),
  read('client/src/components/v1391/ConciergeRoomNoiseCard.tsx'),
]);

function transpile(source, fileName) {
  const compiled = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  const errors = (compiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  assert.equal(errors.length, 0, `${fileName} must transpile without syntax errors`);
  return compiled.outputText;
}

const historyOutput = transpile(historySource, 'conciergeRoomHistory.ts');
const historyUrl = 'data:text/javascript;base64,' + Buffer.from(historyOutput).toString('base64');
const noiseOutput = transpile(noiseSource, 'conciergeRoomNoise.ts')
  .replace("from './conciergeRoomHistory'", `from '${historyUrl}'`);
const noise = await import('data:text/javascript;base64,' + Buffer.from(noiseOutput).toString('base64'));

transpile(noiseCardSource, 'ConciergeRoomNoiseCard.tsx');
assert.match(noiseCardSource, /saveConciergeRoomNoiseObservation/, 'noise card must persist observations through the structured noise contract');
assert.match(noiseCardSource, /Vizinho barulhento/, 'noise card must expose a quick circumstantial-neighbor action');
assert.match(noiseCardSource, /Obra \/ reforma/, 'noise card must expose a quick temporal-construction action');
assert.match(noiseCardSource, /Trânsito \/ avenida/, 'noise card must expose a quick structural-candidate traffic action');
assert.match(noiseCardSource, /candidato estrutural · não confirmado/, 'UI must not present one private structural candidate as confirmed fact');
assert.match(noiseCardSource, /ficam somente neste aparelho/, 'UI must disclose the local-private persistence boundary');

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
  };
}

const storage = createMemoryStorage();
const observedAt = '2026-09-24T02:00:00-03:00';

let records = noise.saveConciergeRoomNoiseObservation('Hotel São José', 'Quarto 0812', {
  origin: 'neighbor',
  intensity: 'high',
  recurrence: 'isolated',
  dayPeriods: ['overnight'],
  observedAt,
  confidence: 'high',
  evidenceIds: ['stay-2026-09-24', 'stay-2026-09-24'],
}, { storage, now: new Date('2026-09-24T05:10:00Z') });

assert.equal(records.length, 1);
assert.equal(records[0].hotelKey, 'hotel sao jose');
assert.equal(records[0].roomKey, '812');
assert.equal(records[0].durability, 'circumstantial', 'neighbor noise must never become a permanent room trait');
assert.equal(records[0].source, 'user-private');
assert.equal(records[0].evidenceIds.length, 1, 'evidence ids must be deduplicated');
assert.equal(records[0].dayPeriods[0], 'overnight');
assert.ok(records[0].validUntil, 'circumstantial noise must expire');

records = noise.saveConciergeRoomNoiseObservation('Hotel São José', '812', {
  origin: 'neighbor',
  intensity: 'moderate',
  recurrence: 'isolated',
  dayPeriods: ['overnight'],
  observedAt: '2026-09-24T03:00:00-03:00',
  confidence: 'medium',
  evidenceIds: ['stay-2026-09-24'],
}, { storage, now: new Date('2026-09-24T06:05:00Z') });
assert.equal(records.length, 1, 'repeated taps for the same stay, room and origin must coalesce instead of inflating evidence');
assert.equal(records[0].intensity, 'moderate', 'the latest correction for the same evidence must replace the older observation');
assert.equal(records[0].observedAt, '2026-09-24T06:00:00.000Z');

const aliasCurrent = noise.findCurrentConciergeRoomNoise(records, 'Hôtel São José', 'room 812', new Date('2026-09-26T05:00:00Z'));
assert.equal(aliasCurrent.length, 1, 'hotel and room aliases must resolve to the same private observation');
const expiredNeighbor = noise.findCurrentConciergeRoomNoise(records, 'Hotel São José', '812', new Date('2026-10-05T05:00:00Z'));
assert.equal(expiredNeighbor.length, 0, 'isolated neighbor noise must expire instead of permanently marking the room');

records = noise.saveConciergeRoomNoiseObservation('Hotel São José', '812', {
  origin: 'construction',
  intensity: 'moderate',
  recurrence: 'recurring',
  dayPeriods: ['morning', 'afternoon'],
  observedAt: '2026-09-24T08:00:00-03:00',
}, { storage, now: new Date('2026-09-24T11:05:00Z') });
const construction = records.find((item) => item.origin === 'construction');
assert.equal(construction?.durability, 'temporal', 'construction must be temporal and require revalidation');
assert.ok(construction?.validUntil, 'construction must have a validity horizon');
assert.equal(noise.isConciergeNoiseObservationCurrent(construction, new Date('2026-11-01T12:00:00Z')), false);

records = noise.saveConciergeRoomNoiseObservation('Hotel São José', '812', {
  origin: 'traffic',
  intensity: 'moderate',
  recurrence: 'recurring',
  dayPeriods: ['morning'],
  observedAt: '2026-09-24T06:30:00-03:00',
  confidence: 'high',
}, { storage, now: new Date('2026-09-24T10:00:00Z') });
const traffic = records.find((item) => item.origin === 'traffic');
assert.equal(traffic?.durability, 'structural-candidate');
assert.equal(traffic?.validUntil, null, 'structural candidates may persist but remain candidates, not confirmed facts');
const summary = noise.buildConciergeRoomNoiseSummary(records, 'Hotel São José', '812', new Date('2026-09-25T12:00:00Z'));
assert.deepEqual(summary.structuralCandidateOrigins, ['traffic']);
assert.equal(summary.hasConfirmedStructuralNoise, false, 'one private report must never confirm a structural hotel fact');

records = noise.saveConciergeRoomNoiseObservation('Outro Hotel', '812', {
  origin: 'elevator',
  intensity: 'high',
  recurrence: 'recurring',
  observedAt: '2026-09-24T03:00:00-03:00',
}, { storage, now: new Date('2026-09-24T06:10:00Z') });
assert.equal(noise.findCurrentConciergeRoomNoise(records, 'Outro Hotel', '0812').length, 1, 'same room number in another hotel must remain isolated');
assert.ok(noise.findCurrentConciergeRoomNoise(records, 'Hotel São José', '812').every((item) => item.origin !== 'elevator'));

storage.setItem(noise.CONCIERGE_ROOM_NOISE_KEY, JSON.stringify([{
  hotelKey: 'Hotel São José',
  roomKey: '812',
  origin: 'invented-origin',
  intensity: 'extreme',
  recurrence: 'always',
  observedAt: '2026-09-24T10:00:00Z',
  source: 'someone-else',
  confidence: 'certain',
  evidenceIds: ['a', 'a', '', 'b'],
}]));
const sanitized = noise.listConciergeRoomNoiseObservations(storage);
assert.equal(sanitized[0].origin, 'unknown', 'unknown origins must fail safe');
assert.equal(sanitized[0].intensity, 'unknown', 'unknown intensity must fail safe');
assert.equal(sanitized[0].recurrence, 'unknown', 'unknown recurrence must fail safe');
assert.equal(sanitized[0].source, 'user-private', 'local private storage must not accept an invented external reporter identity');
assert.equal(sanitized[0].confidence, 'medium', 'invalid confidence must fail safe');
assert.deepEqual(sanitized[0].evidenceIds, ['a', 'b']);
assert.doesNotMatch(noiseCardSource, /PresentationStayManagerView|android-wrapper|watchSnapshotV1/, 'Concierge noise card must not own shared-shell integration');

console.log('CrewCheck Concierge structured room noise regression OK');
