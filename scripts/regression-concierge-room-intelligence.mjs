import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

const [historySource, intelligenceSource] = await Promise.all([
  read('client/src/lib/conciergeRoomHistory.ts'),
  read('client/src/lib/conciergeRoomIntelligence.ts'),
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
const intelligenceOutput = transpile(intelligenceSource, 'conciergeRoomIntelligence.ts')
  .replace("from './conciergeRoomHistory'", `from '${historyUrl}'`);
const intelligence = await import('data:text/javascript;base64,' + Buffer.from(intelligenceOutput).toString('base64'));

const stays = [
  { stayDate: '2026-09-23', hotelName: 'Hotel São José', room: '999' },
  { stayDate: '2026-09-20', hotelName: 'Hôtel São José', room: 'Quarto 0812' },
  { stayDate: '2026-09-20T18:00:00Z', hotelName: 'HOTEL SAO JOSE', room: '812' },
  { stayDate: '2026-09-10', hotelName: 'Hotel São José', room: 'room 812' },
  { stayDate: '2026-08-01', hotelName: 'Hotel São José', room: '417' },
  { stayDate: '2026-07-15', hotelName: 'Hotel São José', room: '' },
  { stayDate: '2026-07-01', hotelName: 'Outro Hotel', room: '812' },
];

const insight = intelligence.buildConciergeRoomIntelligence(stays, 'Hotel São José', '2026-09-23');
assert.equal(insight.hotelVisits, 4, 'hotel intelligence should count distinct prior dates');
assert.equal(insight.staysWithKnownRoom, 3, 'room coverage should ignore stays without a room');
assert.equal(insight.distinctRooms, 2, 'room aliases must collapse into the same normalized room');
assert.equal(insight.mostFrequentRoom?.room, '812');
assert.equal(insight.mostFrequentRoom?.visits, 2);
assert.equal(insight.mostFrequentRoom?.lastStayDate, '2026-09-20');
assert.equal(insight.mostRecentRoom?.room, '812');
assert.deepEqual(insight.knownRooms.map((item) => [item.room, item.visits]), [['812', 2], ['417', 1]]);
assert.equal(insight.knownRooms.some((item) => item.room === '999'), false, 'current stay must not contaminate historical room intelligence');

const otherHotel = intelligence.buildConciergeRoomIntelligence(stays, 'Outro Hotel', '2026-09-23');
assert.equal(otherHotel.hotelVisits, 1);
assert.equal(otherHotel.mostFrequentRoom?.room, '812', 'same room number in another hotel must remain isolated');

const empty = intelligence.buildConciergeRoomIntelligence(stays, '', '2026-09-23');
assert.equal(empty.hotelVisits, 0);
assert.equal(empty.mostFrequentRoom, null);

assert.doesNotMatch(intelligenceSource, /android-wrapper|watchSnapshotV1|canonicalRoster|journeyId|\bAPZ\b/, 'Room Intelligence must remain Concierge-owned and isolated');

console.log('CrewCheck Concierge room intelligence regression OK');
