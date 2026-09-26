import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

const [historySource, noiseSource, knowledgeSource, noiseCardSource] = await Promise.all([
  read('client/src/lib/conciergeRoomHistory.ts'),
  read('client/src/lib/conciergeRoomNoise.ts'),
  read('client/src/lib/conciergeHotelKnowledge.ts'),
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
const noiseUrl = 'data:text/javascript;base64,' + Buffer.from(noiseOutput).toString('base64');
const noise = await import(noiseUrl);
const knowledgeOutput = transpile(knowledgeSource, 'conciergeHotelKnowledge.ts')
  .replace("from './conciergeRoomHistory'", `from '${historyUrl}'`)
  .replace("from './conciergeRoomNoise'", `from '${noiseUrl}'`);
const knowledge = await import('data:text/javascript;base64,' + Buffer.from(knowledgeOutput).toString('base64'));

transpile(noiseCardSource, 'ConciergeRoomNoiseCard.tsx');
assert.match(noiseCardSource, /Hotel Knowledge privado/, 'Concierge must surface a private hotel-knowledge summary');
assert.match(noiseCardSource, /não transforma um relato de um quarto em característica geral do hotel/, 'hotel knowledge must disclose the no-generalization boundary');
assert.match(noiseCardSource, /buildConciergeHotelKnowledge/, 'hotel knowledge must be derived through the deterministic knowledge contract');

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
  };
}

const storage = createMemoryStorage();
let records = noise.saveConciergeRoomNoiseObservation('Hotel Central', '101', {
  origin: 'traffic',
  intensity: 'moderate',
  recurrence: 'recurring',
  observedAt: '2026-09-20T22:00:00-03:00',
  evidenceIds: ['stay:2026-09-20'],
}, { storage, now: new Date('2026-09-20T23:00:00-03:00') });

records = noise.saveConciergeRoomNoiseObservation('Hotel Central', '202', {
  origin: 'traffic',
  intensity: 'moderate',
  recurrence: 'recurring',
  observedAt: '2026-09-22T22:00:00-03:00',
  evidenceIds: ['stay:2026-09-22'],
}, { storage, now: new Date('2026-09-22T23:00:00-03:00') });

records = noise.saveConciergeRoomNoiseObservation('Hotel Central', '303', {
  origin: 'neighbor',
  intensity: 'high',
  recurrence: 'isolated',
  observedAt: '2026-09-01T01:00:00-03:00',
  evidenceIds: ['stay:2026-09-01'],
}, { storage, now: new Date('2026-09-01T02:00:00-03:00') });

records = noise.saveConciergeRoomNoiseObservation('Outro Hotel', '101', {
  origin: 'elevator',
  intensity: 'high',
  recurrence: 'recurring',
  observedAt: '2026-09-23T06:00:00-03:00',
  evidenceIds: ['stay:2026-09-23'],
}, { storage, now: new Date('2026-09-23T07:00:00-03:00') });

const room101Traffic = records.find((item) => item.hotelKey === 'hotel central' && item.roomKey === '101' && item.origin === 'traffic');
assert.ok(room101Traffic);
const recordsWithLegacyDuplicate = [
  ...records,
  {
    ...room101Traffic,
    id: 'legacy-duplicate-same-stay',
    observedAt: '2026-09-21T01:05:00.000Z',
    updatedAt: '2026-09-21T01:05:00.000Z',
  },
];

const summary = knowledge.buildConciergeHotelKnowledge(recordsWithLegacyDuplicate, 'Hôtel Central', new Date('2026-09-24T12:00:00Z'));
assert.equal(summary.hotelKey, 'hotel central');
assert.equal(summary.activeObservations, 2, 'duplicate records from the same stay evidence must not inflate active hotel knowledge');
assert.equal(summary.expiredObservations, 1, 'expired hotel observations should remain historical but not current');
assert.equal(summary.roomsWithActiveObservations, 2, 'active hotel context must preserve distinct room scope');
assert.equal(summary.signals.length, 1, 'same origin and durability should collapse into one hotel signal');
assert.equal(summary.signals[0].origin, 'traffic');
assert.equal(summary.signals[0].roomCount, 2);
assert.deepEqual(summary.signals[0].roomKeys, ['101', '202']);
assert.equal(summary.signals[0].observationCount, 2, 'signal strength must count independent stay evidence, not duplicate taps or legacy duplicates');
assert.equal(summary.structuralCandidateSignals.length, 1);
assert.equal(summary.temporalSignals.length, 0);
assert.equal(summary.circumstantialSignals.length, 0);
assert.equal(summary.hasConfirmedStructuralNoise, false, 'private hotel knowledge must never promote room reports into a confirmed structural hotel fact');
assert.equal(summary.signals.some((item) => item.origin === 'elevator'), false, 'another hotel must remain isolated even when room numbers overlap');

const empty = knowledge.buildConciergeHotelKnowledge(records, 'Hotel Sem Histórico', new Date('2026-09-24T12:00:00Z'));
assert.equal(empty.activeObservations, 0);
assert.equal(empty.signals.length, 0);
assert.equal(empty.hasConfirmedStructuralNoise, false);

console.log('CrewCheck Concierge private hotel knowledge regression OK');
