import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { prepareConciergeCanonicalBridge } from './p1-concierge-journey/bridge.mjs';

const hashes = prepareConciergeCanonicalBridge();
for (const [name, hash] of Object.entries(hashes)) {
  assert.equal(hash, createHash('sha256').update(fs.readFileSync(`client/src/lib/${name}`)).digest('hex'));
}
const { buildCanonicalRosterEvents } = await import('../server/concierge/generated/canonicalRoster.mjs');
const { conciergeJourneyProgramRecords: records, conciergeNextJourneyProgram: next, projectConciergeJourneyPrograms: project } = await import('../server/concierge/journey-programs.mjs');
const { buildProgramSummary } = await import('../server/v1404/telegram-language.mjs');

// Synthetic identities, routes and clock values only. This adapts the existing
// P0 midnight-presentation fixture without copying any user's roster.
const leg = (id, origin, destination, departureTime, arrivalTime, extra = {}) => ({ flightNumber: `SYNTH-${id}`, origin, destination, departureTime, arrivalTime, workType: 'OP', ...extra });
const day = (date, dutyReport, dutyDebrief, legs, extra = {}) => {
  const [dayNumber, month, year] = date.split('/').map(Number);
  return { date, dayNumber, month, year, dayOfWeek: '', type: 'VOO', pairingCode: legs[0]?.flightNumber || '', dutyReport, dutyDebrief, dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'AAA', rawText: '', legs, ...extra };
};
const fixture = (days) => ({ month: 10, year: 2099, base: 'AAA', rank: 'CCM', rawText: '', days });
const midnight = fixture([
  day('04/10/2099', '02:40', '06:25', [leg('EARLIER', 'BBB', 'CCC', '02:40', '05:55')]),
  day('04/10/2099', '23:18', '03:20', [leg('MIDNIGHT', 'CCC', 'DDD', '00:05', '03:20')]),
  day('05/10/2099', '04:20', '07:35', [leg('CONTINUATION', 'DDD', 'AAA', '04:20', '07:05')]),
]);
const before = JSON.stringify(midnight);
const at = new Date('2099-10-04T12:00:00Z');
const chosen = next(midnight, [], at);
assert.deepEqual(chosen.legs.map((item) => item.flightNumber), ['SYNTH-MIDNIGHT', 'SYNTH-CONTINUATION']);
assert.equal(chosen.startTime, '23:18');
assert.equal(chosen.start.toISOString(), '2099-10-05T02:18:00.000Z');
assert.equal(chosen.endTime, '07:35');
assert.equal(chosen.end.toISOString(), '2099-10-05T10:35:00.000Z');
assert.equal(chosen.legs.at(-1).destination, 'AAA');
assert.equal(chosen.endKind, 'duty-debrief');
assert.equal(next(midnight, [], new Date('2099-10-05T06:50:00Z')).journeyId, chosen.journeyId, 'connection is still one current program');
assert.equal(next(midnight, [], new Date('2099-10-06T12:00:00Z')), null, 'no past fallback');
assert.equal(JSON.stringify(midnight), before, 'no input mutation');
const canonical = buildCanonicalRosterEvents(midnight).filter((event) => event.kind === 'flight');
assert.deepEqual(chosen.canonicalEventIds, canonical.filter((event) => event.journeyId === chosen.journeyId).map((event) => event.id));
const summary = buildProgramSummary({ record: chosen, label: 'A próxima programação', presentationTime: chosen.startTime, includeGreeting: false });
assert.match(summary, /2 pernas/);
assert.match(summary, /Na perna 2/);
assert.match(summary, /AAA/);

// Existing canonical boundaries must remain authoritative: new APZ, real rest,
// physical discontinuity, and two real journeys inside one published day.
const cases = [
  { name: 'new presentation', report: '04:00', dep: '04:20', origin: 'DDD' },
  { name: 'rest boundary', report: '15:20', dep: '15:20', origin: 'DDD' },
  { name: 'physical discontinuity', report: '04:20', dep: '04:20', origin: 'EEE' },
];
for (const item of cases) {
  const source = fixture([midnight.days[1], day('05/10/2099', item.report, '18:00', [leg(item.name, item.origin, 'AAA', item.dep, '17:30')])]);
  assert.equal(records(source).length, 2, item.name);
  assert.equal(next(source, [], at).legs.length, 1, item.name);
}
const twoInDay = fixture([day('06/10/2099', '05:00', '22:00', [
  leg('ONE', 'AAA', 'BBB', '06:00', '08:00'),
  leg('TWO', 'BBB', 'CCC', '20:00', '21:30', { presentationTime: '19:10' }),
])]);
const split = records(twoInDay);
assert.equal(split.length, 2);
assert.equal(split[0].endTime, '08:00', 'first journey cannot inherit final debrief of second journey');
assert.equal(split[0].endKind, 'arrival');
assert.equal(split[1].endTime, '22:00');
assert.match(buildProgramSummary({ record: split[0], includeGreeting: false }), /fim publicado da jornada não está confirmado/);

assert.equal(records(fixture([day('06/10/2099', '05:00', '8:35', [leg('SHORT-CLOCK', 'AAA', 'BBB', '06:00', '08:00')])]))[0].endTime, '08:35');
for (const debrief of [null, '08:00']) {
  const unproved = records(fixture([day('06/10/2099', '05:00', debrief, [leg('UNPROVED', 'AAA', 'BBB', '06:00', '08:00')])]))[0];
  assert.equal(unproved.endKind, 'arrival', 'missing/arrival-equal debrief is not published endpoint proof');
}
const invalidDebrief = fixture([
  day('06/10/2099', '05:00', '07:30', [leg('INVALID-END', 'AAA', 'BBB', '06:00', '08:00')]),
  day('06/10/2099', '09:00', '12:30', [leg('NEXT-DUTY', 'BBB', 'CCC', '10:00', '12:00')]),
]);
const invalidPrograms = records(invalidDebrief);
assert.equal(invalidPrograms[0].endKind, 'arrival', 'debrief before arrival cannot wrap through next canonical boundary');
assert.equal(invalidPrograms[0].end.toISOString(), '2099-10-06T11:00:00.000Z');
assert.equal(next(invalidDebrief, [], new Date('2099-10-06T13:00:00Z')).legs[0].flightNumber, 'SYNTH-NEXT-DUTY', 'earlier invalid endpoint must not hide the current later journey');
const noRestBoundary = fixture([
  day('06/10/2099', '05:00', '09:30', [leg('OVERLAPPING-END', 'AAA', 'BBB', '06:00', '08:00')]),
  day('06/10/2099', '09:00', '12:30', [leg('NEW-STATION', 'EEE', 'CCC', '10:00', '12:00')]),
]);
assert.equal(buildCanonicalRosterEvents(noRestBoundary).some((event) => event.kind === 'journey-rest'), false, 'control has no rest event to supply the boundary');
assert.equal(records(noRestBoundary)[0].endKind, 'arrival', 'debrief must not overlap the next presentation, even before that flight departs');
assert.equal(next(noRestBoundary, [], new Date('2099-10-06T12:15:00Z')).legs[0].flightNumber, 'SYNTH-NEW-STATION');
const lastUnprovedWrap = fixture([day('06/10/2099', '21:00', '00:30', [leg('UNPROVED-WRAP', 'AAA', 'BBB', '22:00', '23:50')])]);
assert.equal(records(lastUnprovedWrap)[0].endKind, 'arrival', 'no evidence for a final debrief day offset is not invented');
const provedWrap = fixture([
  lastUnprovedWrap.days[0],
  day('07/10/2099', '03:00', '06:30', [leg('AFTER-WRAP', 'BBB', 'CCC', '04:00', '06:00')]),
]);
const proof = buildCanonicalRosterEvents(provedWrap).find((event) => event.kind === 'journey-rest');
assert.equal(proof.startDateTime, '2099-10-07T03:30:00.000Z');
assert.equal(records(provedWrap)[0].end.toISOString(), proof.startDateTime, 'proved canonical midnight debrief is retained');

const duty = { day: { date: '04/10/2099', type: 'ASB', dutyReport: '10:00', dutyDebrief: '14:00', legs: [] }, code: 'ASB', legs: [], startTime: '10:00', endTime: '14:00', start: new Date('2099-10-04T13:00:00Z'), end: new Date('2099-10-04T17:00:00Z') };
assert.equal(next(midnight, [duty], at), duty, 'independent nonflight duty preserved exactly');
assert.equal(records(midnight, [duty]).filter((record) => !record.legs.length).length, 1);
assert.throws(() => project([{ kind: 'flight', journeyId: '', leg: {} }]), /incomplete canonical/);

// Exercise the real regulation function with unchanged table/formula code.
const source = fs.readFileSync('server.mjs', 'utf8');
const regulation = fs.readFileSync('scripts/v1432/server-regulation.snippet', 'utf8');
const functions = ['conciergeRosterDayParts', 'conciergeTime', 'conciergeProgramDate', 'conciergePresentationTime'].map((name) => {
  const start = source.indexOf(`function ${name}(`); const end = source.indexOf('\n}', start) + 2;
  assert.ok(start >= 0 && end > start, name); return source.slice(start, end);
}).join('\n');
const calculate = vm.runInNewContext(`${functions}\n${regulation}\nconciergeRegulationForRecord`, { Date, Intl });
assert.equal(calculate(chosen).sectors, 2, 'regulation consumes complete canonical sectors');
assert.equal(calculate(chosen).startText, '23:18');
// This asserts software compatibility only, never legal validity.
assert.equal(calculate(chosen).dutyLimitMinutes, calculate({ ...chosen, legs: [chosen.legs[0]] }).dutyLimitMinutes, 'existing B.1 one/two sector column stays unchanged');

if (source.includes("from './server/concierge/journey-programs.mjs'")) {
  const names = ['conciergeScheduleReply', 'conciergePremiumScheduleReply', 'conciergeRegulationReply'];
  for (const name of names) {
    const start = source.indexOf(`function ${name}(`); const end = source.indexOf('\n}', start) + 2;
    assert.ok(start >= 0 && end > start, name);
    const body = source.slice(start, end);
    assert.match(body, /concierge(?:NextJourneyProgram|JourneyProgramRecords)/, name);
    assert.doesNotMatch(body, /const next = conciergeNextProgram\(roster\)/, name);
  }
  assert.match(source, /Fim limite calculado:/);
  assert.match(source, /conciergeJourneyEndText\(record\)/);
  // The unrelated selector remains an unchanged day-record consumer.
  const start = source.indexOf('function conciergeNextProgram('); const end = source.indexOf('\n}', start) + 2;
  assert.match(source.slice(start, end), /const records = conciergeProgramRecords\(roster\)/);
  const namesForRuntime = ['conciergeRosterDayParts', 'conciergeTime', 'conciergeProgramDate', 'conciergeProgramRecords', 'conciergeNextProgram', 'conciergePresentationTime', 'conciergeDateKey', 'conciergeRecordDateKey', 'conciergeDateLabel', 'conciergeProgramTitle', 'conciergeFormatProgram', 'conciergePremiumScheduleReply', 'conciergeScheduleReply', 'conciergeRegulationReply'];
  const code = namesForRuntime.map((name) => {
    const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
    assert.ok(match, name); const end = source.indexOf('\n}', match.index) + 2;
    return source.slice(match.index, end);
  }).join('\n');
  let runtimeAt = at;
  class TestDate extends Date { constructor(...args) { super(...(args.length ? args : [runtimeAt.getTime()])); } static now() { return runtimeAt.getTime(); } }
  const { conciergeJourneyEndText } = await import('../server/concierge/journey-programs.mjs');
  const runtime = vm.runInNewContext(`${code}\n({ premium: conciergePremiumScheduleReply, basic: conciergeScheduleReply, regulation: conciergeRegulationReply })`, {
    Date: TestDate, Intl, conciergeInactiveCodes: new Set(['DO', 'VC']),
    conciergeNextJourneyProgram: (roster, legacy) => next(roster, legacy, runtimeAt),
    conciergeJourneyProgramRecords: records, conciergeJourneyEndText,
    conciergeRegulationForRecord: calculate, buildProgramSummary,
    premiumGreeting: () => 'Olá.', normalizeFlightRaw: (value) => String(value),
  });
  const actualPremium = await runtime.premium({ roster: midnight }, 'next', {});
  assert.match(actualPremium, /2 pernas/); assert.match(actualPremium, /Na perna 2/);
  const actualBasic = runtime.basic({ roster: midnight }, 'next');
  assert.match(actualBasic, /SYNTH-CONTINUATION/); assert.match(actualBasic, /07:35/);
  const actualRegulation = runtime.regulation({ roster: midnight });
  assert.match(actualRegulation, /23:18 · 2 etapa/);
  assert.match(actualRegulation, /Fim publicado da programação: 07:35/);
  assert.match(actualRegulation, /Fim limite calculado:/);
  for (const now of ['2099-10-05T06:50:00Z', '2099-10-05T08:00:00Z']) {
    runtimeAt = new Date(now);
    const carryOver = runtime.regulation({ roster: midnight });
    assert.match(carryOver, /23:18 · 2 etapa/, 'active overnight journey remains in today regulation');
    assert.match(carryOver, /SYNTH-CONTINUATION/);
  }
  runtimeAt = new Date('2099-10-05T12:00:00Z');
  assert.doesNotMatch(runtime.regulation({ roster: midnight }), /SYNTH-MIDNIGHT/, 'completed previous-day journey is excluded');
}

if (process.env.CREWCHECK_CANONICAL_PARITY === '1') {
  const { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB } = await import('./lib/ts-module-harness.mjs');
  const harness = loadClientModules({ prefix: 'concierge-canonical-parity-', stubs: TYPE_ONLY_PDF_PARSER_STUB, files: ['client/src/lib/canonicalRoster.ts', 'client/src/lib/rosterContinuity.ts'] });
  try { assert.deepEqual(buildCanonicalRosterEvents(midnight), harness.load('canonicalRoster').buildCanonicalRosterEvents(midnight)); } finally { harness.cleanup(); }
}
console.log('PASS canonical Concierge journey projection, boundaries, end provenance, nonflight independence, and unchanged regulation formula.');
