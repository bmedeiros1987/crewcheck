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
let radar = null;
const baseEvent = { id: 'demo-flight', kind: 'flight', flightNumber: 'LA9001', gate: '', placeholder: false };
const env = { watchSnapshotContentSignature: signature, WATCH_UNCHANGED_REPUBLISH_MS: interval,
  RADAR_CARD_CACHE_TTL_MS: 6 * 60 * 60 * 1000,
  readRadarSnapshot: () => radar,
  confirmedRadarGate: value => {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized || normalized === '—' || normalized === '-' || /CONFIRMAR|INFORMAD|UNKNOWN|N\/A/.test(normalized)) return '';
    return normalized;
  },
  buildCrewCheckWatchSnapshot: () => current, events: [baseEvent], event: baseEvent, Date: { now: () => now },
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

env.event = baseEvent;
env.events = [baseEvent];
env.buildCrewCheckWatchSnapshot = (events, selected) => ({
  ...current,
  gate: selected.gate || '',
  schedule: events.map(item => ({ id: item.id, gate: item.gate || '' })),
  validUntilEpochMs: now + 6 * 60 * 60 * 1000,
});
radar = { ok: true, gate: '9', updatedAt: now };
env.publish(false);
assert.equal(published.at(-1).detail.gate, '9', 'validated Radar gate must reach the watch projection');
assert.equal(published.at(-1).detail.schedule[0].gate, '9', 'schedule projection must receive the same validated gate');
assert.equal(baseEvent.gate, '', 'canonical roster event must remain immutable');

radar = { ok: true, gate: '12', updatedAt: now };
env.publish(false);
assert.equal(published.at(-1).detail.gate, '12', 'Radar gate change must publish without waiting for heartbeat');

radar = { ok: true, gate: '15', updatedAt: now - 6 * 60 * 60 * 1000 + 30_000 };
env.publish(true);
assert.equal(published.at(-1).detail.validUntilEpochMs, now + 30_000, 'device snapshot must not outlive Radar gate freshness');

now += 30_000;
env.publish(false);
assert.equal(published.at(-1).detail.gate, '', 'expired Radar gate must be removed from the device projection');

radar = { ok: true, gate: '99', updatedAt: now + 1 };
env.publish(true);
assert.equal(published.at(-1).detail.gate, '', 'future Radar timestamps must fail closed');

radar = { ok: false, gate: 'A20', updatedAt: now };
env.publish(true);
assert.equal(published.at(-1).detail.gate, '', 'unavailable Radar data must not enter the watch projection');

assert.match(home, /addEventListener\('crewcheck:radar-updated', onRadar\)/);
assert.match(home, /removeEventListener\('crewcheck:radar-updated', onRadar\)/);
assert.doesNotMatch(home.slice(home.indexOf('const publishWatchSnapshot'), home.indexOf('useEffect(() => {\n    \/\/ A escala ativa')), /publishCrewCheckNotice\(/,
  'watch producer must not create a second phone-side gate notification');
console.log('Mobile watch cadence + Radar gate projection: PASS');
