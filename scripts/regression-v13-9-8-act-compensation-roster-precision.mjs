import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const read = (path) => fs.readFileSync(path, 'utf8');
const policySource = read('client/src/lib/compensationPolicy.ts');
const transformed = ts.transpileModule(policySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const policy = await import(`data:text/javascript;base64,${Buffer.from(transformed.outputText).toString('base64')}`);
const at = (day, hour, minute) => new Date(2026, 6, day, hour, minute, 0, 0);
const slots = (activity) => policy.classifyAllowanceWindows(activity).map((item) => `${item.iso}:${item.slot}`);

assert.deepEqual(slots({ kind:'flight', start:at(10,13,25), end:at(10,23,29), enginesOff:at(10,23,29) }), ['2026-07-10:dinner']);
assert.deepEqual(slots({ kind:'flight', start:at(10,13,25), end:at(10,23,30), enginesOff:at(10,23,30) }), ['2026-07-10:dinner', '2026-07-11:supper']);
assert.deepEqual(slots({ kind:'standby', start:at(13,6,5), end:at(13,12,5), activated:false }), []);
assert.deepEqual(slots({ kind:'reserve', start:at(13,6,5), end:at(13,12,5) }), ['2026-07-13:breakfast', '2026-07-13:lunch']);
assert.deepEqual(slots({ kind:'stay_external', start:at(11,0,54), end:at(12,4,30) }), ['2026-07-11:lunch', '2026-07-11:dinner']);
assert.deepEqual(slots({ kind:'stay_base', start:at(11,0,54), end:at(12,4,30) }), []);
assert.equal(policy.freeDayPostponementIndemnity(4), 0);
assert.equal(policy.freeDayPostponementIndemnity(4.01), 700);
assert.equal(policy.freeDayPostponementIndemnity(12, true), 0);
assert.equal(policy.freeDayPostponementIndemnity(12.01, true), 700);

const statementActivities = [
  { kind:'flight', start:at(8,9,3), end:at(8,19,18), enginesOff:at(8,19,18), originAtContractualBase:false },
  { kind:'flight', start:at(10,13,25), end:at(11,0,24), enginesOff:at(11,0,24), originAtContractualBase:true },
  { kind:'stay_external', start:at(11,0,54), end:at(12,4,30) },
  { kind:'flight', start:at(12,4,30), end:at(12,12,16), enginesOff:at(12,12,16), originAtContractualBase:false },
  { kind:'reserve', start:at(13,6,5), end:at(13,12,5) },
  { kind:'reserve', start:at(14,6,5), end:at(14,12,5) },
];
const statementRows = statementActivities.flatMap(policy.classifyAllowanceWindows);
const statementTotal = statementRows.reduce((sum, row) => sum + (row.slot === 'breakfast' ? 27.36 : 109.44), 0);
assert.equal(statementRows.length, 11);
assert.equal(Number(statementTotal.toFixed(2)), 1039.68);
const cycle = policy.observedStatementCycle(at(12,12,0));
assert.equal(cycle.start.getDate(), 8);
assert.equal(cycle.end.getDate(), 14);
assert.equal(cycle.payment.getDate(), 16);

const parser = read('client/src/lib/pdfParser.ts');
const serverParser = read('server/rosterParser.mjs');
const aims = read('client/src/lib/aimsParser.ts');
const canonical = read('client/src/lib/canonicalRoster.ts');
const home = read('client/src/pages/Home.tsx');
const menuCss = read('client/src/components/v1394/v1394.css');
const rosterView = read('client/src/components/v1391/RosterLaunchView.tsx');
assert.match(parser, /transposedStationTimeRows/);
assert.match(serverParser, /serverTransposedStationTimeRows/);
assert.match(aims, /removeCollapsedDuplicateAimsFlights/);
assert.match(aims, /extraFlightNumbers/);
assert.match(canonical, /physicalDayOffset/);
assert.match(canonical, /completeContinuityDays/);
assert.match(home, /acionamento: voo calculado normalmente/);
assert.match(home, /domingo\/feriado na tarifa dobrada/);
assert.match(home, /Garantia da planejada/);
assert.match(menuCss, /min-width:768px/);
assert.match(menuCss, /pointer:coarse/);
assert.match(rosterView, /groupPendingCurrencies/);

console.log('CrewCheck v13.9.8 ACT compensation, statement, roster and iPad regression: OK');
