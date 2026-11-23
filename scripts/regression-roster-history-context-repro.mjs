// Reproduction (characterization) of Bruno's report: "if I activate November I lose October, so the
// system can't pull values or compare 28 days". Synthetic rosters only, offline, no app state.
// It pins what the current code does and the invariants any fix must keep:
//  - monthly totals are segregated by competence (35 h October, 40 h November, never 75 h);
//  - the 28-day window adds only the real interval, from the proven previous competence;
//  - the analysis of a competence does not depend on which roster is active;
//  - carry-in needs a stable crew id: a roster without it (ticket format) gets no history;
//  - local-only or unverified history never proves completeness; a reimport is not concatenated;
//  - the roster view's money is computed only for the active competence (adjacent months show
//    "Indisponível"), which is the gap behind "can't pull values".
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

// Prepared sources only: the raw engine accepts regulatoryHistory but ignores it; the canonical
// preparation (scripts/v139/apply.mjs), which production builds run, adds the carry-in loop.
assert.match(fs.readFileSync('client/src/lib/complianceEngine.ts', 'utf8'), /for \(const historicalRoster of regulatoryHistory/, 'run after node scripts/v139/apply.mjs (prepared sources)');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'roster-history-repro-'));
await build({ stdin: { contents: "export { analyzeCompliance } from './client/src/lib/complianceEngine.ts'; export { selectRegulatoryCarryIn, regulatoryCrewIdentity } from './client/src/lib/regulatoryHistory.ts';", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'esm', platform: 'node', outfile: path.join(dir, 'engine.mjs'), logLevel: 'silent', alias: { '@': path.resolve('client/src') } });
const { analyzeCompliance, selectRegulatoryCarryIn, regulatoryCrewIdentity } = await import(path.join(dir, 'engine.mjs'));

const pad = value => String(value).padStart(2, '0');
const civil = (year, month, day) => `${pad(day)}/${pad(month)}/${year}`;
const flight = (date, hours) => ({ date, type: 'FLIGHT', pairingCode: `PAIR-${date}`, dutyReport: '08:00', dutyDebrief: '18:00',
  legs: [{ flightNumber: 'LA9000', origin: 'AAA', destination: 'BBB', departureTime: '08:00', arrivalTime: '16:00', duration: hours, aircraftType: 'A320' }] });
const off = date => ({ date, type: 'DO', pairingCode: 'DO', isDayOff: true, legs: [] });
function month(year, monthNumber, flights, identity = { crewId: 'BP12345678', crewName: 'TRIPULANTE TESTE' }) {
  const length = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(), days = [];
  for (let day = 1; day <= length; day += 1) days.push(flights[day] ? flight(civil(year, monthNumber, day), flights[day]) : off(civil(year, monthNumber, day)));
  return { ...identity, base: 'BSB', rank: 'CCM', airline: 'LATAM', year, month: monthNumber, rawText: 'A320', days };
}
const deep = value => JSON.parse(JSON.stringify(value));
// October: 7 h on the 1st (outside the 28-day window that ends in early November) and 4 × 7 h on 20–23.
const october = month(2026, 10, { 1: 7, 20: 7, 21: 7, 22: 7, 23: 7 });
// November: 5 × 8 h on 1–5.
const november = month(2026, 11, { 1: 8, 2: 8, 3: 8, 4: 8, 5: 8 });
const gap = result => result.alerts.some(alert => alert?.code === 'ROLLING_28D_DATA_GAP');

// 1. Monthly totals are segregated, with or without history.
const novAlone = analyzeCompliance(deep(november)), novWithOct = analyzeCompliance(deep(november), 'auto', [deep(october)]);
const octAlone = analyzeCompliance(deep(october));
assert.equal(octAlone.metrics.totalFlightHours, 35, 'October total');
assert.equal(novAlone.metrics.totalFlightHours, 40, 'November total');
assert.equal(novWithOct.metrics.totalFlightHours, 40, 'history never adds October hours to the November total');

// 2. The 28-day window: incomplete without the previous competence; with it, only the real interval.
assert.equal(gap(novAlone), true, 'without October the 28-day window is pending (dados insuficientes)');
assert.equal(gap(novWithOct), false, 'with October proven the window is complete');
assert.equal(novWithOct.metrics.maxFlightHoursRolling28Days, 68, 'window ending 05/11 = 20–23/10 (28 h) + 01–05/11 (40 h); 01/10 is outside');

// 3. A competence's analysis does not depend on which roster is active (pure inputs → same result).
const octAgain = analyzeCompliance(deep(october));
assert.deepEqual(octAgain.metrics, octAlone.metrics, 'October analysis unchanged when November exists or is active');
assert.deepEqual(analyzeCompliance(deep(november), 'auto', [deep(october)]).metrics, novWithOct.metrics, 'deterministic with the same history');

// 4. Carry-in selection: verified account, exact previous competence, stable crew id.
const summary = (roster, id, createdAt) => ({ id, createdAt, crewId: roster.crewId, crewName: roster.crewName, year: roster.year, month: roster.month });
const account = summaries => ({ summaries, authority: 'account_verified', authenticated: true, accountQuerySucceeded: true });
assert.equal(selectRegulatoryCarryIn(account([summary(october, 'oct-1', '2026-10-01')]), november).reason, 'ok');
// Ticket-format rosters carry no crew id: the display window still matches them by name, but the
// 28-day carry-in refuses them, so the alert stays "Histórico insuficiente".
const ticketNovember = { ...november, crewId: '' }, ticketOctober = { ...october, crewId: '' };
assert.equal(regulatoryCrewIdentity(ticketNovember), null);
assert.equal(selectRegulatoryCarryIn(account([summary(ticketOctober, 'oct-t', '2026-10-01')]), ticketNovember).reason, 'active_identity_unverified');
// Local-only history (no session or failed account query) never proves completeness.
assert.equal(selectRegulatoryCarryIn({ summaries: [summary(october, 'oct-1', '2026-10-01')], authority: 'local_no_session', authenticated: false, accountQuerySucceeded: false }, november).reason, 'account_not_verified');
// Reimport of the same competence: the newest summary is chosen; revisions are never concatenated.
const reimport = selectRegulatoryCarryIn(account([summary(october, 'oct-old', '2026-10-01'), summary(october, 'oct-new', '2026-10-15')]), november);
assert.equal(reimport.summary.id, 'oct-new');
// Two months back is not the previous competence.
assert.equal(selectRegulatoryCarryIn(account([summary(month(2026, 9, {}), 'sep', '2026-09-01')]), november).reason, 'previous_competence_absent');
// Year boundary: January's previous competence is December of the year before.
const january = month(2027, 1, { 2: 8 }), december = month(2026, 12, { 20: 8 });
assert.equal(selectRegulatoryCarryIn(account([summary(december, 'dec', '2026-12-01')]), january).reason, 'ok');
assert.equal(analyzeCompliance(deep(january), 'auto', [deep(december)]).metrics.totalFlightHours, 8, 'January total stays January only');

// 5. Roster view money: computed only for the active competence (source pins, see report).
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8'), view = fs.readFileSync('client/src/components/v1391/RosterLaunchView.tsx', 'utf8');
assert.match(home, /<RosterLaunchView events=\{rosterEvents\} roster=\{bundle\.roster\} finance=\{financeSnapshot\(bundle\.roster\)\}/, 'finance from the active roster only');
assert.match(home, /const rosterEvents = useMemo\(\(\) => buildLegs\(rosterWindowPrimaryRef\.current === bundle\.roster \? rosterWindow : bundle\.roster\)/, 'days from the multi-month display window');
assert.match(view, /const financeAvailable = !financeMonth \|\| selectedMonth === financeMonth;/, 'other months: finance unavailable');
assert.match(view, /'Financeiro disponível somente para a competência operacional ativa'/);

console.log('PASS roster history reproduction: totals segregated by month (35/40, never 75), 28-day window pending without the previous competence and 68 h over the real interval with it, analysis independent of the active roster, carry-in refused without a stable crew id (ticket format), local-only history not proof, reimport newest not concatenated, year boundary; roster view money only for the active competence (adjacent months "Indisponível")');
