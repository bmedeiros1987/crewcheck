// A standby/reserve whose clocks have no station (availabilityUnresolved) is not a light day and not
// free time. From the public parser, on RAW and on PREPARED sources (node scripts/v139/apply.mjs):
//  - analyzeDayLoads keeps every item in the timeline but leaves the whole pending DATE out of every
//    aggregate (a published item on the same date included); the month says so ('partial'), and with
//    nothing measurable left it is 'indeterminate' (null score, grade "Indeterminada"), never 0/100
//    "Excelente" from an empty average; an unknown carry-in from another month guards
//    recommendations (pendingAvailabilityDates) without making this month partial;
//  - getGymRecommendations gives no timed suggestion on that date and does not take it as a light
//    neighbour, so nothing reaches the PDF, the ICS file or the Google Calendar conversion;
//  - consumers say partial/pending: compliance summary, PDF (timeline "pendente", gym note), e-mail
//    text, local history stats (null, not 0), Home report card (PT + EN translator);
//  - the ICS keeps the published activity as a tentative day marker (no invented time, no 24 h duty,
//    not blocking, no alarm, only in modes that export duties, UID of the duty slot), and a published
//    flight on the same date keeps its own report time (APZ);
//  - the Google conversion keeps that marker tentative and silent (no default reminders), while
//    ordinary events convert as before;
//  - published station windows (control) are unchanged.
// Synthetic AIMS text only. No network: fetch is a local double (Google/e-mail are never called for
// real); the PDF runs against a recording jsPDF double. Mutants of the guards must fail by assertion.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { setMaxListeners } from 'node:events';

const prepared = /account-active-reconciliation-fenced-v1/.test(fs.readFileSync('client/src/pages/Home.tsx', 'utf8'));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pending-availability-'));
const lib = file => path.resolve('client/src/lib', file);

// Offline environment: storage shims, a window without network, fetch recorded and never sent.
const memory = () => { const map = new Map(); return { getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), clear: () => map.clear(), key: index => [...map.keys()][index] ?? null, get length() { return map.size; } }; };
globalThis.localStorage = memory(); globalThis.sessionStorage = memory();
globalThis.window = globalThis; globalThis.location = { origin: 'http://qa.local', href: 'http://qa.local/' };
const events$ = new EventTarget(); globalThis.addEventListener = events$.addEventListener.bind(events$); globalThis.removeEventListener = events$.removeEventListener.bind(events$); globalThis.dispatchEvent = events$.dispatchEvent.bind(events$); setMaxListeners(200, events$);
globalThis.FileReader = class { readAsDataURL(blob) { blob.arrayBuffer().then(buffer => { this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`; this.onload?.(); }, () => this.onerror?.()); } };
const requests = [];
globalThis.fetch = async (url, init = {}) => { requests.push({ url: String(url), body: init.body ? String(init.body) : '' }); return new Response(JSON.stringify({ ok: true, provider: 'qa-double' }), { status: 200, headers: { 'content-type': 'application/json' } }); };

let counter = 0;
async function load(overrides = {}) {
  const out = path.join(dir, `bundle-${counter++}.mjs`);
  const append = {
    [lib('databaseClient.ts')]: '\nexport { summarizePeriods as __qaSummarizePeriods };\n',
    [lib('googleCalendarSync.ts')]: '\nexport { parseIcalEvents as __qaParseIcalEvents };\n',
  };
  await build({
    stdin: { contents: [
      "export { parseAimsRoster } from './client/src/lib/aimsParser';",
      "export { analyzeDayLoads, getGymRecommendations, analyzeCompliance } from './client/src/lib/complianceEngine';",
      "export { generateICalendar } from './client/src/lib/calendarExport';",
      "export { exportReport } from './client/src/lib/pdfExport';",
      "export { sendRosterByEmail } from './client/src/lib/emailClient';",
      "export { __qaSummarizePeriods } from './client/src/lib/databaseClient';",
      "export { __qaParseIcalEvents } from './client/src/lib/googleCalendarSync';",
    ].join('\n'), resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { '@': path.resolve('client/src'), '@shared': path.resolve('shared') },
    define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'qa', setup(b) {
      // Recording jsPDF double: keeps every text and table body, draws nothing.
      b.onResolve({ filter: /^jspdf(-autotable)?$/ }, args => ({ path: args.path, namespace: 'qa' }));
      b.onLoad({ filter: /^jspdf$/, namespace: 'qa' }, () => ({ loader: 'js', contents: `
        export class jsPDF { constructor() { const rec = globalThis.__pdf = { texts: [], tables: [] };
          this.internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 }, getNumberOfPages: () => 1 };
          return new Proxy(this, { get: (target, key) => key in target ? target[key]
            : key === 'text' ? (value) => { rec.texts.push([].concat(value).join(' ')); }
            : key === 'splitTextToSize' ? (value) => [String(value)]
            : key === 'getNumberOfPages' ? () => 1
            : key === 'getTextWidth' ? () => 10
            : key === 'output' ? () => new Blob(['%PDF-qa'], { type: 'application/pdf' })
            : () => undefined }); } }` }));
      b.onLoad({ filter: /^jspdf-autotable$/, namespace: 'qa' }, () => ({ loader: 'js', contents: 'export default function autoTable(doc, options) { globalThis.__pdf.tables.push({ head: options.head, body: options.body }); doc.lastAutoTable = { finalY: 120 }; }' }));
      b.onLoad({ filter: /client[\\/]src[\\/]lib[\\/].*\.ts$/ }, args => {
        let contents = fs.readFileSync(args.path, 'utf8');
        for (const [from, to] of overrides[args.path] || []) { assert(contents.includes(from), `mutant anchor present in ${path.basename(args.path)}: ${from.slice(0, 70)}`); contents = contents.replace(from, to); }
        return { loader: 'ts', contents: contents + (append[args.path] || '') };
      });
    } }],
  });
  return import(pathToFileURL(out).href);
}

const header = 'Escala de Tripulante Convertida para padrão AIMS\nTripulante: TRIPULANTE SINTETICO -BP:00000000 -Base: BSB -16/08/2026 até18/08/2026 -Timezone Brasília (-3)\n\n';
const flight16 = '16Aug Sun LA 3700 05:00 05:45 BSB GRU 07:30 LA 3701 08:30 GRU BSB 10:15 LA 3702 11:00 BSB REC 14:00\n';
const ROSTERS = {
  mixedHsb: header + flight16 + '17Aug Mon HSB 06:00 20:00\n18Aug Tue DO\n',
  mixedAsb: header + flight16 + '17Aug Mon ASB 06:00 20:00\n18Aug Tue DO\n',
  allUnknown: header + '16Aug Sun HSB 06:00 20:00\n17Aug Mon ASB 06:00 20:00\n18Aug Tue DO\n',
  allUnknownOnly: header + '16Aug Sun HSB 06:00 20:00\n17Aug Mon ASB 06:00 20:00\n',
  published: header + flight16 + '17Aug Mon HSB BSB 06:00 BSB 20:00\n18Aug Tue DO\n',
  sameDateFlight: header + '17Aug Mon HSB 06:00 09:00 LA 3730 09:25 10:15 BSB FOR 12:55\n',
};
const clone = value => JSON.parse(JSON.stringify(value));
const events = ics => ics.split('BEGIN:VEVENT').slice(1).map(block => ({ block, uid: /UID:([^\n]*)/.exec(block)[1], start: /DTSTART([^\n]*)/.exec(block)[1], summary: /SUMMARY:([^\n]*)/.exec(block)[1] }));
const onDate = (list, ymd) => list.filter(event => event.start.includes(ymd));

async function suite(M) {
  const run = name => {
    const roster = M.parseAimsRoster(ROSTERS[name]);
    const load = M.analyzeDayLoads(clone(roster));
    const gym = M.getGymRecommendations(clone(roster));
    const compliance = M.analyzeCompliance(clone(roster), 'cabin');
    return { roster, load, gym, compliance };
  };

  // Mixed known + unknown (HSB and ASB): pending day kept in the timeline, out of the aggregates.
  for (const name of ['mixedHsb', 'mixedAsb']) {
    const { roster, load, gym, compliance } = run(name);
    const day17 = load.days.find(day => day.date === '17/08/2026');
    assert.ok(day17 && day17.availabilityUnresolved && ['HSB', 'ASB'].includes(day17.type), `${name}: the published activity stays in the timeline, marked unresolved`);
    assert.equal(roster.days.find(day => day.date === '17/08/2026')?.type, day17.type, `${name}: roster day preserved`);
    assert.deepEqual(load.pendingAvailabilityDates, ['17/08/2026'], `${name}: pending date reported`);
    assert.equal(load.aggregateStatus, 'partial', `${name}: aggregates are explicitly partial`);
    assert.equal(typeof load.intensityScore, 'number', `${name}: known days still measured`);
    assert.ok(!load.easiestDays.some(day => day.date === '17/08/2026') && !load.hardestDays.some(day => day.date === '17/08/2026'), `${name}: pending date in no aggregate list`);
    assert.match(load.summary, /Resultado parcial: 17\/08\/2026 com disponibilidade pendente/, `${name}: load summary says partial`);
    assert.match(compliance.summary, /\(\d+\/100 de puxada, parcial\)/, `${name}: compliance summary says partial`);
    assert.ok(!gym.some(item => item.date === '17/08/2026'), `${name}: no gym suggestion on the pending date`);
    assert.notEqual(gym.find(item => item.date === '18/08/2026')?.availability, 'ideal', `${name}: an unknown neighbour is not taken as a light day`);
    assert.ok(gym.some(item => item.date === '18/08/2026'), `${name}: the published day off keeps its suggestion`);
  }

  // All unknown: nothing to average -> indeterminate, never 0/100 or "Excelente".
  for (const name of ['allUnknown', 'allUnknownOnly']) {
    const { load, gym, compliance } = run(name);
    assert.deepEqual(load.pendingAvailabilityDates, ['16/08/2026', '17/08/2026'], `${name}: pending dates`);
    assert.equal(load.aggregateStatus, 'indeterminate', `${name}: indeterminate`);
    assert.equal(load.intensityScore, null, `${name}: no intensity from an empty average`);
    assert.equal(load.recoveryScore, null, `${name}: no recovery from an empty average`);
    assert.equal(load.grade, 'Indeterminada', `${name}: grade is not Excelente`);
    assert.doesNotMatch(`${load.summary} ${compliance.summary}`, /excelente|\b0\/100|null/i, `${name}: no excellent/zero/null text`);
    assert.match(compliance.summary, /indeterminada \(disponibilidade pendente\)/, `${name}: compliance summary says indeterminate`);
    assert.equal(load.days.filter(day => day.availabilityUnresolved).length, 2, `${name}: both activities kept in the timeline`);
    assert.ok(!gym.some(item => ['16/08/2026', '17/08/2026'].includes(item.date)), `${name}: no gym suggestion on pending dates`);
  }

  // Same date, unknown item + published item (synthetic CrewRoster): the whole date is unmeasurable.
  {
    const roster = M.parseAimsRoster(ROSTERS.mixedHsb);
    const unknown17 = roster.days.find(day => day.date === '17/08/2026');
    roster.days.push({ ...clone(unknown17), type: 'ASB', pairingCode: 'ASB', dutyReport: '06:00', dutyDebrief: '09:00', dutyReportSource: 'published', dutyDebriefSource: 'published', rawText: 'ASB BSB 06:00 BSB 09:00' });
    const load = M.analyzeDayLoads(clone(roster)), gym = M.getGymRecommendations(clone(roster));
    assert.equal(load.days.filter(day => day.date === '17/08/2026').length, 2, 'same date: both items stay in the timeline');
    assert.ok(load.days.some(day => day.date === '17/08/2026' && day.type === 'ASB' && day.dutyStartTime === '06:00' && !day.availabilityUnresolved), 'same date: the published item keeps its times');
    assert.ok(![...load.easiestDays, ...load.hardestDays].some(day => day.date === '17/08/2026'), 'same date: the pending date is out of every aggregate list, not only its unknown item');
    assert.deepEqual([load.aggregateStatus, load.aggregatePendingDates], ['partial', ['17/08/2026']], 'same date: partial');
    assert.ok(!gym.some(item => item.date === '17/08/2026'), 'same date: no gym suggestion');
  }
  // Same date, pending HSB + published flight: daily availability is unknown, so the day's total load
  // cannot be graded (only day worked -> 'Indeterminada'); the flight itself is untouched: same
  // timeline values, report time (APZ), flight/duty hours and regulatory flight-hour total as the
  // same roster without the pending HSB.
  {
    const roster = M.parseAimsRoster(ROSTERS.sameDateFlight);
    const withoutPending = { ...clone(roster), days: clone(roster).days.filter(day => !(day.date === '17/08/2026' && day.dutyReportSource === 'unknown')) };
    assert.equal(withoutPending.days.length, roster.days.length - 1, 'counterpart roster without the pending HSB');
    const load = M.analyzeDayLoads(clone(roster)), loadKnown = M.analyzeDayLoads(clone(withoutPending));
    assert.deepEqual([load.intensityScore, load.grade, load.aggregateStatus], [null, 'Indeterminada', 'indeterminate'], 'same-date flight: wellbeing load indeterminate, never "Boa"');
    assert.equal(typeof loadKnown.intensityScore, 'number', 'counterpart: measurable');
    const flight = days => days.find(day => day.date === '17/08/2026' && day.type === 'VOO');
    const pick = day => day && { flightHours: day.flightHours, dutyHours: day.dutyHours, dutyStartTime: day.dutyStartTime, dutyEndTime: day.dutyEndTime, sectors: day.sectors, isDutyNextDay: day.isDutyNextDay };
    assert.ok(flight(load.days), 'same-date flight: kept in the timeline');
    assert.deepEqual(pick(flight(load.days)), pick(flight(loadKnown.days)), 'same-date flight: timeline values unchanged');
    const rosterFlight = roster.days.find(day => day.date === '17/08/2026' && day.type === 'VOO');
    assert.deepEqual([rosterFlight.dutyReport, rosterFlight.dutyReportSource], ['09:25', 'published'], 'same-date flight: published APZ kept');
    const compliance = M.analyzeCompliance(clone(roster), 'cabin'), complianceKnown = M.analyzeCompliance(clone(withoutPending), 'cabin');
    assert.equal(compliance.metrics.totalFlightHours, complianceKnown.metrics.totalFlightHours, 'same-date flight: flight-hour total unchanged');
  }
  // Carry-in from another month: guards recommendations, does not make this month's aggregates partial.
  {
    const roster = M.parseAimsRoster(header.replace('-16/08/2026 até18/08/2026', '-31/07/2026 até18/08/2026') + '31Jul Fri HSB 06:00 20:00\n' + flight16 + '17Aug Mon HSB BSB 06:00 BSB 20:00\n18Aug Tue DO\n');
    roster.year = 2026; roster.month = 8;
    assert.ok(roster.days.some(day => day.date === '31/07/2026' && day.dutyReportSource === 'unknown'), 'carry-in: unknown 31/07 parsed');
    const load = M.analyzeDayLoads(clone(roster)), gym = M.getGymRecommendations(clone(roster)), compliance = M.analyzeCompliance(clone(roster), 'cabin');
    assert.deepEqual(load.pendingAvailabilityDates, ['31/07/2026'], 'carry-in: global pending date kept');
    assert.deepEqual([load.aggregateStatus, load.aggregatePendingDates, typeof load.intensityScore], [undefined, undefined, 'number'], 'carry-in: August aggregates not partial');
    assert.doesNotMatch(`${load.summary} ${compliance.summary}`, /parcial|indeterminad/, 'carry-in: August summary not partial');
    assert.ok(load.days.some(day => day.date === '31/07/2026' && day.availabilityUnresolved), 'carry-in: kept in the timeline');
    assert.ok(!gym.some(item => item.date === '31/07/2026'), 'carry-in: no gym suggestion on the unknown date');
  }

  // Control: published station window unchanged (no pending, timed suggestion and duty events).
  const control = run('published');
  assert.equal(control.load.pendingAvailabilityDates, undefined, 'control: nothing pending');
  assert.equal(control.load.aggregateStatus, undefined, 'control: complete aggregates');
  assert.doesNotMatch(control.compliance.summary, /parcial|indeterminad/, 'control: summary unchanged');
  assert.ok(control.gym.some(item => item.date === '17/08/2026' && item.suggestedTime), 'control: published standby keeps its gym suggestion');
  assert.equal(control.gym.find(item => item.date === '18/08/2026')?.availability, 'ideal', 'control: day off after a published standby stays ideal');
  const controlAll = events(M.generateICalendar(control.roster, control.gym, { mode: 'all' }));
  assert.ok(onDate(controlAll, '20260817T0600').length >= 1, 'control: timed duty event at the published 06:00');
  assert.ok(!controlAll.some(event => /horário pendente/.test(event.summary)), 'control: no pending marker');

  // ICS / Google: the gym filter runs before any export; the activity stays as a tentative marker.
  const mixed = run('mixedHsb');
  const gymIcs = events(M.generateICalendar(mixed.roster, mixed.gym, { mode: 'gym' }));
  assert.equal(onDate(gymIcs, '20260817').length, 0, 'ICS gym: nothing on the pending date');
  assert.ok(onDate(gymIcs, '20260818').length === 1, 'ICS gym: the day off keeps its event');
  for (const mode of ['all', 'duties']) {
    const ics = events(M.generateICalendar(mixed.roster, mixed.gym, { mode }));
    const marker = onDate(ics, '20260817');
    assert.equal(marker.length, 1, `ICS ${mode}: one item on the pending date`);
    const [{ block, uid, start, summary }] = marker;
    assert.equal(start, ';VALUE=DATE:20260817', `ICS ${mode}: day marker, no invented clock`);
    assert.match(summary, /^HSB · Home Stand By · horário pendente$/, `ICS ${mode}: summary`);
    assert.match(block, /STATUS:TENTATIVE\nTRANSP:TRANSPARENT\nX-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE/, `ICS ${mode}: tentative, not blocking, not confirmed`);
    assert.doesNotMatch(block, /BEGIN:VALARM|STATUS:CONFIRMED|BUSYSTATUS:(FREE|BUSY)|TRANSP:OPAQUE/, `ICS ${mode}: no alarm, not confirmed, neither free nor busy`);
    assert.match(block, /não jornada de 24 h nem horário confirmado/, `ICS ${mode}: says it is not a 24 h duty`);
    const index = mixed.roster.days.findIndex(day => day.date === '17/08/2026');
    assert.ok(uid.endsWith(`-duty-${index}@crewcheck.local`) || uid.includes(`-duty-${index}`), `ICS ${mode}: UID of the duty slot (${uid})`);
    const again = events(M.generateICalendar(mixed.roster, mixed.gym, { mode }));
    assert.equal(onDate(again, '20260817')[0].uid, uid, `ICS ${mode}: UID stable across exports`);
  }
  for (const mode of ['flights', 'flights-rest', 'rest', 'gym', 'routine']) {
    assert.ok(!events(M.generateICalendar(mixed.roster, mixed.gym, { mode })).some(event => /horário pendente/.test(event.summary)), `ICS ${mode}: export toggle respected (no marker)`);
  }
  // Published flight on the same date keeps its own report time; the marker never replaces it.
  const same = run('sameDateFlight');
  for (const mode of ['all', 'flights']) {
    const ics = events(M.generateICalendar(same.roster, same.gym, { mode }));
    const pairing = ics.find(event => /pairing/.test(event.uid));
    assert.ok(pairing && pairing.start.endsWith('20260817T092500') && /STATUS:CONFIRMED\nTRANSP:OPAQUE|TRANSP:OPAQUE/.test(pairing.block), `ICS ${mode}: published flight keeps APZ 09:25`);
    assert.equal(ics.filter(event => /horário pendente/.test(event.summary)).length, mode === 'all' ? 1 : 0, `ICS ${mode}: one pending marker beside the flight, none in flights mode`);
  }
  // Google conversion of the same ICS (local, no request): transparent all-day, no gym on 17.
  const google = M.__qaParseIcalEvents(M.generateICalendar(mixed.roster, mixed.gym, { mode: 'all' }), 'qa');
  const googleMarker = google.find(event => /horário pendente/.test(event.summary));
  assert.deepEqual([googleMarker?.start, googleMarker?.transparency], [{ date: '2026-08-17' }, 'transparent'], 'Google: all-day, transparent marker');
  assert.deepEqual([googleMarker.status, googleMarker.reminders], ['tentative', { useDefault: false, overrides: [] }], 'Google: marker tentative and silent (no default reminders)');
  const googleFlight = google.find(event => event.start?.dateTime?.startsWith('2026-08-16'));
  assert.ok(googleFlight && googleFlight.status === undefined && googleFlight.reminders.useDefault === false && googleFlight.reminders.overrides.length > 0, 'Google: published flight keeps its own reminders, no tentative status');
  const googleRest = google.find(event => event.start?.date === '2026-08-18');
  assert.deepEqual([googleRest?.status, googleRest?.reminders], [undefined, { useDefault: true }], 'Google: ordinary all-day event unchanged');
  assert.ok(!M.__qaParseIcalEvents(M.generateICalendar(mixed.roster, mixed.gym, { mode: 'gym' }), 'qa').some(event => event.start?.dateTime?.startsWith('2026-08-17')), 'Google: no gym event on the pending date');

  // PDF (recording double): pending in the timeline, gym note, no suggestion on the pending date.
  for (const [name, note] of [['mixedHsb', /Sem sugestão em 17\/08\/2026: disponibilidade pendente .* Indicadores de carga parciais\./], ['allUnknown', /Sem sugestão em 16\/08\/2026, 17\/08\/2026: .*Carga da escala indeterminada\./], ['published', null]]) {
    const { roster, gym, compliance } = run(name);
    await M.exportReport(clone(roster), compliance, gym);
    const timeline = globalThis.__pdf.tables.find(table => table.head?.[0]?.includes('Jornada'));
    const gymTable = globalThis.__pdf.tables.find(table => table.head?.[0]?.includes('Duração'));
    const row17 = timeline.body.find(row => row[0] === '17/08/2026');
    if (note) {
      assert.deepEqual([row17[3], row17[4]], ['pendente', 'pendente'], `PDF ${name}: start/end say pending`);
      assert.match(row17[6], /horário pendente \(sem estação\)/, `PDF ${name}: details say pending`);
      assert.match(globalThis.__pdf.texts.join('\n'), note, `PDF ${name}: gym section note`);
      assert.ok(!gymTable || !gymTable.body.some(row => compliance.loadAnalysis.pendingAvailabilityDates.includes(row[0])), `PDF ${name}: no gym row on a pending date`);
    } else {
      assert.deepEqual([row17[3], row17[4]], ['06:00', '20:00'], 'PDF control: published times');
      assert.doesNotMatch(globalThis.__pdf.texts.join('\n'), /Sem sugestão em/, 'PDF control: no pending note');
    }
  }

  // E-mail text (fetch double records the body; nothing leaves the process).
  const pdf = { blob: new Blob(['%PDF-qa'], { type: 'application/pdf' }), fileName: 'qa.pdf' };
  for (const [name, line] of [['mixedHsb', /Escala puxada: \d+ \/ 100 \(parcial: disponibilidade pendente em 17\/08\/2026\)/], ['allUnknown', /Escala puxada: indeterminada \(disponibilidade pendente em 16\/08\/2026, 17\/08\/2026\)/], ['published', /Escala puxada: \d+ \/ 100\n/]]) {
    const { roster, gym, compliance } = run(name);
    requests.length = 0;
    await M.sendRosterByEmail({ to: 'qa@example.test', roster, compliance, gym, attachment: pdf });
    assert.equal(requests.length, 1, `e-mail ${name}: one local request to the double`);
    const message = JSON.parse(requests[0].body).message;
    assert.match(message, line, `e-mail ${name}: load line`);
    assert.doesNotMatch(message, /null|undefined/, `e-mail ${name}: no null text`);
  }

  // Local history stats: an indeterminate period is null and stays out of the average.
  const period = (intensityScore) => ({ period: '2026-08', intensityScore, score: 90, alertsCount: 0, criticalAlertsCount: 0, flightSegments: 0, daysOff: 0, layovers: 0, standby: 0, reserve: 0, gymGoodDays: 0, gymAvoidDays: 0, heavyDays: 0 });
  assert.equal(M.__qaSummarizePeriods([period(null)]).avgIntensity, null, 'stats: only indeterminate -> null, not 0');
  assert.equal(M.__qaSummarizePeriods([period(null), period(60)]).avgIntensity, 60, 'stats: indeterminate period left out of the average');
  assert.equal(M.__qaSummarizePeriods([period(40), period(60)]).avgIntensity, 50, 'stats: known periods averaged as before');
}

await suite(await load());

// Finance never reads the wellbeing load: the allowance calculator and the financial libraries do not
// consume analyzeDayLoads/loadAnalysis, so an indeterminate load cannot change hours or amounts there.
{
  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  const start = home.indexOf('function calculatePerDiem('), end = home.indexOf('\n}\n', start);
  assert.ok(start > 0 && end > start, 'calculatePerDiem found');
  assert.doesNotMatch(home.slice(start, end), /analyzeDayLoads|loadAnalysis/, 'allowance calculator independent of the load indicator');
  for (const file of fs.readdirSync('client/src/lib').filter(name => /^(financial|compensation|salary|payroll).*\.ts$/.test(name))) {
    assert.doesNotMatch(fs.readFileSync(path.join('client/src/lib', file), 'utf8'), /analyzeDayLoads|loadAnalysis/, `${file} independent of the load indicator`);
  }
}

// Home report card (the shipped caller) and its English through the static translator.
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const card = home.slice(home.indexOf('<article><h2>Carga</h2>'), home.indexOf('</article>', home.indexOf('<article><h2>Carga</h2>')));
const NOTES = ['Índice indeterminado: disponibilidade pendente nos dias mensuráveis.', 'Índice parcial: datas com disponibilidade pendente fora do cálculo.', 'Índice de intensidade da escala.'];
assert.match(card, /aggregateStatus === 'indeterminate'/, 'Home card reads the indeterminate state');
assert.match(card, /aggregateStatus === 'partial'/, 'Home card reads the partial state');
const i18n = fs.readFileSync('client/src/lib/i18n.ts', 'utf8');
const en = i18n.slice(i18n.indexOf('const staticUiTranslations'), i18n.indexOf('  es: {', i18n.indexOf('const staticUiTranslations')));
for (const note of NOTES) {
  assert.ok(card.includes(`'${note}'`), `Home card shows: ${note}`);
  const entry = new RegExp(`'${note.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}': '([^']+)'`).exec(en);
  assert.ok(entry && note.length <= 90 && entry[1].length <= 90, `English translation within the translator limit: ${note}`);
}

// Mutants: each guard removed must be caught by an assertion.
const engine = lib('complianceEngine.ts'), calendar = lib('calendarExport.ts'), pdfExport = lib('pdfExport.ts'), email = lib('emailClient.ts'), database = lib('databaseClient.ts');
const MUTANTS = {
  'aggregates include pending days': { [engine]: [['const days = loadDays.filter(day => !pendingDateSet.has(day.date));', 'const days = loadDays;']] },
  'pending filtered per item, not per date': { [engine]: [['const days = loadDays.filter(day => !pendingDateSet.has(day.date));', 'const days = loadDays.filter(day => !day.availabilityUnresolved);']] },
  'carry-in makes the month partial': { [engine]: [['    if (!hasCompetence) return true;', '    return true;']] },
  'Google marker uses default reminders': { [lib('googleCalendarSync.ts')]: [[' : tentative ? { useDefault: false, overrides: [] } : { useDefault: true },', ' : { useDefault: true },']] },
  'Google marker not tentative': { [lib('googleCalendarSync.ts')]: [["    ...(tentative ? { status: 'tentative' as const } : {}),\n", '']] },
  'timeline drops pending days': { [engine]: [['      days: loadDays,\n      pendingAvailabilityDates,', '      days,\n      pendingAvailabilityDates,']] },
  'empty average reported as a score': { [engine]: [['const indeterminate = workedDays.length === 0;', 'const indeterminate = false;']] },
  'partial flag dropped': { [engine]: [["aggregateStatus: indeterminate ? 'indeterminate' : 'partial',", "aggregateStatus: indeterminate ? 'indeterminate' : undefined,"]] },
  'summary hides partial': { [engine]: [["aggregateStatus === 'partial' ? ', parcial' : ''", "aggregateStatus === 'partial' ? '' : ''"]] },
  'gym suggestion on pending date': { [engine]: [['}).filter(recommendation => !pendingDates.has(recommendation.date));', '});']] },
  'pending neighbour taken as light': { [engine]: [['(next.fatigueScore >= 70 || pendingDates.has(next.date))', '(next.fatigueScore >= 70)'], ['(previous.fatigueScore >= 70 || pendingDates.has(previous.date))', '(previous.fatigueScore >= 70)']] },
  'ICS marker blocks time': { [calendar]: [["'STATUS:TENTATIVE\\nTRANSP:TRANSPARENT\\nX-MICROSOFT-CDO-BUSYSTATUS:TENTATIVE'", "'STATUS:CONFIRMED\\nTRANSP:OPAQUE\\nX-MICROSOFT-CDO-BUSYSTATUS:BUSY'"]] },
  'ICS marker removed': { [calendar]: [['if (shouldExportDuties(cfg.mode) && hasUnresolvedActivityWindow(day)) {', 'if (false && hasUnresolvedActivityWindow(day)) {']] },
  'ICS marker ignores export toggles': { [calendar]: [['if (shouldExportDuties(cfg.mode) && hasUnresolvedActivityWindow(day)) {', 'if (hasUnresolvedActivityWindow(day)) {']] },
  'ICS marker new UID per export': { [calendar]: [['uid: `${uidBase}-duty-${dayIndex}`,\n        now,\n        date: day.date,\n        summary: `${getDutySummary(day)} · horário pendente`,', 'uid: `${uidBase}-duty-pending-${Math.random()}`,\n        now,\n        date: day.date,\n        summary: `${getDutySummary(day)} · horário pendente`,']] },
  'PDF timeline hides pending': { [pdfExport]: [["day.dutyReport || (pendingWindow(day) ? 'pendente' : '-'),", "day.dutyReport || '-',"]] },
  'PDF gym note removed': { [pdfExport]: [['if (pendingGymDates.length) {', 'if (false) {']] },
  'e-mail hides partial': { [email]: [["load.aggregateStatus === 'partial' ?", 'false ?']] },
  'stats count indeterminate as 0': { [database]: [['periods.some((p) => p.intensityScore !== null) ? avg((p) => p.intensityScore ?? 0, periods.filter((p) => p.intensityScore !== null)) : null', 'avg((p) => p.intensityScore ?? 0)']] },
};
const killed = [];
for (const [name, overrides] of Object.entries(MUTANTS)) {
  let failure = null;
  try { await suite(await load(overrides)); } catch (error) { failure = error; }
  assert.ok(failure instanceof assert.AssertionError && !/mutant anchor present/.test(failure.message), `mutant "${name}" must be killed by an assertion (${failure?.message || 'survived'})`);
  killed.push(name);
}
fs.rmSync(dir, { recursive: true, force: true });

console.log(`PASS pending availability aggregates (${prepared ? 'PREPARED' : 'RAW'} sources, public parser, synthetic): unknown standby/reserve kept in the timeline but out of every aggregate ('partial'); all unknown -> 'indeterminate' (null, "Indeterminada", never 0/Excelente); no gym suggestion on pending dates nor light neighbour, so none in PDF/ICS/Google; ICS keeps a tentative, non-blocking day marker (no alarm, duty modes only, stable duty UID) and the same-date flight keeps APZ 09:25; PDF/e-mail/local stats/Home card say partial or pending (EN within limit); published station control unchanged; no request left the process; ${killed.length} mutants killed by assertion.`);
