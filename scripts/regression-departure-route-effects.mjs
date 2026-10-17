import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const transpile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
new Function('exports', transpile(fs.readFileSync('client/src/lib/departureRouteState.ts', 'utf8')))(module.exports);
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const start = home.lastIndexOf('useEffect(() => {', home.indexOf('const session = createDepartureRouteSession'));
const end = home.indexOf('useEffect(() => {\n    if (route?.clientRouteState', start);
assert.ok(start >= 0 && end > start, 'real route effects must be present');
const run = new Function('useEffect', 'createDepartureRouteSession', 'setRoute', 'onRoute', 'fetchRoutePreviewInfo', 'origin', 'destination', 'mapsMode', 'routeAccountId', 'event', 'locationRevision', 'refreshRouteRef', 'routeLocationRevisionRef', 'window', transpile(home.slice(start, end)));
const effects = [], requests = [], states = [];
const refreshRef = { current: null }, revisionRef = { current: null };
function render(origin, revision, account = 'A') {
  let index = 0;
  const scheduled = [];
  const useEffect = (fn, deps) => {
    const slot = index++, previous = effects[slot];
    if (previous && deps.every((value, i) => Object.is(value, previous.deps[i]))) return;
    scheduled.push(() => { previous?.cleanup?.(); effects[slot] = { deps, cleanup: fn() }; });
  };
  run(useEffect, module.exports.createDepartureRouteSession, value => states.push(value), null,
    () => new Promise(resolve => requests.push(resolve)), origin, 'destination', 'driving', account,
    { id: 'event-A' }, revision, refreshRef, revisionRef, { setInterval: () => 1, clearInterval: () => {} });
  scheduled.forEach(effect => effect());
}
render('old-origin', 0);
assert.equal(requests.length, 1);
requests[0]({ ok: true, distanceMeters: 1000 });
await Promise.resolve();
render('GPS-new-origin', 1);
assert.equal(requests.length, 2, 'changed coordinates plus revision must start only one request');
assert.equal(states.at(-1).distanceMeters, undefined, 'new origin must discard old route');
requests[1]({ ok: true, distanceMeters: 12000 });
await Promise.resolve();
assert.equal(states.at(-1).clientRouteState, 'valid');
render('GPS-new-origin', 2);
assert.equal(requests.length, 3, 'same-coordinate explicit update must still refresh');
requests[2]({ ok: false, message: 'refresh failed' });
await Promise.resolve();
assert.equal(states.at(-1).clientRouteState, 'stale');
assert.equal(states.at(-1).distanceMeters, 12000, 'same-context failed refresh retains valid response');
render('GPS-new-origin', 3, 'B');
assert.equal(requests.length, 4, 'account change plus revision also starts only one request');
assert.equal(states.at(-1).distanceMeters, undefined, 'account B cannot inherit account A route');
effects.forEach(effect => effect.cleanup?.());
console.log('PASS real route effects: GPS/context+revision single request, same-coordinate refresh, account isolation, stale retention');

// Execute the real async button handler, flushing React's batched state at each
// await boundary. Reverse geocoding changes the label, never the route identity.
effects.length = 0;
requests.length = 0;
refreshRef.current = null;
revisionRef.current = null;
let currentOrigin = 'old-origin', currentRevision = 0;
const geocodes = [];
const handlerStart = home.indexOf('  async function refreshLocation() {', home.indexOf('function GoogleMapsRoutePreview('));
const handlerEnd = home.indexOf('  const mapsUrl =', handlerStart);
assert.ok(handlerStart >= 0 && handlerEnd > handlerStart);
const refreshLocation = new Function('getCurrentGeoPosition', 'coordsLabel', 'setOrigin', 'setLocationRevision', 'setOriginLabel', 'onOriginLabel', 'reverseGeocodePosition', 'toast', 'locationRequestRef', 'storage', transpile(home.slice(handlerStart, handlerEnd)) + ';return refreshLocation;')(
  async () => ({ lat: 1, lng: 2 }), () => 'GPS-new-origin',
  value => { currentOrigin = value; }, update => { currentRevision = update(currentRevision); },
  () => {}, null, () => new Promise(resolve => geocodes.push(resolve)), { success() {}, error(error) { throw Error(error); } }, {current:0}, {set() {}},
);
render(currentOrigin, currentRevision);
const beforeGps = requests.length;
const locating = refreshLocation();
await Promise.resolve();
render(currentOrigin, currentRevision);
assert.equal(requests.length, beforeGps + 1, 'GPS starts exactly one route before geocode finishes');
requests.at(-1)({ ok: true, distanceMeters: 12000 });
await Promise.resolve();
geocodes.shift()({ shortAddress: 'Synthetic address' });
await locating;
render(currentOrigin, currentRevision);
assert.equal(requests.length, beforeGps + 1, 'delayed address label must not start another route request');
const sameCoordinates = refreshLocation();
await Promise.resolve();
render(currentOrigin, currentRevision);
assert.equal(requests.length, beforeGps + 2, 'same coordinates still get exactly one explicit refresh');
requests.at(-1)({ ok: false, message: 'offline' });
await Promise.resolve();
geocodes.shift()({ shortAddress: 'Same address' });
await sameCoordinates;
render(currentOrigin, currentRevision);
assert.equal(requests.length, beforeGps + 2, 'same-coordinate label also must not trigger duplicate');
assert.equal(states.at(-1).clientRouteState, 'stale');
assert.equal(states.at(-1).distanceMeters, 12000);
effects.forEach(effect => effect.cleanup?.());
console.log('PASS real async GPS handler: delayed geocode causes no duplicate, same-coordinate refresh retains valid route on failure');
