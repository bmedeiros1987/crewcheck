import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = await readFile(new URL('../client/src/lib/conciergeStayInference.ts', import.meta.url), 'utf8');

const compiled = ts.transpileModule(source, {
  fileName: 'conciergeStayInference.ts',
  reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const errors = (compiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, 'conciergeStayInference.ts must transpile without syntax errors');
const inference = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputText).toString('base64'));

const events = [
  {
    id: 'stay-gru-a', kind: 'stay', date: '01/10/2026', origin: 'GRU', destination: 'GRU', hotel: 'Hotel Publicado A',
    canonical: { kind: 'stay', date: '01/10/2026', startDateTime: '2026-10-01T01:00:00.000Z', endDateTime: '2026-10-01T05:00:00.000Z' },
  },
  {
    id: 'flight-gru-a', kind: 'flight', date: '01/10/2026', origin: 'GRU', destination: 'BSB', presentation: '04:45',
    canonical: { kind: 'flight', date: '01/10/2026', startDateTime: '2026-10-01T05:30:00.000Z', endDateTime: '2026-10-01T07:00:00.000Z' },
  },
  {
    id: 'stay-gru-b', kind: 'stay', date: '01/10/2026', origin: 'GRU', destination: 'GRU', hotel: 'Hotel Publicado B',
    canonical: { kind: 'stay', date: '01/10/2026', startDateTime: '2026-10-01T13:00:00.000Z', endDateTime: '2026-10-01T17:00:00.000Z' },
  },
  {
    id: 'flight-gru-b', kind: 'flight', date: '01/10/2026', origin: 'GRU', destination: 'BSB', presentation: '16:45',
    canonical: { kind: 'flight', date: '01/10/2026', startDateTime: '2026-10-01T17:30:00.000Z', endDateTime: '2026-10-01T19:00:00.000Z' },
  },
];

const exactSaved = [
  { id: 'stay-gru-a', stayDate: '2026-10-01', airport: 'GRU', hotelName: 'Hotel Manual A', presentationTime: '04:30', updatedAt: '2026-10-01T02:00:00Z' },
  { id: 'stay-gru-b', stayDate: '2026-10-01', airport: 'GRU', hotelName: 'Hotel Manual B', presentationTime: '16:30', updatedAt: '2026-10-01T14:00:00Z' },
];

const exact = inference.buildConciergeStaySuggestions(events, exactSaved, []);
const exactA = exact.find((item) => item.eventId === 'stay-gru-a');
const exactB = exact.find((item) => item.eventId === 'stay-gru-b');
assert.equal(exactA.hotelName, 'Hotel Manual A', 'event identity must bind the first saved stay to the first overnight');
assert.equal(exactA.presentationTime, '04:30');
assert.equal(exactB.hotelName, 'Hotel Manual B', 'event identity must bind the second saved stay to the second overnight');
assert.equal(exactB.presentationTime, '16:30');

const ambiguousSaved = [
  { stayDate: '2026-10-01', airport: 'GRU', hotelName: 'Hotel Antigo A', presentationTime: '03:55', updatedAt: '2026-10-01T02:00:00Z' },
  { stayDate: '2026-10-01', airport: 'GRU', hotelName: 'Hotel Antigo B', presentationTime: '15:55', updatedAt: '2026-10-01T14:00:00Z' },
];

const ambiguous = inference.buildConciergeStaySuggestions(events, ambiguousSaved, []);
const ambiguousA = ambiguous.find((item) => item.eventId === 'stay-gru-a');
const ambiguousB = ambiguous.find((item) => item.eventId === 'stay-gru-b');
assert.equal(ambiguousA.hotelName, 'Hotel Publicado A', 'multiple unbound saved stays must not contaminate the first overnight');
assert.equal(ambiguousA.hotelSource, 'roster');
assert.equal(ambiguousA.presentationTime, '04:45', 'ambiguous saved presentation must fall back to the matching operational event');
assert.equal(ambiguousB.hotelName, 'Hotel Publicado B', 'multiple unbound saved stays must not contaminate the second overnight');
assert.equal(ambiguousB.hotelSource, 'roster');
assert.equal(ambiguousB.presentationTime, '16:45', 'each overnight must keep its own next operational presentation');

assert.doesNotMatch(source, /android-wrapper|watchSnapshotV1|Data Layer|watch face|\bTV\b/, 'stay identity logic must remain inside the Concierge lane');

console.log('CrewCheck Concierge same-day stay identity regression OK');
