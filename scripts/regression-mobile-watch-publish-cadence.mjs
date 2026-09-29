import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Mobile-only acceptance of the publishing optimization extracted from #836.
const source = fs.readFileSync('client/src/lib/watchContext.ts', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
assert.match(source, /export function watchSnapshotContentSignature/);
assert.match(source, /generatedAtEpochMs: _generated, validUntilEpochMs: _validUntil/);
assert.match(source, /WATCH_UNCHANGED_REPUBLISH_MS = 10 \* 60 \* 1000/);
assert.match(source, /Math\.max\(now \+ 15 \* 60 \* 1000/);
assert.match(home, /const onRequest = \(\) => publishWatchSnapshot\(true\);/);
assert.match(home, /setInterval\(\(\) => publishWatchSnapshot\(false\), 60_000\)/);
assert.match(source, /premiumAccess = storedWatchPremiumAccess\(\)/);
const mod = { exports: {} };
const transpiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(transpiled, { exports: mod.exports, require: name => {
  assert.equal(name, '@/lib/authClient');
  return { getStoredUser: () => ({ premiumAccess: false }) };
}, Date, Intl }, { timeout: 1000 });
const { watchSnapshotContentSignature: signature, WATCH_UNCHANGED_REPUBLISH_MS: interval, buildCrewCheckWatchSnapshot: build } = mod.exports;
const snapshot = build([], { placeholder: true }, null, 1000000);
assert.equal(snapshot.premiumAccess, false);
assert.equal(signature(snapshot), signature({ ...snapshot, generatedAtEpochMs: 2000000, validUntilEpochMs: 3000000 }));
for (const changed of [{ gate: '42' }, { state: 'REPORTING' }, { premiumAccess: true }, { contextId: 'other' }, { schedule: [{ id: 'other' }] }]) {
  assert.notEqual(signature(snapshot), signature({ ...snapshot, ...changed }));
}
// Execute the real Home publication closure, not a copied policy.
const start = home.indexOf("    let lastSignature = '';");
const end = home.indexOf('\n    publishWatchSnapshot(true);', start);
assert.ok(start >= 0 && end > start, 'Find the transferred Home publishing closure');
const closure = ts.transpileModule(home.slice(start, end) + '\nthis.publish = publishWatchSnapshot;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let now = 1000000, current = { ...snapshot }, published = [];
const env = { watchSnapshotContentSignature: signature, WATCH_UNCHANGED_REPUBLISH_MS: interval,
  readRadarSnapshot: () => null, RADAR_CARD_CACHE_TTL_MS: 6 * 60 * 60 * 1000,
  buildCrewCheckWatchSnapshot: () => current, events: [], event: {}, Date: { now: () => now },
  CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
  window: { dispatchEvent: event => published.push(event) },
};
vm.runInNewContext(closure, env, { timeout: 1000 });
env.publish(true); assert.equal(published.length, 1);
now += 60000; current = { ...current, generatedAtEpochMs: now, validUntilEpochMs: now + 3600000 };
env.publish(false); assert.equal(published.length, 1, 'Unchanged minute tick is quiet');
env.publish(true); assert.equal(published.length, 2, 'Explicit sync always publishes');
current = { ...current, gate: '42' }; env.publish(false); assert.equal(published.length, 3);
current = { ...current, premiumAccess: true }; env.publish(false); assert.equal(published.length, 4);
now += interval - 1; env.publish(false); assert.equal(published.length, 4);
now += 1; env.publish(false); assert.equal(published.length, 5, 'Heartbeat at ten minutes');
assert.ok(published.every(e => e.type === 'crewcheck:watch-snapshot'));
console.log('Mobile watch cadence: PASS (signatures, entitlement, actual Home closure, force, change and heartbeat)');

const flight = { id: 'demo-flight', kind: 'flight', flightNumber: 'LA9001', gate: '' };
env.event = flight; env.events = [flight];
let radar = { ok: true, gate: '9', updatedAt: now };
env.readRadarSnapshot = () => radar;
env.buildCrewCheckWatchSnapshot = (events, event) => ({
  ...current, gate: event.gate, schedule: events.map(e => ({ id: e.id, gate: e.gate })),
  validUntilEpochMs: now + 6 * 60 * 60 * 1000,
});
env.publish(false);
assert.equal(published.at(-1).detail.gate, '9', 'Radar gate reaches the watch payload');
assert.equal(published.at(-1).detail.schedule[0].gate, '9');
assert.equal(flight.gate, '', 'Canonical roster is not mutated');
radar = { ...radar, gate: '12' }; env.publish(false);
assert.equal(published.at(-1).detail.gate, '12', 'Gate change publishes without waiting for heartbeat');
radar = { ...radar, updatedAt: now - 6 * 60 * 60 * 1000 + 30000 }; env.publish(true);
assert.equal(published.at(-1).detail.validUntilEpochMs, now + 30000, 'Gate freshness is not renewed');
now += 30000; env.publish(false);
assert.equal(published.at(-1).detail.gate, '', 'Expired gate clears');
for (const invalid of [null, { ok: false, gate: '99', updatedAt: now },
  { ok: true, gate: '99', updatedAt: now + 1 }, { ok: true, gate: '--', updatedAt: now }]) {
  radar = invalid; env.publish(true);
  assert.equal(published.at(-1).detail.gate, '', 'Unavailable/invalid Radar does not inject a gate');
}
assert.match(home, /addEventListener\('crewcheck:radar-updated', onRadar\)/);
assert.match(home, /removeEventListener\('crewcheck:radar-updated', onRadar\)/);
console.log('Mobile Radar to watch: PASS (gate, schedule, change, expiry, failure, no roster mutation)');
