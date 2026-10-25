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
  files: ['client/src/lib/rosterCodes.ts', 'client/src/lib/aimsParser.ts', 'client/src/lib/canonicalRoster.ts'],
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

  // PR #1254 r4370548240: removing a bare-clock activity must retain the
  // positioning marker; the activity's release remains its own published clock.
  for (const marker of ['[extra]', 'EXTRA', 'PS', 'PAX', 'PASSAGEIRO']) {
    for (const paired of [false, true]) {
      const own = paired ? ['ASB', 'BSB', '06:30', 'BSB', '08:50'] : ['ASB', '06:30', '08:50'];
      const tokens = [...own, marker, 'LA', '3001', '09:50', 'BSB', 'GRU', '11:30', '(320)', '12:00'];
      for (const read of [aims.parseAimsVisualColumnDays, aims.parseAimsHumanBlock]) {
        const before = JSON.stringify(tokens);
        const days = read(tokens, { ...context, rawBlock: tokens.join(' ') });
        assert.equal(days[0].dutyDebrief, '08:50');
        assert.equal(days[0].dutyDebriefSource, 'published');
        const flight = days.find(day => day.legs.length);
        assert.equal(flight.legs[0].workType, 'PS', `${marker} survives activity removal`);
        assert.equal(flight.dutyReport, '09:50');
        assert.equal(flight.dutyReportSource, 'estimated', 'activity release is not flight APZ');
        assert.equal(JSON.stringify(tokens), before, 'published tokens remain unchanged');
      }
    }
    for (const prefix of [[], ['(...)', 'BSB', '00:40', '(320)']]) {
      const tokens = [...prefix, 'ASB', '06:30', '08:00', marker, '08:50', 'LA', '3001', '09:20', 'BSB', 'GRU', '11:10', '(320)', '11:40'];
      for (const read of [aims.parseAimsVisualColumnDays, aims.parseAimsHumanBlock]) {
        const days = read(tokens, { ...context, rawBlock: tokens.join(' ') });
        assert.equal(days[0].dutyDebrief, '08:00', 'marker/APZ cannot extend the activity');
        const flight = days.find(day => day.legs.length);
        assert.equal(flight.legs[0].workType, 'PS');
        assert.equal(flight.dutyReport, '08:50');
        assert.equal(flight.dutyReportSource, 'published');
        assert.equal(flight.legs[0].departureTime, '09:20');
      }
    }
  }

  // PR #1254 r4370548242: the removed duty still fences the earlier arrival.
  for (const code of ['ASB', 'HSB', 'CRM']) {
    const tokens = ['(...)', 'BSB', '08:20', code, 'BSB', '08:30', 'BSB', '09:00', 'LA', '3001', '10:15', 'BSB', 'GRU', '11:45', '(320)', '12:15'];
    for (const read of [aims.parseAimsVisualColumnDays, aims.parseAimsHumanBlock]) {
      const days = read(tokens, { ...context, rawBlock: tokens.join(' ') });
      assert.equal(days[0].dutyReport, '08:30');
      assert.equal(days[0].dutyDebrief, '09:00');
      const flight = days.find(day => day.legs.length);
      assert.equal(flight.dutyReport, '10:15');
      assert.equal(flight.dutyReportSource, 'estimated');
      assert.equal(flight.legs[0].presentationTime, undefined);
    }
  }

  // Public import, not just the internal token readers: the full-length fixture
  // exercises physical reconstruction and visual/text merging; the short one
  // exercises the legacy fallback. Times and flights are synthetic.
  const canonical = load('canonicalRoster');
  const publicHeader = 'Escala de Tripulante Convertida para padrão AIMS\nTripulante: SYNTHETIC FIXTURE - BP: 999999 - Base: BSB - 01/10/2032 até 31/10/2032\n';
  const ownReserve = ['ASB', 'BSB', '06:30', 'BSB', '08:50'];
  const firstLeg = ['LA', '9801', '09:40', 'BSB', 'GRU', '11:30', '(320)'];
  const secondLeg = ['LA', '9802', '12:20', 'GRU', 'BSB', '14:00', '(320)', '14:20'];
  const expectedDuty = (type, start, end) => [type, start, end, 'published', 'published', []];
  const expectedFlight = (start, end, legs = [['LA9801', 'OP'], ['LA9802', 'OP']], reportSource = 'published') => ['VOO', start, end, reportSource, 'published', legs];
  const userExpected = [expectedDuty('ASB', '06:30', '08:50'), expectedFlight('08:50', '14:20')];
  const publicCases = [
    ['no flight: standby followed by reserve keeps both published occurrences', ['HSB', 'BSB', '00:30', 'BSB', '03:30', 'ASB', 'BSB', '04:10', 'BSB', '08:00'], [expectedDuty('HSB', '00:30', '03:30'), expectedDuty('ASB', '04:10', '08:00')]],
    ['literal source08:50, not takeoff09:40', [...ownReserve, '08:50', ...firstLeg, ...secondLeg], userExpected],
    ['several independent ground duties', ['HSB', 'BSB', '04:00', 'BSB', '06:10', ...ownReserve, '08:50', ...firstLeg, ...secondLeg], [expectedDuty('HSB', '04:00', '06:10'), ...userExpected]],
    ['bare reserve release is not flight APZ', ['ASB', '06:30', '08:50', ...firstLeg, ...secondLeg], [userExpected[0], expectedFlight('09:40', '14:20', undefined, 'estimated')]],
    ['old arrival cannot cross an activity fence', ['(...)', 'BSB', '08:20', 'ASB', 'BSB', '08:30', 'BSB', '09:00', 'LA', '9801', '10:15', 'BSB', 'GRU', '11:45', '(320)', '12:15'], [expectedDuty('ASB', '08:30', '09:00'), expectedFlight('10:15', '12:15', [['LA9801', 'OP']], 'estimated')]],
    ['activity between flights and after last flight', ['08:50', ...firstLeg, '11:50', 'ASB', 'GRU', '12:10', 'GRU', '13:10', '13:20', 'LA', '9802', '14:10', 'GRU', 'BSB', '15:50', '(320)', '16:10', 'CRM', 'BSB', '16:20', 'BSB', '17:20'], [expectedFlight('08:50', '11:50', [['LA9801', 'OP']]), expectedDuty('ASB', '12:10', '13:10'), expectedFlight('13:20', '16:10', [['LA9802', 'OP']]), expectedDuty('CRM', '16:20', '17:20')]],
    ['same flight number is not same leg identity', [...ownReserve, '08:50', ...firstLeg, ...secondLeg.map(t => t === '9802' ? '9801' : t)], [userExpected[0], expectedFlight('08:50', '14:20', [['LA9801', 'OP'], ['LA9801', 'OP']])]],
    ['overnight arrival retains literal clocks', ['ASB', 'BSB', '14:00', 'BSB', '18:00', '18:00', 'LA', '9801', '19:00', 'BSB', 'MAO', '21:40', '(320)', 'LA', '9802', '22:30', 'MAO', 'GRU', '03:50(+1)', '(320)', '04:20(+1)'], [expectedDuty('ASB', '14:00', '18:00'), expectedFlight('18:00', '04:20')]],
  ];
  // No LA token: the text reader must still split explicit supported activities.
  // This tests source inventory, not legal eligibility or a financial tariff.
  const groundCodes = ['ASB', 'HSB', 'HSBE', 'CRM'];
  for (const first of groundCodes) for (const second of groundCodes) {
    publicCases.push([`no flight: ${first} then ${second}`,
      [first, 'BSB', '03:00', 'BSB', '07:00', second, 'BSB', '08:00', 'BSB', '12:00'],
      [expectedDuty(first, '03:00', '07:00'), expectedDuty(second, '08:00', '12:00')]]);
  }
  publicCases.push(['no flight: three independent activities', ['HSB', 'BSB', '00:30', 'BSB', '03:30', 'ASB', 'BSB', '04:10', 'BSB', '08:00', 'CRM', 'BSB', '10:00', 'BSB', '12:00'],
    [expectedDuty('HSB', '00:30', '03:30'), expectedDuty('ASB', '04:10', '08:00'), expectedDuty('CRM', '10:00', '12:00')]]);
  for (const code of groundCodes) publicCases.push([`single ${code} unchanged`, [code, 'BSB', '03:00', 'BSB', '07:00'], [expectedDuty(code, '03:00', '07:00')]]);
  for (const station of ['REC', 'CPT', 'LIS']) {
    const tokens = ['HSB', station, '00:30', station, '03:30', 'ASB', station, '04:10', station, '08:00'];
    const expected = [expectedDuty('HSB', '00:30', '03:30'), expectedDuty('ASB', '04:10', '08:00')];
    publicCases.push([`no flight: ${station} station pairs are not activities`, tokens, expected]);
    for (const read of [aims.parseAimsHumanBlock, aims.parseAimsVisualColumnDays]) {
      const days = read(tokens, { ...context, rawBlock: tokens.join(' ') });
      assert.deepEqual(days.map(day => [day.type, day.dutyReport, day.dutyDebrief, day.dutyReportSource, day.dutyDebriefSource, []]), expected);
      assert.equal(days.some(day => day.pairingCode === station), false);
    }
    const activity = ['HSB', 'BSB', '00:30', 'BSB', '03:30', station, 'BSB', '03:40', 'BSB', '04:00', 'ASB', 'BSB', '04:10', 'BSB', '08:00'];
    const type = station === 'CPT' ? 'CRM' : 'OTHER';
    publicCases.push([`no flight: genuine ${station} activity remains a boundary`, activity,
      [expectedDuty('HSB', '00:30', '03:30'), expectedDuty(type, '03:40', '04:00'), expectedDuty('ASB', '04:10', '08:00')]]);
    for (const read of [aims.parseAimsHumanBlock, aims.parseAimsVisualColumnDays]) {
      const days = read(activity, { ...context, rawBlock: activity.join(' ') });
      assert.equal(days.length, 3);
      assert.equal(days[1].pairingCode, station, 'a real code outside the preceding station pairs is not discarded');
    }
  }
  // Published station-owned clocks are not duration summaries, even if their
  // values match the legacy bare-clock duration blacklist. All data fictional.
  for (const station of ['BSB', 'REC', 'CPT', 'LIS', 'ZZZ']) {
    publicCases.push([`literal short clocks at ${station}`, ['HSB', station, '03:10', station, '03:15', 'ASB', station, '04:20', station, '10:20'],
      [expectedDuty('HSB', '03:10', '03:15'), expectedDuty('ASB', '04:20', '10:20')]]);
    publicCases.push([`literal duplicated slots at ${station}`, ['HSB', '03:10', '03:10', station, station, '03:15', '03:15', 'ASB', '04:20', '04:20', station, station, '10:20', '10:20'],
      [expectedDuty('HSB', '03:10', '03:15'), expectedDuty('ASB', '04:20', '10:20')]]);
    publicCases.push([`literal cross-midnight clocks at ${station}`, ['HSB', station, '23:45', station, '02:00', 'ASB', station, '03:00', station, '07:00'],
      [expectedDuty('ASB', '03:00', '07:00'), expectedDuty('HSB', '23:45', '02:00')]]);
  }
  for (const read of [aims.parseAimsHumanBlock, aims.parseAimsVisualColumnDays]) {
    const days = read(['HSB', '03:10', '03:15', 'ASB', '04:20', '10:20'], context);
    assert.equal(days[0].dutyReport, null, 'bare duration-like tokens keep legacy conservative filter');
    assert.equal(days[0].dutyDebrief, null);
    const duplicated = ['(...)', 'BSB', '00:55', '00:55', 'HSB', '03:10', '03:10', 'BSB', 'BSB', '03:15', '03:15', 'ASB', '04:20', '04:20', 'BSB', 'BSB', '10:20', '10:20'];
    assert.deepEqual(read(duplicated, context).map(day => [day.type, day.dutyReport, day.dutyDebrief]), [['HSB', '03:10', '03:15'], ['ASB', '04:20', '10:20']]);
  }
  for (const read of [aims.parseAimsHumanBlock, aims.parseAimsVisualColumnDays]) {
    for (const [start, estimatedEnd] of [['03:00', '09:00'], ['04:10', '10:10']]) {
      const reserve = read(['ASB', 'BSB', start, 'BSB', start], context).find(day => day.type === 'ASB');
      assert.deepEqual([reserve.dutyReport, reserve.dutyDebrief, reserve.dutyReportSource, reserve.dutyDebriefSource], [start, estimatedEnd, 'published', 'estimated'], 'repeated source start is not a proven release; existing labelled reserve estimate remains');
    }
    for (const code of ['HSB', 'HSBE']) {
      const standby = read([code, 'BSB', '04:10', 'BSB', '04:10'], context).find(day => day.type === code);
      assert.deepEqual([standby.dutyReport, standby.dutyDebrief, standby.dutyReportSource, standby.dutyDebriefSource], ['04:10', null, 'published', 'absent'], 'repeated standby clocks preserve absent release');
    }
    const training = read(['CRM', 'BSB', '04:10', 'BSB', '04:10'], context).find(day => day.type === 'CRM');
    assert.deepEqual([training.dutyReport, training.dutyDebrief, training.dutyReportSource, training.dutyDebriefSource], ['04:10', '04:10', 'published', 'published'], 'retain existing distinct CRM station-window semantics');
    for (const clock of ['03:00', '04:10']) {
      const partial = read(['ASB', 'REC', clock], context).find(day => day.type === 'ASB');
      assert.deepEqual([partial.dutyReport, partial.dutyDebrief, partial.dutyReportSource, partial.dutyDebriefSource], [null, null, 'absent', 'absent'], 'a partial colliding station pair is not a complete published ASB window');
    }
  }
  for (const airport of ['GRU', 'REC', 'CPT', 'LIS']) {
    publicCases.push([`residual ${airport} is not an activity`, ['(...)', airport, '00:40', '(320)', ...ownReserve, '08:50', ...firstLeg, ...secondLeg], userExpected]);
  }
  for (const marker of ['[extra]', 'EXTRA', 'PS', 'PAX', 'PASSAGEIRO']) {
    publicCases.push([`${marker} then own APZ before first leg`, ['ASB', '06:30', '08:00', marker, '08:50', ...firstLeg, ...secondLeg], [expectedDuty('ASB', '06:30', '08:00'), expectedFlight('08:50', '14:20', [['LA9801', 'PS'], ['LA9802', 'OP']])]]);
    publicCases.push([`${marker} with trailing clock stays on next leg`, [...ownReserve, '08:50', ...firstLeg, marker, '12:00', ...secondLeg], [userExpected[0], expectedFlight('08:50', '14:20', [['LA9801', 'OP'], ['LA9802', 'PS']])]]);
  }
  // Continuation-only short legacy parsing is an independently documented,
  // pre-existing limitation. Here pin the full reconstruction path being changed.
  publicCases.push(['valid continuation presentation survives reconstruction', ['(...)', 'BSB', '08:29', '09:25', 'LA', '9801', '10:15', 'BSB', 'GRU', '11:45', '(320)', '12:15'], [expectedFlight('09:25', '12:15', [['LA9801', 'OP']])], [true]]);
  for (const marker of ['[extra]', 'PS']) {
    publicCases.push([`${marker} with temporally proven next presentation`, [...ownReserve, '08:50', ...firstLeg, marker, '14:00', 'LA', '9802', '14:40', 'GRU', 'BSB', '16:20', '(320)', '16:40'], [userExpected[0], expectedFlight('08:50', '16:40', [['LA9801', 'OP'], ['LA9802', 'PS']])]]);
  }
  // Exact duplicated-slot layout, with synthetic crew/date/flight numbers.
  // Old and revised source clocks remain separate fields, including APZ==STD.
  for (const sourceClock of ['08:50', '09:40']) {
    const tokens = ['(...)', 'BSB', '06:15', '06:15', 'ASB', '06:30', '06:30', 'BSB', 'BSB', sourceClock, sourceClock, 'LA', '9801', sourceClock, '09:40', 'BSB', 'BPS', sourceClock === '08:50' ? '11:25' : '11:22', '(321)', 'LA', '9802', '12:05', 'BPS', 'BSB', '13:50', '14:20', '(321)'];
    publicCases.push([`duplicated-slot source ${sourceClock}`, tokens, [expectedDuty('ASB', '06:30', sourceClock), expectedFlight(sourceClock, '14:20')]]);
  }
  publicCases.push(['duplicated-slot source without APZ', ['(...)', 'BSB', '06:15', '06:15', 'ASB', '06:30', '06:30', 'BSB', 'BSB', '09:40', '09:40', 'LA', '9801', '09:40', 'BSB', 'BPS', '11:22', '(321)', 'LA', '9802', '12:05', 'BPS', 'BSB', '13:50', '14:20', '(321)'], [expectedDuty('ASB', '06:30', '09:40'), expectedFlight('09:40', '14:20', undefined, 'estimated')]]);
  let publicCount = 0;
  const publicFailures = [];
  for (const [label, tokens, expected, lengths = [false, true]] of publicCases) for (const long of lengths) for (const withVisual of [false, true]) {
    const ordinary = ['LA', '9201', '08:50', '09:40', 'BSB', 'GRU', '11:30', '(320)', 'LA', '9202', '12:20', 'GRU', 'BSB', '14:00', '(320)', '14:20'];
    const columns = long ? Array.from({ length: 12 }, (_, index) => ({ date: `${20 + index}Oct`, tokens: index === 5 ? tokens : index < 5
      ? ordinary.map(t => /^920[12]$/.test(t) ? String(Number(t) + index * 2) : t) : ['DO'] }))
      : [{ date: '25Oct', tokens }, { date: '26Oct', tokens: ['DO'] }, { date: '27Oct', tokens: ['DO'] }];
    const fullText = publicHeader + columns.map(col => col.date + '\n' + col.tokens.join('\n')).join('\n');
    const rows = columns.flatMap((col, index) => [col.date, ...col.tokens].map((str, row) => ({ page: 1, key: row, text: str, items: [{ str, x: 100 + index * 100, y: 800 - row * 15, page: 1 }] })));
    const before = JSON.stringify({ tokens, rows });
    try {
      const roster = aims.parseAimsRoster(fullText, withVisual ? rows : undefined);
      const days = roster.days.filter(day => day.date === '25/10/2032');
      const actual = days.map(day => [day.type, day.dutyReport, day.dutyDebrief, day.dutyReportSource, day.dutyDebriefSource, day.legs.map(leg => [leg.flightNumber, leg.workType])]);
      assert.deepEqual(actual, expected);
      const events = canonical.buildCanonicalRosterEvents(roster);
      const duties = events.filter(event => event.kind === 'duty' && event.date === '25/10/2032');
      assert.equal(new Set(duties.map(event => event.id)).size, duties.length, 'existing occurrence event IDs are unique');
      assert.equal(new Set(duties.map(event => event.journeyId)).size, duties.length, 'ground journeys are independent occurrences');
      const flights = events.filter(event => event.kind === 'flight' && /^LA980[12]$/.test(event.flightNumber));
      assert.equal(flights.length, expected.reduce((sum, day) => sum + day[5].length, 0), 'canonical legs occur exactly once');
      assert.equal(new Set(flights.map(event => event.id)).size, flights.length, 'canonical event identities are unique');
      assert.equal(events.filter(event => event.kind === 'duty' && event.date === '25/10/2032').length, expected.filter(day => !day[5].length).length);
      assert.deepEqual(flights.map(event => [event.flightNumber, event.leg.workType]), expected.flatMap(day => day[5]));
      assert.equal(roster.rawText, fullText, 'original source text is intact');
      assert.equal(JSON.stringify({ tokens, rows }), before, 'input tokens and visual rows are immutable');
      for (const [type, start, end, reportSource, endSource] of expected) {
        const day = events.map(event => event.publishedDay).find(item => item?.date === '25/10/2032' && item.type === type && item.dutyReport === start && item.dutyDebrief === end);
        assert.equal(day.publishedClockEvidence.dutyReport, start);
        assert.equal(day.publishedClockEvidence.dutyDebrief, end);
        assert.equal(day.publishedClockEvidence.dutyReportSource, reportSource);
        assert.equal(day.publishedClockEvidence.dutyDebriefSource, endSource);
      }
      if (label.startsWith('duplicated-slot source')) {
        assert.deepEqual(flights.map(event => [event.departure, event.arrival]), [['09:40', label.endsWith('08:50') ? '11:25' : '11:22'], ['12:05', '13:50']]);
        assert.equal(flights[0].leg.presentationTime, label.endsWith('without APZ') ? undefined : label.endsWith('08:50') ? '08:50' : '09:40');
        assert.equal(new Set(flights.map(event => event.journeyId)).size, 1);
      }
      if (label.includes('temporally proven')) {
        assert.equal(flights[1].leg.presentationTime, '14:00');
        assert.equal(flights[1].leg.dutyClockEvidence.reportSource, 'published');
      }
      if (expected === userExpected) {
        assert.equal(new Set(flights.map(event => event.journeyId)).size, 1, 'one journey, not a duplicate estimate');
        assert.equal(flights[0].presentation, '08:50');
        assert.equal(flights[0].startDateTime, '2032-10-25T12:40:00.000Z');
        const reserve = events.find(event => event.kind === 'duty' && event.flightNumber === 'ASB' && event.date === '25/10/2032');
        assert.equal(reserve.startDateTime, '2032-10-25T09:30:00.000Z');
        assert.equal(reserve.endDateTime, '2032-10-25T11:50:00.000Z');
      }
      publicCount += 1;
    } catch (error) { publicFailures.push({ label, long, withVisual, error: error.message }); }
  }
  assert.deepEqual(publicFailures, [], JSON.stringify(publicFailures, null, 2));
  console.log(`PASS public import/canonical: ${publicCount} short/full text/visual cases`);

  // Unavailable clocks stay unavailable; the next activity cannot supply them.
  for (const withVisual of [false, true]) {
    const tokens = ['HSB', 'BSB', '00:30', 'BSB', '03:30', 'ASB', 'BSB'];
    const columns = [{ date: '25Oct', tokens }, { date: '26Oct', tokens: ['DO'] }];
    const source = publicHeader + columns.map(col => col.date + '\n' + col.tokens.join('\n')).join('\n');
    const rows = columns.flatMap((col, index) => [col.date, ...col.tokens].map((str, row) => ({ page: 1, key: row, text: str, items: [{ str, x: 100 + index * 100, y: 800 - row * 15, page: 1 }] })));
    const days = aims.parseAimsRoster(source, withVisual ? rows : undefined).days.filter(day => day.date === '25/10/2032');
    assert.deepEqual(days.map(day => [day.type, day.dutyReport, day.dutyDebrief, day.dutyReportSource, day.dutyDebriefSource]), [
      ['HSB', '00:30', '03:30', 'published', 'published'], ['ASB', null, null, 'absent', 'absent'],
    ]);
  }
  const estimatedTokens = ['ASB', 'BSB', '04:10', 'CRM', 'BSB', '10:00', 'BSB', '12:00'];
  for (const read of [aims.parseAimsHumanBlock, aims.parseAimsVisualColumnDays]) {
    const days = read(estimatedTokens, { ...context, rawBlock: estimatedTokens.join(' ') });
    assert.equal(days[0].dutyReport, '04:10');
    assert.equal(days[0].dutyDebriefSource, 'estimated', 'missing release cannot become published from the next activity');
    assert.equal(days[1].dutyReport, '10:00');
    assert.equal(days[1].dutyDebrief, '12:00');
  }

  // Date ownership is the published column, including a different month/year.
  for (const [header, firstMarker, firstDate, nextMarker, nextDate] of [
    [publicHeader, '31Oct', '31/10/2032', '01Nov', '01/11/2032'],
    [publicHeader.replace('01/10/2032 até 31/10/2032', '01/12/2032 até 31/12/2032'), '31Dec', '31/12/2032', '01Jan', '01/01/2033'],
  ]) for (const withVisual of [false, true]) {
    const columns = [
      { date: firstMarker, tokens: ['HSB', 'BSB', '00:30', 'BSB', '03:30', 'ASB', 'BSB', '04:10', 'BSB', '08:00'] },
      { date: nextMarker, tokens: ['ASB', 'BSB', '03:00', 'BSB', '07:00', 'CRM', 'BSB', '09:00', 'BSB', '12:00'] },
    ];
    const source = header + columns.map(col => col.date + '\n' + col.tokens.join('\n')).join('\n');
    const rows = columns.flatMap((col, index) => [col.date, ...col.tokens].map((str, row) => ({ page: 1, key: row, text: str, items: [{ str, x: 100 + index * 100, y: 800 - row * 15, page: 1 }] })));
    const roster = aims.parseAimsRoster(source, withVisual ? rows : undefined);
    assert.deepEqual(roster.days.map(day => [day.date, day.type, day.dutyReport, day.dutyDebrief]), [
      [firstDate, 'HSB', '00:30', '03:30'], [firstDate, 'ASB', '04:10', '08:00'],
      [nextDate, 'ASB', '03:00', '07:00'], [nextDate, 'CRM', '09:00', '12:00'],
    ]);
    const events = canonical.buildCanonicalRosterEvents(roster).filter(event => event.kind === 'duty');
    assert.equal(events.length, 4);
    assert.equal(new Set(events.map(event => event.id)).size, 4);
    assert.deepEqual(events.map(event => event.date), [firstDate, firstDate, nextDate, nextDate]);
    assert.equal(roster.rawText, source);
  }
  console.log('PASS no-flight duties: missing-clock provenance and month/year column ownership');

} finally {
  cleanup();
  fs.rmSync(serverDir, { recursive: true, force: true });
}
console.log('PASS AIMS activity before flight: ASB/HSB/CRM kept before journeys (same day, after a "(...)" continuation, across midnight) in the visual column and text fallback, matching the server token parser; continuation-only journey and bare-clock ASB unchanged');
