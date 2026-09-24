import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

const source = await read('client/src/lib/conciergeStayInference.ts');

const compiled = ts.transpileModule(source, {
  fileName: 'conciergeStayInference.ts',
  reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const errors = (compiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, 'conciergeStayInference.ts must transpile without syntax errors');
const inference = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputText).toString('base64'));

const catalog = [
  { name: 'Hotel Único', airport: 'CWB', alternateAirport: '' },
  { name: 'Hotel Alpha', airport: 'GRU', alternateAirport: '' },
  { name: 'Hotel Beta', airport: 'GRU', alternateAirport: '' },
];

const events = [
  {
    id: 'stay-gru', kind: 'stay', date: '24/09/2026', origin: 'GRU', destination: 'GRU', hotel: 'Hotel Publicado',
    canonical: { kind: 'stay', date: '24/09/2026', startDateTime: '2026-09-24T01:00:00.000Z', endDateTime: '2026-09-24T13:00:00.000Z' },
  },
  {
    id: 'flight-wrong-airport', kind: 'flight', date: '24/09/2026', origin: 'GIG', destination: 'BSB', presentation: '06:40',
    canonical: { kind: 'flight', date: '24/09/2026', startDateTime: '2026-09-24T13:10:00.000Z', endDateTime: '2026-09-24T14:30:00.000Z', showPresentation: true },
  },
  {
    id: 'flight-next', kind: 'flight', date: '24/09/2026', origin: 'GRU', destination: 'BSB', presentation: '10:15',
    canonical: { kind: 'flight', date: '24/09/2026', startDateTime: '2026-09-24T13:30:00.000Z', endDateTime: '2026-09-24T15:00:00.000Z', showPresentation: true },
  },
  {
    id: 'journey-rest', kind: 'journey-rest', date: '25/09/2026', origin: 'BSB', destination: 'BSB',
    canonical: { kind: 'journey-rest', date: '25/09/2026', startDateTime: '2026-09-25T00:00:00.000Z', endDateTime: '2026-09-25T08:00:00.000Z' },
  },
  {
    id: 'stay-cwb', kind: 'stay', date: '26/09/2026', origin: 'CWB', destination: 'CWB',
    canonical: { kind: 'stay', date: '26/09/2026', startDateTime: '2026-09-26T01:00:00.000Z', endDateTime: '2026-09-26T12:00:00.000Z' },
  },
];

const saved = [
  { stayDate: '2026-09-24', airport: 'GRU', hotelName: 'Hotel Contingência', presentationTime: '09:50', updatedAt: '2026-09-24T02:00:00Z' },
  { stayDate: '2026-09-10', airport: 'CWB', hotelName: 'Hotel Histórico' },
  { stayDate: '2026-09-01', airport: 'CWB', hotelName: 'Hotel Histórico' },
];

const suggestions = inference.buildConciergeStaySuggestions(events, saved, catalog);
assert.equal(suggestions.length, 2, 'only canonical stay events become Concierge stay suggestions');
assert.equal(suggestions.some((item) => item.eventId === 'journey-rest'), false, 'journey-rest cannot be promoted to a stay');

const gru = suggestions.find((item) => item.eventId === 'stay-gru');
assert.equal(gru.hotelName, 'Hotel Contingência', 'saved user stay must override published hotel for the same day');
assert.equal(gru.hotelSource, 'saved');
assert.equal(gru.presentationTime, '09:50', 'saved presentation must win when available');
assert.equal(gru.airport, 'GRU');
assert.equal(gru.nextEventId, 'flight-next', 'next operational context must remain scoped to the overnight airport');

const noSavedGru = inference.buildConciergeStaySuggestions(events, [], catalog).find((item) => item.eventId === 'stay-gru');
assert.equal(noSavedGru.hotelName, 'Hotel Publicado');
assert.equal(noSavedGru.hotelSource, 'roster');
assert.equal(noSavedGru.presentationTime, '10:15', 'next real operational presentation should be inherited only from the same overnight airport');
assert.equal(noSavedGru.nextEventId, 'flight-next', 'an earlier flight from another airport must not become the overnight next event');

const crossAirportSavedGru = inference.buildConciergeStaySuggestions(events, [
  { stayDate: '2026-09-24', airport: 'GIG', hotelName: 'Hotel Rio', presentationTime: '07:00', updatedAt: '2026-09-24T03:00:00Z' },
], catalog).find((item) => item.eventId === 'stay-gru');
assert.equal(crossAirportSavedGru.hotelName, 'Hotel Publicado', 'a saved stay at another airport on the same date must never override this stay');
assert.equal(crossAirportSavedGru.hotelSource, 'roster');
assert.equal(crossAirportSavedGru.presentationTime, '10:15', 'presentation from another airport on the same date must not leak into this stay');
assert.equal(crossAirportSavedGru.airport, 'GRU', 'airport identity must remain tied to the canonical stay');

const noMatchingOperational = inference.buildConciergeStaySuggestions([
  {
    id: 'stay-gru-isolated', kind: 'stay', date: '28/09/2026', origin: 'GRU', destination: 'GRU',
    canonical: { kind: 'stay', date: '28/09/2026', startDateTime: '2026-09-28T01:00:00.000Z', endDateTime: '2026-09-28T13:00:00.000Z' },
  },
  {
    id: 'flight-gig-only', kind: 'flight', date: '28/09/2026', origin: 'GIG', destination: 'BSB', presentation: '08:00',
    canonical: { kind: 'flight', date: '28/09/2026', startDateTime: '2026-09-28T13:30:00.000Z', endDateTime: '2026-09-28T15:00:00.000Z' },
  },
], [], [])[0];
assert.equal(noMatchingOperational.presentationTime, '', 'Concierge must prefer unknown presentation over inheriting a time from another airport');
assert.equal(noMatchingOperational.nextEventId, null, 'cross-airport operational events must not be linked to the overnight');

const cwb = suggestions.find((item) => item.eventId === 'stay-cwb');
assert.equal(cwb.hotelName, 'Hotel Histórico', 'one unique personal hotel for the airport may be suggested');
assert.equal(cwb.hotelSource, 'history-unique');

const catalogOnly = inference.buildConciergeStaySuggestions([events[4]], [], catalog)[0];
assert.equal(catalogOnly.hotelName, 'Hotel Único');
assert.equal(catalogOnly.hotelSource, 'catalog-unique');

const ambiguous = inference.buildConciergeStaySuggestions([
  { id: 'stay-gru-2', kind: 'stay', date: '27/09/2026', origin: 'GRU', destination: 'GRU', canonical: { kind: 'stay', date: '27/09/2026', startDateTime: '2026-09-27T01:00:00Z', endDateTime: '2026-09-27T12:00:00Z' } },
], [
  { stayDate: '2026-09-10', airport: 'GRU', hotelName: 'Hotel Alpha' },
  { stayDate: '2026-09-01', airport: 'GRU', hotelName: 'Hotel Beta' },
], catalog)[0];
assert.equal(ambiguous.hotelName, '', 'ambiguous history/catalog must not invent a hotel');
assert.equal(ambiguous.hotelSource, 'unknown');

const active = inference.selectConciergeStayFocus(suggestions, new Date('2026-09-24T05:00:00Z'));
assert.equal(active.eventId, 'stay-gru', 'active overnight must be the Concierge focus');
const future = inference.selectConciergeStayFocus(suggestions, new Date('2026-09-25T05:00:00Z'));
assert.equal(future.eventId, 'stay-cwb', 'otherwise focus the next future overnight');
const expired = inference.selectConciergeStayFocus(suggestions, new Date('2026-09-27T13:00:00Z'));
assert.equal(expired, null, 'completed overnights must not remain as stale Concierge focus when nothing active or future exists');

assert.doesNotMatch(source, /android-wrapper|watchSnapshotV1|Data Layer|watch face|\bTV\b/, 'stay inference must remain inside the Concierge lane');

console.log('CrewCheck Concierge stay inference regression OK');
