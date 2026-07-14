import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');
const [comparisonSource, home, styles, packageJson] = await Promise.all([
  read('client/src/lib/rosterComparison.ts'),
  read('client/src/pages/Home.tsx'),
  read('client/src/index.css'),
  read('package.json'),
]);

const compiled = ts.transpileModule(comparisonSource, {
  fileName: 'rosterComparison.ts',
  reportDiagnostics: true,
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
});
const errors = (compiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, 'rosterComparison.ts must transpile without syntax errors');
const comparison = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputText).toString('base64'));

const leg = (flightNumber, departureTime, arrivalTime, workType = 'OP') => ({
  flightNumber,
  origin: 'GRU',
  destination: 'GIG',
  departureTime,
  arrivalTime,
  workType,
});
const day = (date, type, legs = [], pairingCode = type) => ({
  date,
  dayOfWeek: '',
  type,
  pairingCode,
  dutyReport: legs[0]?.departureTime || null,
  dutyDebrief: legs.at(-1)?.arrivalTime || null,
  legs,
  dutyHours: null,
  flyingHours: null,
  isNextDay: false,
  hotel: null,
  base: 'GRU',
});
const roster = (days) => ({
  crewName: 'Teste CrewCheck',
  crewId: '1',
  base: 'GRU',
  rank: 'CCM',
  month: 7,
  year: 2026,
  days,
  rawText: '',
});

const planned = roster([
  day('01/07/2026', 'VOO', [leg('LA100', '08:00', '10:00')], '1234'),
  day('02/07/2026', 'DO'),
]);
const current = roster([
  day('01/07/2026', 'VOO', [leg('LA100', '09:30', '11:20', 'PS')], '1234'),
  day('02/07/2026', 'VOO', [leg('LA200', '12:00', '14:00')], '5678'),
]);

const result = comparison.compareRosters(planned, current);
assert.equal(result.summary.periodMatches, true);
assert.equal(result.summary.changedDays, 2);
assert.equal(result.summary.timeChanges, 1);
assert.equal(result.summary.workTypeChanges, 1);
assert.deepEqual(result.summary.lostDaysOff, ['02/07']);
assert.ok(result.summary.financialReviewCount >= 3);
assert.notEqual(comparison.rosterFingerprint(planned), comparison.rosterFingerprint(current));
assert.equal(comparison.sameRosterPeriod(planned, current), true);
assert.match(result.changes.find((change) => change.categories.includes('time')).descriptions.join(' '), /\+1h30min/);
assert.equal(comparison.compareRosters(planned, planned).summary.unchanged, true);
const august = {
  ...current,
  month: 8,
  days: current.days.map((item) => ({ ...item, date: item.date.replace('/07/', '/08/') })),
};
assert.equal(comparison.sameRosterPeriod(planned, august), false);

assert.match(packageJson, /"version":\s*"13\.8\.2"/);
assert.match(home, /type PlannedRosterSnapshot/);
assert.match(home, /preservePlannedRosterBeforeImport/);
assert.match(home, /CompareRosterView/);
assert.match(home, /Planejado x atual/);
assert.match(home, /Não é marcada como realizada sem espelho de voo/);
assert.match(home, /opensComparison \? 'compare' : 'roster'/);
assert.match(styles, /\.cz-compare-change\.lost-rest/);
assert.match(styles, /\.cz-compare-tabs/);
assert.match(styles, /\.cz-compare-days-off p\.lost/);
assert.doesNotMatch(styles, /\.cz-compare-days-off p:first-child/);

console.log('CrewCheck v13.8.2 roster comparison regression OK');
