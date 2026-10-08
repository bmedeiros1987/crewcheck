import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { transitDeparturePresentation } from '../shared/transitAvailability.mjs';
const compile = code => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const lib = { exports: {} };
new Function('exports', compile(fs.readFileSync('client/src/lib/departureRouteState.ts', 'utf8')))(lib.exports);
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const source = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map(source.statements.filter(ts.isFunctionDeclaration).map(node => [node.name.text, node]));
function expression(fn, name) {
  let found;
  function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) found = node.initializer.getText(source); ts.forEachChild(node, visit); }
  visit(functions.get(fn));
  assert.ok(found, `${fn}.${name} must exist`);
  return found;
}
const names = ['positioningSearchKey', 'readPositioningSearch', 'writePositioningSearch', 'departurePositioningPlan'];
const constants = source.statements.filter(ts.isVariableStatement).filter(node => node.declarationList.declarations.some(decl => ['POSITIONING_ERROR_CACHE_MS', 'SMART_DEPARTURE_FLIGHT_THRESHOLD_KM'].includes(decl.name.getText(source))));
const cached = new Map();
const storage = { get: (key, fallback) => cached.get(key) ?? fallback, set: (key, value) => cached.set(key, value) };
const runtime = new Function('storage', 'departureConfirmedSameDayPositioning', 'departurePresentationDateTime', 'nearestDepartureAirport', 'eventRouteOrigin', compile([...names.map(name => functions.get(name).getText(source)), ...constants.map(node => node.getText(source))].join('\n')) + '; return { readPositioningSearch, writePositioningSearch, departurePositioningPlan, POSITIONING_ERROR_CACHE_MS };')(
  storage, event => Boolean(event.confirmed), () => new Date('2026-10-03T12:00:00Z'), () => null, () => 'synthetic-origin',
);
// Execute the actual component decision expressions, including their confirmed-record precedence.
const departureFunction = functions.has('AirportDeparture') ? 'AirportDeparture' : 'Departure';
const evaluate = new Function('runtime', 'event', 'route', 'positioningBusy', 'isPositioningSearchPending', 'transitDeparturePresentation', 'mode', compile(`
const { readPositioningSearch, departurePositioningPlan } = runtime;
const positioningPlan = departurePositioningPlan(event, route);
const positioningSearch = readPositioningSearch(event);
const positioningRecord = event.confirmed ? { flightNumber: 'FIX101' } : null;
const estimate = { leaveLabel: '09:00' };
const routeMismatch = false;
const transitPresentation = ${expression(departureFunction, 'transitPresentation')};
const positioningUnresolved = ${expression(departureFunction, 'positioningUnresolved')};
const detail = ${expression(departureFunction, 'primaryDepartureLabel')};
const card = ${expression('SmartCard', 'departurePrimaryLabel')};
`) + ';return {detail,card,positioningUnresolved};');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const originalNow = Date.now;
let now = Date.parse('2026-10-02T12:00:00Z');
Date.now = () => now;
try {
  const event = { id: 'event-A', origin: 'BSB', confirmed: false };
  const far = { ok: true, distanceMeters: 500000 };
  const see = (route = far, busy = false, target = event, mode = 'driving') => evaluate(runtime, target, route, busy, lib.exports.isPositioningSearchPending, transitDeparturePresentation, mode);
  assert.equal(runtime.POSITIONING_ERROR_CACHE_MS, 30 * 60_000);
  for (const status of ['error', 'none', 'checking', 'found']) {
    const started = now;
    runtime.writePositioningSearch(event, { status, checkedAt: new Date(now).toISOString(), expiresAt: new Date(now + runtime.POSITIONING_ERROR_CACHE_MS).toISOString(), message: 'offline fixture' });
    now += runtime.POSITIONING_ERROR_CACHE_MS - 1;
    check(runtime.readPositioningSearch(event)?.status === status, `${status} remains cached until TTL`);
    for (const busy of [false, true]) {
      const result = see(far, busy);
      const pending = status === 'checking';
      check(result.positioningUnresolved === pending, `${status} busy=${busy}: only checking is pending`);
      check(pending ? result.detail !== 'Dia anterior' && result.card !== 'Dia anterior' : result.detail === 'Dia anterior' && result.card === 'Dia anterior', `${status} busy=${busy}: both surfaces preserve terminal fallback`);
    }
    check(see({ ok:true, distanceMeters:12000 }).detail === '09:00', `${status}: near route no prior-day fallback`);
    check(see(far, false, { ...event, confirmed:true }).detail === 'FIX101', `${status}: confirmed flight wins`);
    now = started + runtime.POSITIONING_ERROR_CACHE_MS + 1;
    check(runtime.readPositioningSearch(event) === null && see().positioningUnresolved, `${status}: expired cache returns unresolved`);
  }
  cached.clear();
  check(see().positioningUnresolved && see().card !== 'Dia anterior', 'unstarted lookup unresolved');
  runtime.writePositioningSearch(event, { status:'error', checkedAt:new Date(now).toISOString(), expiresAt:new Date(now+1800000).toISOString(), message:'Radar unavailable' });
  const snapshots = [];
  const session = lib.exports.createDepartureRouteSession(value => snapshots.push(value));
  session.complete(session.begin(), far);
  session.complete(session.begin(), {ok:false,message:'route refresh failed'});
  check(snapshots.at(-1).clientRouteState === 'stale' && see(snapshots.at(-1)).detail === 'Dia anterior', 'stale far route plus cached Radar error retains fallback');
  check(see(far, false, { ...event, id:'event-B' }).positioningUnresolved, 'event B cannot read event A terminal cache');
  session.dispose();
  const nextAccount = lib.exports.createDepartureRouteSession(value => snapshots.push(value));
  nextAccount.begin();
  check(!snapshots.at(-1).distanceMeters && see(snapshots.at(-1)).detail === '09:00', 'new route/account context cannot inherit far-route fallback');
  check(see(far, false, event, 'transit').detail === 'A confirmar', 'unverified transit overrides far positioning departure time');
  check(see({ok:true,distanceMeters:12000}, false, event, 'transit-flight').detail === 'A confirmar', 'unverified transit overrides near departure time');
} finally { Date.now = originalNow; }
if (process.env.DEPARTURE_TERMINAL_EVIDENCE) fs.writeFileSync(process.env.DEPARTURE_TERMINAL_EVIDENCE, JSON.stringify({ scope:'Actual prepared cache helpers and component expressions; synthetic storage/time/routes; no network', failures }, null, 2));
assert.deepEqual(failures, []);
console.log('PASS terminal Radar error TTL, busy precedence, checking/null/expired, found/confirmed, none, near/far, stale failure and context isolation');
