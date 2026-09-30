import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadClientModules, TYPE_ONLY_PDF_PARSER_STUB } from './lib/ts-module-harness.mjs';

const harness = loadClientModules({
  prefix: 'crewcheck-v14411-integrity-',
  stubs: TYPE_ONLY_PDF_PARSER_STUB,
  files: [
    'client/src/lib/rosterContinuity.ts',
    'client/src/lib/canonicalRoster.ts',
    'client/src/lib/rosterIntegrityGuard.ts',
  ],
});

const canonical = harness.load('canonicalRoster');
const guard = harness.load('rosterIntegrityGuard');

const leg = (flightNumber, origin, destination, departureTime, arrivalTime, extra = {}) => ({
  flightNumber,
  origin,
  destination,
  departureTime,
  arrivalTime,
  workType: 'OP',
  ...extra,
});

const day = (date, dutyReport, dutyDebrief, legs, extra = {}) => {
  const [dd, mm, yyyy] = date.split('/').map(Number);
  return {
    date,
    dayNumber: dd,
    month: mm,
    year: yyyy,
    dayOfWeek: '',
    type: 'VOO',
    pairingCode: legs[0]?.flightNumber || '',
    dutyReport,
    dutyDebrief,
    dutyHours: null,
    flyingHours: null,
    isNextDay: false,
    hotel: null,
    base: 'AAA',
    rawText: 'synthetic',
    legs,
    ...extra,
  };
};

function rosterForMidnight({ report = '23:18', departure = '00:05', continuation = '04:20' } = {}) {
  return {
    crewName: 'Synthetic crew',
    crewId: 'synthetic-id',
    base: 'AAA',
    rank: 'CCM',
    airline: 'LATAM',
    month: 10,
    year: 2026,
    rawText: '',
    days: [
      day('04/10/2026', '02:40', '06:25', [
        leg('LA9101', 'BBB', 'CCC', '02:40', '05:55'),
      ]),
      day('04/10/2026', report, '03:20', [
        leg('LA9102', 'CCC', 'DDD', departure, '03:20'),
      ]),
      day('05/10/2026', continuation, '07:35', [
        leg('LA9103', 'DDD', 'AAA', continuation, '07:05'),
      ]),
    ],
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function codes(report) {
  return new Set(report.blockers.map((item) => item.code));
}

// 1) Matriz permanente: viradas curtas de meia-noite devem preservar APZ.
for (const [report, departure, lead] of [
  ['22:50', '00:10', 80],
  ['23:18', '00:05', 47],
  ['23:55', '00:20', 25],
  ['00:10', '01:00', 50],
]) {
  assert.equal(guard.publishedPresentationLeadMinutes(report, departure), lead, `${report}->${departure}: lead circular`);
  assert.equal(guard.isCrediblePublishedPresentation(report, departure), true, `${report}->${departure}: APZ válida`);
  const roster = rosterForMidnight({ report, departure });
  const integrity = guard.auditRosterIntegrity(roster);
  assert.equal(integrity.ok, true, `${report}->${departure}: linha canônica íntegra: ${JSON.stringify(integrity.blockers)}`);
}

// 2) Contraprovas: relógios posteriores realmente inválidos não podem ganhar semântica de APZ.
assert.equal(guard.isCrediblePublishedPresentation('10:00', '09:00'), false);
assert.equal(guard.isCrediblePublishedPresentation('09:00', '09:00'), false);
assert.equal(guard.isCrediblePublishedPresentation('05:00', '09:00'), false, 'lead > 180 não é APZ confiável');

// 3) O cenário do P0 deve preservar a mesma jornada na continuação.
const roster = rosterForMidnight();
const goodEvents = canonical.buildCanonicalRosterEvents(roster);
const goodReport = guard.auditCanonicalRosterIntegrity(roster, goodEvents);
assert.equal(goodReport.ok, true, JSON.stringify(goodReport.blockers));
assert.equal(goodReport.checkedPublishedPresentations >= 1, true);

const midnight = goodEvents.find((event) => event.kind === 'flight' && event.flightNumber === 'LA9102');
const continuation = goodEvents.find((event) => event.kind === 'flight' && event.flightNumber === 'LA9103');
assert.ok(midnight && continuation);
assert.equal(midnight.presentation, '23:18');
assert.equal(midnight.isNextDay, true);
assert.equal(continuation.journeyId, midnight.journeyId);
assert.equal(continuation.showPresentation, false);
assert.equal(continuation.groundBeforeMinutes, 60);

// 4) Proteção ativa: se alguém voltar a trocar APZ por STD, runtime deve bloquear.
{
  const broken = clone(goodEvents);
  const event = broken.find((item) => item.kind === 'flight' && item.flightNumber === 'LA9102');
  event.presentation = '00:05';
  event.showPresentation = false;
  const report = guard.auditCanonicalRosterIntegrity(roster, broken);
  assert.equal(report.ok, false);
  assert.equal(codes(report).has('PUBLISHED_PRESENTATION_MUTATED'), true);
  assert.equal(codes(report).has('PUBLISHED_PRESENTATION_HIDDEN'), true);
}

// 5) Proteção ativa: se 00:05 voltar ao dia civil da APZ, bloquear.
{
  const broken = clone(goodEvents);
  const event = broken.find((item) => item.kind === 'flight' && item.flightNumber === 'LA9102');
  const start = new Date(event.startDateTime);
  start.setUTCDate(start.getUTCDate() - 1);
  event.startDateTime = start.toISOString();
  const report = guard.auditCanonicalRosterIntegrity(roster, broken);
  assert.equal(report.ok, false);
  assert.equal(codes(report).has('MIDNIGHT_DEPARTURE_DATE_MISMATCH'), true);
}

// 6) Proteção ativa: conexão curta nunca pode virar nova jornada por "repouso".
{
  const broken = clone(goodEvents);
  const event = broken.find((item) => item.kind === 'flight' && item.flightNumber === 'LA9103');
  event.journeyId = 'jornada-falsa';
  event.journeyBoundary = 'repouso-entre-jornadas';
  event.showPresentation = true;
  const report = guard.auditCanonicalRosterIntegrity(roster, broken);
  assert.equal(report.ok, false);
  assert.equal(codes(report).has('IMPOSSIBLE_SHORT_REST_BOUNDARY'), true);
}

// 7) Proteção ativa: solo da mesma jornada não pode ser inflado silenciosamente.
{
  const broken = clone(goodEvents);
  const event = broken.find((item) => item.kind === 'flight' && item.flightNumber === 'LA9103');
  event.groundBeforeMinutes = 1500;
  const report = guard.auditCanonicalRosterIntegrity(roster, broken);
  assert.equal(report.ok, false);
  assert.equal(codes(report).has('GROUND_INTERVAL_MISMATCH'), true);
}

// 8) Corpus real sanitizado: casos PASS existentes não podem virar falso blocker.
{
  const corpus = JSON.parse(fs.readFileSync('scripts/fixtures/p0-527/aims-real-sanitized-aug2026.json', 'utf8'));
  const serverSource = fs.readFileSync('server/rosterParser.mjs', 'utf8');
  const tmp = path.join(os.tmpdir(), 'crewcheck-v14411-server-' + process.pid + '.mjs');
  fs.writeFileSync(tmp, serverSource + '\nexport { parseAimsTokensIntoEventsV3 };\n', 'utf8');
  const server = await import(pathToFileURL(tmp).href + '?v=' + Date.now());
  fs.unlinkSync(tmp);

  for (const item of corpus.cases.filter((entry) => entry.status === 'PASS')) {
    const sourceDay = Number(String(item.tokens?.[0] || '').match(/^(\d{1,2})/)?.[1] || 0);
    const days = server.parseAimsTokensIntoEventsV3(item.tokens, sourceDay, item.month, item.year, corpus.provenance.base);
    const parsedRoster = {
      crewName: 'Sanitized crew',
      crewId: 'sanitized',
      base: corpus.provenance.base,
      rank: 'CCM',
      airline: 'LATAM',
      month: item.month,
      year: item.year,
      rawText: '',
      days,
    };
    const report = guard.auditRosterIntegrity(parsedRoster);
    assert.equal(report.ok, true, item.id + ': corpus PASS gerou blocker ' + JSON.stringify(report.blockers));
  }
}

// 9) Gate arquitetural: importação final deve usar fail-closed e v14.4.11.
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const loader = fs.readFileSync('scripts/v139/apply.mjs', 'utf8');
const policy = JSON.parse(fs.readFileSync('scripts/android-play/release-policy.json', 'utf8'));
const release = JSON.parse(fs.readFileSync('client/public/release.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.match(home, /auditRosterIntegrity\(roster\)/);
assert.match(home, /integrityBlocked:\s*true/);
assert.match(home, /rosterIntegrityBlockingSummary\(integrity\)/);
assert.match(home, /Escala não ativada: divergência de integridade/);
assert.match(loader, /v14411\/apply\.mjs/);
assert.equal(policy.versionName, '14.4.11');
assert.equal(release.version, '14.4.11');
assert.equal(pkg.version, '14.4.11');
assert.equal(policy.artifacts.app.versionCode, 144110);
assert.equal(policy.artifacts.wear.versionCode, 144111);
assert.equal(policy.artifacts.watchface.versionCode, 144112);

harness.cleanup();
console.log('PASS CrewCheck v14.4.11 — Roster Integrity Guard + correction release');
