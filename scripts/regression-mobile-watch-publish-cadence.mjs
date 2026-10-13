// Exercise the actual Home effect offline: no duplicate publisher implementation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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
let calls = 0, fail = false;
const events = [{}], event = { id: 'fictional-flight', gate: '12' };
const window = {
  dispatchEvent(e) { published.push(e); },
  addEventListener(name, handler) { assert(!listeners.has(name)); listeners.set(name, handler); },
  removeEventListener(name, handler) { assert.equal(listeners.get(name), handler); listeners.delete(name); },
  setInterval(handler, delay) { assert.equal(delay, 60_000); timers.set(1, handler); return 1; },
  clearInterval(id) { assert(timers.delete(id)); },
};
const context = vm.createContext({ window, events, event,
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  buildCrewCheckWatchSnapshot(actualEvents, actualEvent) { assert.equal(actualEvents, events); assert.equal(actualEvent, event); calls++; if (fail) throw Error('fictional unavailable snapshot'); return { call: calls, gate: actualEvent.gate }; },
});
const cleanup = vm.runInContext(`(() => {\n${source.slice(start, end)}\n})()`, context);
assert.equal(calls, 1); // Immediate publication, not a minute-long first-sync wait.
assert.equal(published[0].type, 'crewcheck:watch-snapshot');
for (const name of ['crewcheck:watch-snapshot-request', 'crewcheck:native-ready']) listeners.get(name)();
assert.equal(calls, 3);
event.gate = '15'; timers.get(1)(); assert.equal(published.at(-1).detail.gate, '15');
assert.equal(calls, 4); assert.equal(published.length, 4);
fail = true; assert.doesNotThrow(() => timers.get(1)()); assert.equal(published.length, 4);
cleanup(); assert.equal(listeners.size, 0); assert.equal(timers.size, 0);
console.log('PASS actual Home snapshot effect: immediate/request/native-ready/minute cadence, fresh data, error isolation and cleanup');
