import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

const [source, card, noiseCard] = await Promise.all([
  read('client/src/lib/conciergeStayContext.ts'),
  read('client/src/components/v1391/ConciergeStayContextCard.tsx'),
  read('client/src/components/v1391/ConciergeRoomNoiseCard.tsx'),
]);

const compiled = ts.transpileModule(source, {
  fileName: 'conciergeStayContext.ts',
  reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const errors = (compiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, 'conciergeStayContext.ts must transpile without syntax errors');
const context = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputText).toString('base64'));

const at = (year, month, day, hour, minute = 0) => new Date(year, month - 1, day, hour, minute, 0, 0);

const missingHotel = context.buildConciergeStayContext({
  stayDate: '2026-09-24', presentationTime: '10:00', leadMinutes: 90,
}, at(2026, 9, 24, 6));
assert.equal(missingHotel.step, 'confirm-hotel', 'hotel confirmation is the first non-urgent setup step');

const missingRoom = context.buildConciergeStayContext({
  stayDate: '2026-09-24', hotelName: 'Hotel Teste', presentationTime: '10:00', leadMinutes: 90,
}, at(2026, 9, 24, 6));
assert.equal(missingRoom.step, 'register-room', 'room registration follows hotel confirmation');

const missingPresentation = context.buildConciergeStayContext({
  stayDate: '2026-09-24', hotelName: 'Hotel Teste', room: '812', leadMinutes: 90,
}, at(2026, 9, 24, 6));
assert.equal(missingPresentation.step, 'set-presentation', 'the timeline must not invent a presentation time');
assert.equal(missingPresentation.presentationAt, null);

const rest = context.buildConciergeStayContext({
  stayDate: '2026-09-24', hotelName: 'Hotel Teste', room: '812', presentationTime: '10:00', leadMinutes: 90,
}, at(2026, 9, 24, 6));
assert.equal(rest.step, 'rest');
assert.equal(rest.wakeAt.getHours(), 8);
assert.equal(rest.wakeAt.getMinutes(), 30);
assert.equal(rest.canPrepareWakeReminder, true);

const wake = context.buildConciergeStayContext({
  stayDate: '2026-09-24', hotelName: 'Hotel Teste', room: '812', presentationTime: '10:00', leadMinutes: 90,
}, at(2026, 9, 24, 9));
assert.equal(wake.step, 'wake', 'the saved lead time opens the preparation window');

const presentation = context.buildConciergeStayContext({
  stayDate: '2026-09-24', hotelName: 'Hotel Teste', room: '812', presentationTime: '10:00', leadMinutes: 90,
}, at(2026, 9, 24, 9, 45));
assert.equal(presentation.step, 'presentation', 'presentation urgency outranks room/admin setup');

const completed = context.buildConciergeStayContext({
  stayDate: '2026-09-24', hotelName: 'Hotel Teste', room: '812', presentationTime: '10:00', leadMinutes: 90,
}, at(2026, 9, 24, 10, 45));
assert.equal(completed.step, 'completed', 'a recently passed presentation closes the timeline instead of rolling immediately');
assert.equal(completed.isPast, true);

const overnight = context.buildConciergeStayContext({
  stayDate: '2026-09-24', hotelName: 'Hotel Teste', room: '812', presentationTime: '06:00', leadMinutes: 90,
}, at(2026, 9, 24, 23));
assert.equal(overnight.presentationAt.getDate(), 25, 'an old early-morning clock on the stay date resolves to the conservative next-day overnight candidate');
assert.equal(overnight.wakeAt.getHours(), 4);
assert.equal(overnight.wakeAt.getMinutes(), 30);
assert.equal(overnight.step, 'rest');

const invalidLead = context.buildConciergeStayContext({
  stayDate: '2026-09-24', hotelName: 'Hotel Teste', room: '812', presentationTime: '10:00', leadMinutes: 'n/a',
}, at(2026, 9, 24, 6));
assert.equal(invalidLead.wakeAt, null, 'invalid wake lead must stay unknown instead of inventing a default');
assert.equal(invalidLead.canPrepareWakeReminder, false);

assert.match(card, /Agora no pernoite/);
assert.match(card, /listConciergeStays/);
assert.match(card, /Apresentação, APZ oficial e pickup\/saída do hotel continuam conceitos separados/);
assert.match(card, /não inventa horário de traslado/);
assert.match(noiseCard, /ConciergeStayContextCard/);
assert.doesNotMatch(source, /canonicalRoster|journeyId|\bAPZ\b/, 'context engine must remain isolated from canonical roster concepts');

await import('./regression-concierge-stay-notifications.mjs');

console.log('CrewCheck Concierge contextual stay regression OK');
