import * as airportTimeZones from '../shared/airport-timezones.mjs';
import * as gateQueryDay from '../shared/gate-query-day.mjs';
// Exercise the actual Home effect offline: no duplicate publisher implementation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
const source = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const marker = '    const publishWatchSnapshot = () => {';
const start = source.indexOf(marker);
assert(start >= 0 && source.indexOf(marker, start + 1) < 0, 'One actual snapshot effect required');
const end = source.indexOf('\n  }, [', start);
assert(end > start);
const dependencyEnd = source.indexOf(']);', end);
const dependencies = source.slice(end, dependencyEnd);
for (const field of ['events', 'event.id', 'event.presentation', 'event.gate', 'event.status']) assert(dependencies.includes(field), `Fresh effect dependency required: ${field}`);
const listeners = new Map(), timers = new Map(), published = [];
const now = Date.parse('2032-10-13T10:00:00Z');
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const stored = new Map();
const localStorage = {
  getItem: key => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, String(value)),
  removeItem: key => stored.delete(key),
};
localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: 'synthetic-watch-cadence-owner' }));
// Strip types only; execute real modules in separate scopes with their real imports.
// This guard also supports current main before the Next Flight imports are integrated.
function actualModule(name, imports = {}) {
  const filename = `client/src/lib/${name}.ts`;
  let executable = stripTypeScriptTypes(fs.readFileSync(filename, 'utf8'));
  if (name === 'watchContext') assert.equal((executable.match(/export function buildCrewCheckWatchSnapshot/g) || []).length, 1);
  const exported = [...executable.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map(match => match[1]);
  assert(exported.length, `Actual exports required: ${filename}`);
  executable = executable.replace(/^import \{([^}]+)\} from ['"]([^'"]+)['"];?$/gm, (_, names, dependency) => {
    assert(imports[dependency], `Actual dependency required: ${dependency}`);
    return `const {${names.replace(/\bas\b/g, ':')}} = dependencies[${JSON.stringify(dependency)}];`;
  });
  assert(!/^import /m.test(executable), `Unsupported actual import: ${filename}`);
  return vm.runInNewContext(executable.replace(/^export /gm, '') + `\n({${exported.join(',')}})`,
    { Date: FixtureDate, localStorage, dependencies: imports }, { filename });
}
const snapshotModule = actualModule('watchContext', { '../../../shared/airport-timezones.mjs': airportTimeZones });
const gateBindings = {};
if (source.includes("from '@/lib/nextFlightGate'")) {
  const display = actualModule('rosterDisplayDate');
  const gate = actualModule('nextFlightGate', { '@/lib/rosterDisplayDate': display, '../../../shared/gate-query-day.mjs': gateQueryDay });
  const watch = actualModule('nextFlightWatch', { '@/lib/nextFlightGate': gate });
  const auth = actualModule('authClient');
  Object.assign(gateBindings, gate, watch, { getStoredUser: auth.getStoredUser });
}
const flight = (id, flightNumber, date, gate) => ({ id, kind: 'flight', flightNumber,
  origin: 'BSB', destination: 'GRU', gate, presentation: '09:30',
  canonical: { id: 'canonical-' + id, journeyId: id, leg:{departureTime:'09:00'}, legIndex:0, startDateTime: date + 'T12:00:00Z', endDateTime: date + 'T14:00:00Z' } });
const event = flight('active-2032-10-13', 'LA100', '2032-10-13', '12');
const otherFlight = flight('other-2032-10-13', 'LA200', '2032-10-13', '99');
const otherDate = flight('same-flight-2032-10-14', 'LA100', '2032-10-14', '88');
const events = [otherFlight, event, otherDate];
let calls = 0;
const window = {
  dispatchEvent(e) { published.push(e); },
  addEventListener(name, handler) { assert(!listeners.has(name)); listeners.set(name, handler); },
  removeEventListener(name, handler) { assert.equal(listeners.get(name), handler); listeners.delete(name); },
  setInterval(handler, delay) { assert.equal(delay, 60_000); timers.set(1, handler); return 1; },
  clearInterval(id) { assert(timers.delete(id)); },
};
const context = vm.createContext({ window, events, event, localStorage, Date: FixtureDate, ...gateBindings,
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  buildCrewCheckWatchSnapshot(actualEvents, actualEvent) { assert.equal(actualEvents, events); calls++; return snapshotModule.buildCrewCheckWatchSnapshot(actualEvents, actualEvent, null, now); },
});
const cleanup = vm.runInContext(`(() => {\n${source.slice(start, end)}\n})()`, context);
assert.equal(calls, 1); // Immediate publication, not a minute-long first-sync wait.
assert.equal(published[0].type, 'crewcheck:watch-snapshot');
function assertPublished(selected, gate, remoteStand = false) {
  const snapshot = published.at(-1).detail;
  assert.equal(snapshot.contextId, selected.canonical.id);
  if (selected === otherDate) {
    assert.equal(snapshot.currentFlight, '');
    assert.equal(snapshot.presentationTime, '');
    assert.equal(snapshot.gate, '');
    assert.match(snapshot.detail, /14\/10.*BRT/);
    return;
  }
  assert.equal(snapshot.currentFlight, selected.flightNumber);
  assert.equal(snapshot.gate, gate);
  assert.equal(snapshot.remoteStand, remoteStand);
  assert.equal(snapshot.source, 'canonical-roster');
}
assertPublished(event, '12');
assert.notEqual(published[0].detail.contextId, otherFlight.canonical.id);
assert.notEqual(published[0].detail.contextId, otherDate.canonical.id);
for (const name of ['crewcheck:watch-snapshot-request', 'crewcheck:native-ready']) listeners.get(name)();
assert.equal(calls, 3);
event.gate = '15'; timers.get(1)(); assertPublished(event, '15');
assert.equal(calls, 4); assert.equal(published.length, 4);
for (const selected of [otherFlight, otherDate, event]) {
  context.event = selected; listeners.get('crewcheck:watch-snapshot-request')();
  assertPublished(selected, selected.gate);
}
context.event = event;
for (const gate of [undefined, '', '—', 'A confirmar']) {
  event.gate = gate; timers.get(1)(); assertPublished(event, '');
}
for (const gate of ['REMOTA', 'PÁTIO']) {
  event.gate = gate; listeners.get('crewcheck:native-ready')(); assertPublished(event, '', true);
}
if (gateBindings.MANUAL_GATE_EVENT) {
  for (const name of ['crewcheck:radar-updated', gateBindings.MANUAL_GATE_EVENT]) {
    assert.equal(typeof listeners.get(name), 'function');
    const before = published.length;
    listeners.get(name)();
    assert.equal(published.length, before + 1);
    assertPublished(event, '', true);
  }
}
const countBeforeFailure = published.length;
// Force the actual builder to throw through a fixture getter, never a fake builder.
Object.defineProperty(event, 'gate', { get() { throw Error('fictional unavailable snapshot'); } });
assert.doesNotThrow(() => timers.get(1)()); assert.equal(published.length, countBeforeFailure);
cleanup(); assert.equal(listeners.size, 0); assert.equal(timers.size, 0);
console.log('PASS actual Home effect + actual TS snapshot builder: cadence, active flight/date context and gate isolation, missing/remote gates, error isolation and cleanup');
