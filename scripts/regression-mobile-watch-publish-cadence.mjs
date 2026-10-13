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
const snapshotSource = fs.readFileSync('client/src/lib/watchContext.ts', 'utf8');
const executable = stripTypeScriptTypes(snapshotSource);
assert.equal((executable.match(/export function buildCrewCheckWatchSnapshot/g) || []).length, 1);
const snapshotModule = vm.createContext({});
vm.runInContext(executable.replace('export function buildCrewCheckWatchSnapshot', 'function buildCrewCheckWatchSnapshot')
  + '\nglobalThis.actualSnapshot = buildCrewCheckWatchSnapshot;', snapshotModule);
const now = Date.parse('2032-10-13T10:00:00Z');
const flight = (id, flightNumber, date, gate) => ({ id, kind: 'flight', flightNumber,
  origin: 'BSB', destination: 'GRU', gate, presentation: '09:30',
  canonical: { id: 'canonical-' + id, journeyId: id, startDateTime: date + 'T12:00:00Z', endDateTime: date + 'T14:00:00Z' } });
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
const context = vm.createContext({ window, events, event,
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  buildCrewCheckWatchSnapshot(actualEvents, actualEvent) { assert.equal(actualEvents, events); calls++; return snapshotModule.actualSnapshot(actualEvents, actualEvent, null, now); },
});
const cleanup = vm.runInContext(`(() => {\n${source.slice(start, end)}\n})()`, context);
assert.equal(calls, 1); // Immediate publication, not a minute-long first-sync wait.
assert.equal(published[0].type, 'crewcheck:watch-snapshot');
function assertPublished(selected, gate, remoteStand = false) {
  const snapshot = published.at(-1).detail;
  assert.equal(snapshot.contextId, selected.canonical.id);
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
const countBeforeFailure = published.length;
// Force the actual builder to throw through a fixture getter, never a fake builder.
Object.defineProperty(event, 'gate', { get() { throw Error('fictional unavailable snapshot'); } });
assert.doesNotThrow(() => timers.get(1)()); assert.equal(published.length, countBeforeFailure);
cleanup(); assert.equal(listeners.size, 0); assert.equal(timers.size, 0);
console.log('PASS actual Home effect + actual TS snapshot builder: cadence, active flight/date context and gate isolation, missing/remote gates, error isolation and cleanup');
