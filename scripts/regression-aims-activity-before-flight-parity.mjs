// AIMS: reserve/standby/ground activity published before a flight in the same day
// column must survive, both in the visual column parser and in the text fallback,
// and match the server token parser. Synthetic tokens only, no real roster.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB } from './lib/ts-module-harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { load, cleanup } = loadClientModules({
  files: ['client/src/lib/rosterCodes.ts', 'client/src/lib/aimsParser.ts'],
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  prefix: 'crewcheck-aims-activity-before-flight-',
  expose: { aimsParser: ['parseAimsVisualColumnDays', 'parseAimsHumanBlock'] },
});
const aims = load('aimsParser');

const serverDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crewcheck-aims-activity-server-'));
let server;
try {
  fs.mkdirSync(path.join(serverDir, 'server'));
  for (const file of fs.readdirSync(path.join(ROOT, 'server'))) {
    if (file.endsWith('.mjs')) fs.copyFileSync(path.join(ROOT, 'server', file), path.join(serverDir, 'server', file));
  }
  fs.cpSync(path.join(ROOT, 'shared'), path.join(serverDir, 'shared'), { recursive: true });
  const source = fs.readFileSync(path.join(ROOT, 'server/rosterParser.mjs'), 'utf8');
  const exposed = source.replace('export { parsePdfOnServer };', 'export { parsePdfOnServer, parseAimsTokensIntoEventsV3 };');
  assert.notEqual(exposed, source, 'server token parser export point not found');
  fs.writeFileSync(path.join(serverDir, 'server/rosterParser.mjs'), exposed);
  server = await import(pathToFileURL(path.join(serverDir, 'server/rosterParser.mjs')).href);

  const context = { date: '15/08/2026', dayOfWeek: 'Sáb', dateObj: new Date(2026, 7, 15), base: 'BSB' };
  // Same meaning, different spelling: the server keeps "(+1)" on the clock, the client sets isNextDay.
  const clock = (value) => String(value || '-').replace('(+1)', '');
  const shape = (days) => days.map((day) => `${day.type} ${clock(day.dutyReport)}–${clock(day.dutyDebrief)}${day.isNextDay || /\(\+1\)/.test(String(day.dutyDebrief || '')) ? '(+1)' : ''} [${(day.legs || []).map((leg) => `${leg.flightNumber}:${leg.origin}>${leg.destination}`).join(',')}]`);
  const visual = (tokens) => shape(aims.parseAimsVisualColumnDays(tokens, { ...context, rawBlock: tokens.join(' ') }));
  const text = (tokens) => shape(aims.parseAimsHumanBlock(tokens, { ...context, rawBlock: tokens.join(' ') }));
  const onServer = (tokens) => shape(server.parseAimsTokensIntoEventsV3(tokens, 15, 8, 2026, 'BSB'));

  const journey = 'VOO 08:50–14:20 [LA3001:BSB>GRU,LA3002:GRU>BSB]';
  const cases = [
    ['ASB 06:30–08:50 then a journey reporting at 08:50 the same day',
      ['ASB', 'BSB', '06:30', 'BSB', '08:50', '08:50', 'LA', '3001', '09:50', 'BSB', 'GRU', '11:30', '(320)', 'LA', '3002', '12:20', 'GRU', 'BSB', '14:00', '(320)', '14:20'],
      ['ASB 06:30–08:50 []', journey]],
    ['continuation "(...)" of the previous duty does not swallow the ASB before the next journey',
      ['(...)', 'GRU', '00:40', '(320)', 'ASB', 'BSB', '06:30', 'BSB', '08:50', '08:50', 'LA', '3001', '09:50', 'BSB', 'GRU', '11:30', '(320)', 'LA', '3002', '12:20', 'GRU', 'BSB', '14:00', '(320)', '14:20'],
      ['ASB 06:30–08:50 []', journey]],
    ['HSB before a journey',
      ['HSB', 'BSB', '04:00', 'BSB', '08:00', '08:00', 'LA', '3101', '09:00', 'BSB', 'CNF', '10:10', '(320)', '10:40'],
      ['HSB 04:00–08:00 []', 'VOO 08:00–10:40 [LA3101:BSB>CNF]']],
    ['CRM before a journey',
      ['CRM', 'BSB', '07:00', 'BSB', '11:00', '12:30', 'LA', '3201', '13:30', 'BSB', 'REC', '16:20', '(320)', '16:50'],
      ['CRM 07:00–11:00 []', 'VOO 12:30–16:50 [LA3201:BSB>REC]']],
    ['station/time pairs followed by two bare clocks: only the last bare clock presents the journey',
      ['ASB', 'BSB', '06:30', 'BSB', '08:50', '08:50', '09:10', 'LA', '3001', '10:10', 'BSB', 'GRU', '11:30', '(320)', '12:00'],
      ['ASB 06:30–08:50 []', 'VOO 09:10–12:00 [LA3001:BSB>GRU]']],
    ['continuation whose arrival collides with a roster code (REC) is skipped, the ASB after it is kept',
      ['(...)', 'REC', '00:40', '(320)', 'ASB', 'BSB', '06:30', 'BSB', '08:50', '08:50', 'LA', '3001', '09:50', 'BSB', 'GRU', '11:30', '(320)', '12:00'],
      ['ASB 06:30–08:50 []', 'VOO 08:50–12:00 [LA3001:BSB>GRU]']],
    ['ASB before a journey that ends after midnight',
      ['ASB', 'BSB', '14:00', 'BSB', '18:00', '18:00', 'LA', '3301', '19:00', 'BSB', 'MAO', '21:40', '(320)', 'LA', '3302', '22:30', 'MAO', 'GRU', '03:50(+1)', '(320)', '04:20(+1)'],
      ['ASB 14:00–18:00 []', 'VOO 18:00–04:20(+1) [LA3301:BSB>MAO,LA3302:MAO>GRU]']],
  ];
  for (const [label, tokens, expected] of cases) {
    assert.deepEqual(visual(tokens), expected, `visual column: ${label}`);
    assert.deepEqual(text(tokens), expected, `text fallback: ${label}`);
    assert.deepEqual(onServer(tokens), expected, `server token parser: ${label}`);
  }

  // Journey continuation without an activity keeps its legs in every parser. The
  // presentation differs by design (#510): the server leaves it for review.
  const continuation = ['(...)', 'BEL', '00:15', '15:05', 'LA', '8020', '15:35', 'BEL', 'BSB', '18:10', '(320)', '18:40'];
  assert.deepEqual(visual(continuation), ['VOO 15:05–18:40 [LA8020:BEL>BSB]']);
  assert.deepEqual(text(continuation), ['VOO 15:05–18:40 [LA8020:BEL>BSB]']);
  assert.deepEqual(onServer(continuation), ['VOO -–18:40 [LA8020:BEL>BSB]']);

  // An EXTRA marker right after the continuation still marks the leg as positioning.
  for (const extra of [
    ['(...)', 'BSB', '08:20', '08:50', 'EXTRA', 'LA', '9001', '10:15', 'BSB', 'GRU', '11:45', '(320)', '12:15'],
    ['(...)', 'GRU', '00:40', '(320)', 'EXTRA', 'LA', '3001', '09:50', 'GRU', 'BSB', '11:30', '(320)', '12:00'],
  ]) {
    for (const days of [aims.parseAimsVisualColumnDays(extra, { ...context, rawBlock: extra.join(' ') }), aims.parseAimsHumanBlock(extra, { ...context, rawBlock: extra.join(' ') }), server.parseAimsTokensIntoEventsV3(extra, 15, 8, 2026, 'BSB')]) {
      assert.equal(days.find((day) => day.type === 'VOO')?.legs?.[0]?.workType, 'PS', `EXTRA after a continuation keeps PS: ${extra.join(' ')}`);
    }
  }
  // A clock after the stitched arrival still presents the next journey in both client paths.
  const presented = ['(...)', 'BSB', '08:29', '09:25', 'LA', '3730', '10:15', 'BSB', 'GRU', '11:45', '(320)', '12:15'];
  assert.deepEqual(visual(presented), ['VOO 09:25–12:15 [LA3730:BSB>GRU]']);
  assert.deepEqual(text(presented), ['VOO 09:25–12:15 [LA3730:BSB>GRU]']);

  // Bare-clock activity (no station pairs): its clocks stay its own; nothing is
  // promoted to the flight's presentation.
  const bare = ['ASB', '08:00', '12:00', 'LA', '9003', '13:00', 'GRU', 'BSB', '15:00', '(320)'];
  for (const days of [aims.parseAimsVisualColumnDays(bare, { ...context, rawBlock: bare.join(' ') }), aims.parseAimsHumanBlock(bare, { ...context, rawBlock: bare.join(' ') })]) {
    assert.ok(days.some((day) => day.type === 'ASB'), 'bare-clock ASB kept');
    const leg = days.find((day) => day.type === 'VOO')?.legs?.[0];
    assert.equal(leg?.departureTime, '13:00');
    assert.equal(leg?.presentationTime, undefined);
  }
} finally {
  cleanup();
  fs.rmSync(serverDir, { recursive: true, force: true });
}
console.log('PASS AIMS activity before flight: ASB/HSB/CRM kept before journeys (same day, after a "(...)" continuation, across midnight) in the visual column and text fallback, matching the server token parser; continuation-only journey and bare-clock ASB unchanged');
