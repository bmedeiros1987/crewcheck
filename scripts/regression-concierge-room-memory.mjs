import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

const source = await read('client/src/lib/conciergeRoomHistory.ts');

const compiled = ts.transpileModule(source, {
  fileName: 'conciergeRoomHistory.ts',
  reportDiagnostics: true,
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
});
const errors = (compiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, 'conciergeRoomHistory.ts must transpile without syntax errors');
const history = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputText).toString('base64'));

assert.equal(history.normalizeConciergeHotelName('  Hôtel São José  '), 'hotel sao jose');
assert.equal(history.normalizeConciergeHotelName('HOTEL   SAO-JOSE'), 'hotel sao jose');
assert.equal(history.normalizeConciergeRoom('Quarto 0812'), '812');
assert.equal(history.normalizeConciergeRoom('room 812'), '812');
assert.equal(history.normalizeConciergeRoom('A-12'), 'A12');

const stays = [
  { stayDate: '2026-09-23', hotelName: 'Hôtel São José', room: '812' },
  { stayDate: '2026-09-20', hotelName: 'Hotel Sao Jose', room: 'Quarto 0812' },
  { stayDate: '2026-09-20T18:00:00Z', hotelName: 'HOTEL SÃO JOSÉ', room: '812' },
  { stayDate: '2026-09-10', hotelName: 'Hotel São José', room: 'room 812' },
  { stayDate: '2026-08-01', hotelName: 'Hotel São José', room: '417' },
  { stayDate: '2026-07-01', hotelName: 'Outro Hotel', room: '812' },
];

const memory = history.buildConciergeRoomMemory(stays, 'Hotel São José', '0812', '2026-09-23');
assert.equal(memory.hotelVisits, 3, 'hotel history should count distinct prior stay dates only');
assert.equal(memory.roomVisits, 2, 'room history should count distinct prior stay dates for the same hotel+room');
assert.equal(memory.lastHotelStayDate, '2026-09-20');
assert.equal(memory.lastRoomStayDate, '2026-09-20');
assert.deepEqual(memory.roomStayDates, ['2026-09-20', '2026-09-10']);
assert.equal(memory.hotelStayDates.includes('2026-09-23'), false, 'current stay must not count as history');
assert.equal(memory.hotelStayDates.includes('2026-07-01'), false, 'same room at a different hotel must not leak into room memory');

const hotelOnly = history.buildConciergeRoomMemory(stays, 'Hotel São José', '', '2026-09-23');
assert.equal(hotelOnly.hotelVisits, 3);
assert.equal(hotelOnly.roomVisits, 0);

const empty = history.buildConciergeRoomMemory(stays, '', '812', '2026-09-23');
assert.equal(empty.hotelVisits, 0);
assert.equal(empty.roomVisits, 0);

assert.doesNotMatch(source, /android-wrapper|watchSnapshotV1|canonicalRoster|journeyId|\bAPZ\b/, 'room memory must remain Concierge-owned and isolated');

console.log('CrewCheck Concierge room memory regression OK');
