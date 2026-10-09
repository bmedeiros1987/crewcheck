import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const ast = ts.createSourceFile('Home.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const body = name => ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)?.getText(ast);
const compile = (names, env) => new Function(...Object.keys(env), ts.transpileModule(names.map(body).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText + '\nreturn {' + names.join(',') + '};')(...Object.values(env));
let account = 'synthetic-A';
const values = new Map();
const storage = { get: (key, fallback) => values.get(key) ?? fallback, set: (key, value) => values.set(key, value) };
const env = { storage, getStoredUser: () => ({ id: account }), CURRENT_GEO_META_KEY: 'meta', CURRENT_GEO_MAX_AGE_MS: 75000, coordsLabel: (lat, lng) => `${lat},${lng}` };
const geo = compile(['coordinatePair', 'validCurrentGeo', 'persistCurrentGeoPosition', 'loadFreshCurrentGeo'], env);
const fix = { lat: 1, lng: 2, accuracy: 20, capturedAt: new Date(Date.now() - 1000).toISOString(), source: 'browser' };
geo.persistCurrentGeoPosition(fix);
assert.deepEqual(geo.loadFreshCurrentGeo(), { lat: 1, lng: 2, accuracy: 20 });
assert.throws(() => geo.persistCurrentGeoPosition({ ...fix, capturedAt: new Date(Date.now() - 60000).toISOString() }), /anterior/);
account = 'synthetic-B';
assert.equal(geo.loadFreshCurrentGeo(), null, 'account switch discards prior fix');
geo.persistCurrentGeoPosition({ ...fix, capturedAt: new Date(Date.now() - 76000).toISOString() });
assert.equal(geo.loadFreshCurrentGeo(), null, 'resume after TTL cannot reuse old fix');
for (const accuracy of [null, 0, 181, undefined]) {
  geo.persistCurrentGeoPosition({ ...fix, accuracy });
  assert.equal(geo.loadFreshCurrentGeo(), null, 'poor/unknown accuracy cannot be current');
}
const browser = compile(['requestBrowserCurrentGeoPosition'], { ...env, validCurrentGeo: geo.validCurrentGeo, navigator: { geolocation: { getCurrentPosition: (ok, error) => ok({ coords: { latitude: 1, longitude: 2, accuracy: 20 }, timestamp: Date.now() - 100000 }) } } });
await assert.rejects(browser.requestBrowserCurrentGeoPosition(), /antiga/);
for (const code of [1, 2, 3]) {
  const denied = compile(['requestBrowserCurrentGeoPosition'], { ...env, validCurrentGeo: geo.validCurrentGeo, navigator: { geolocation: { getCurrentPosition: (ok, fail) => fail({ code }) } } });
  await assert.rejects(denied.requestBrowserCurrentGeoPosition());
}
const origin = compile(['eventRouteOrigin', 'departureOriginCoordinates'], { storage, getStoredUser: env.getStoredUser, loadFreshCurrentGeo: geo.loadFreshCurrentGeo, coordsLabel: env.coordsLabel, coordinatePair: geo.coordinatePair, loadNearbyAddress: () => ({ coordinates: { latitude: 9, longitude: 9 } }) });
assert.equal(origin.eventRouteOrigin({}), '', 'unknown position is never a Maps query pretending to be current');
assert.equal(origin.departureOriginCoordinates('Synthetic hotel'), null, 'manual/hotel origin cannot inherit cached address coordinates');
const plan = compile(['departurePositioningPlan'], { eventRouteOrigin: () => '1,2', SMART_DEPARTURE_FLIGHT_THRESHOLD_KM: 250, departureConfirmedSameDayPositioning: () => false, departurePresentationDateTime: () => new Date('2030-01-02T12:00:00Z'), nearestDepartureAirport: value => ({ code: value }) }).departurePositioningPlan;
for (const km of [20, 250, 251, 400]) {
  const result = plan({}, { ok: true, distanceMeters: km * 1000, clientRouteState: 'valid', clientOrigin: '3,4' });
  assert.equal(result.requiresFlight, km > 250);
  assert.equal(result.originAirport.code, '3,4', 'eligibility uses exact map observation origin');
}
for (const route of [null, { ok: false, distanceMeters: 400000 }, { ok: true, distanceMeters: 400000, clientRouteState: 'stale' }, { ok: true, distanceMeters: 400000, clientOrigin: '' }]) assert.equal(plan({}, route).requiresFlight, false);
assert.ok(source.includes('locationRequestRef.current'), 'GPS responses are scoped to request and event/account lifecycle');
assert.ok(source.includes("window.addEventListener('focus', resume)"));
assert.ok(source.includes("clientOrigin: origin"));
let refreshNode;
function visit(node) { if (ts.isFunctionDeclaration(node) && node.name?.text === 'refreshLocation') refreshNode = node; ts.forEachChild(node, visit); }
visit(ast);
const observations = [], geocodes = [], origins = [], labels = [];
const requestRef = { current: 0 };
const refreshEnv = {
  locationRequestRef: requestRef,
  getCurrentGeoPosition: () => new Promise(resolve => observations.push(resolve)),
  coordsLabel: env.coordsLabel, storage,
  setOrigin: value => origins.push(value), setLocationRevision: () => {},
  setOriginLabel: value => labels.push(value), onOriginLabel: () => {},
  reverseGeocodePosition: () => new Promise(resolve => geocodes.push(resolve)),
  toast: { success() {}, error() {} },
};
const refresh = new Function(...Object.keys(refreshEnv), ts.transpileModule(refreshNode.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + ';return refreshLocation;')(...Object.values(refreshEnv));
const first = refresh(), second = refresh();
observations[1]({ lat: 3, lng: 4 });
await Promise.resolve();
observations[0]({ lat: 1, lng: 2 });
await first;
assert.deepEqual(origins, ['3,4'], 'late first GPS response cannot overwrite newer refresh');
requestRef.current++; // Event/airport/account cleanup invalidates the pending label.
geocodes[0]({ shortAddress: 'Synthetic obsolete label' });
await second;
assert.ok(!labels.includes('Synthetic obsolete label'));
console.log('PASS synthetic location age/precision, denied/unavailable/timeout, reverse observations, account/resume, manual origin, near/threshold/far, stale route, shared map/flight origin');
