// Existing queue/reconcile seam only. This does NOT wire Home or migrate reviews.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { createWeatherPulseState, advanceWeatherPulse, settleWeatherPulse, WEATHER_PULSE_SCOPE } from '../../shared/operational-weather-pulse.mjs';
const ts = createRequire(import.meta.url)('typescript');
const sessionSource = fs.readFileSync(new URL('../../client/src/components/pulse/pulseSession.ts', import.meta.url), 'utf8');
const runtimeSource = fs.readFileSync(new URL('../../client/src/components/pulse/pulseRuntime.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('pulseRuntime.ts', runtimeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const reconcile = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'reconcileCrewCheckPulse');
assert.equal(reconcile.length, 1);
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const make = () => {
  const callbacks = new Map(), cancelled = [], changes = []; let sequence = 0, reviewWrites = 0;
  const scope = vm.createContext({ exports: {}, saveAlertReview: () => { reviewWrites++; throw new Error('Expiry must not mark reviewed'); } });
  vm.runInContext(compile(sessionSource), scope);
  const session = scope.exports.createPulseSession(state => changes.push(state), { timers: {
    set: callback => { const id = ++sequence; callbacks.set(id, callback); return id; },
    clear: id => { cancelled.push(id); callbacks.delete(id); },
  } });
  scope.session = session;
  vm.runInContext(compile(reconcile[0].getText(ast)), scope);
  return { session, changes, cancelled, get reviewWrites() { return reviewWrites; }, reconcile: active => scope.exports.reconcileCrewCheckPulse(WEATHER_PULSE_SCOPE, active),
    tick: () => { for (const [id, callback] of [...callbacks]) { callbacks.delete(id); callback(); } } };
};
const message = (id, overrides = {}) => ({ id, title: `Synthetic ${id}`, priority: 'normal', ...overrides });
const weather = (id, overrides = {}) => message(id, { scope: WEATHER_PULSE_SCOPE, category: 'weather', priority: 'alta', review: { occurrence: id, version: 'qa-v1' }, ...overrides });

test('scope reconciliation removes queued owned weather without touching SOS, compliance, gate or unscoped legacy messages', () => {
  const h = make();
  h.session.publish(weather('qa-weather'));
  h.session.publish(message('qa-gate', { category: 'gate' }));
  h.session.publish(message('qa-sos', { priority: 'critica', dismissible: false }));
  h.session.publish(message('qa-compliance', { priority: 'alta', category: 'compliance' }));
  h.session.publish(weather('qa-other-weather', { scope: 'weather:other-producer', priority: 'normal' }));
  h.session.publish(message('qa-legacy-weather', { category: 'weather' }));
  h.reconcile([]);
  assert.equal(h.session.state.message.id, 'qa-sos'); assert.equal(h.session.state.queued, 4);
  const sequence = [];
  while (h.session.state.message) { sequence.push(h.session.state.message.id); h.session.dismiss(); h.tick(); }
  assert.deepEqual(sequence, ['qa-sos', 'qa-compliance', 'qa-gate', 'qa-other-weather', 'qa-legacy-weather']);
  assert.equal(h.reviewWrites, 0);
});
test('expiry of current leaving weather cancels its timer and keeps the next unrelated message', () => {
  const h = make(); h.session.publish(weather('qa-weather')); h.session.publish(message('qa-gate', { category: 'gate' }));
  h.session.dismiss(); assert.equal(h.session.state.leaving, true);
  h.reconcile([]);
  assert.ok(h.cancelled.length); assert.equal(h.session.state.message.id, 'qa-gate'); assert.equal(h.session.state.leaving, false);
  h.tick(); assert.equal(h.session.state.message.id, 'qa-gate'); assert.equal(h.reviewWrites, 0);
});
test('exact active review identity is retained; same occurrence with obsolete version is removed only within scope', () => {
  const h = make(); h.session.publish(weather('qa-current')); h.session.publish(weather('qa-stale'));
  h.session.publish(weather('qa-other', { scope: 'weather:other-producer' }));
  h.reconcile([{ occurrence: 'qa-current', version: 'qa-v1' }, { occurrence: 'qa-stale', version: 'qa-v2' }]);
  assert.equal(h.session.state.message.id, 'qa-current'); assert.equal(h.session.state.queued, 1);
  h.session.dismiss(); h.tick(); assert.equal(h.session.state.message.id, 'qa-other'); assert.equal(h.reviewWrites, 0);
});
test('pure observation-age expiry supplies empty owned intent set with no response, and actual queue preserves SOS', () => {
  const now = Date.parse('2032-02-02T12:00:00Z'), hour = 3_600_000;
  const context = { ownerId: 'qa-owner', sourceId: 'qa-source', sourceRevision: 'qa-v1', flights: [{ id: 'qa-flight', journeyId: 'qa-journey', kind: 'flight',
    departure: now, arrival: now + hour, departureClock: '09:00', arrivalClock: '10:00', origin: 'ZZAA', destination: 'ZZBB' }] };
  const requested = advanceWeatherPulse(createWeatherPulseState(), context, now);
  const settled = settleWeatherPulse(requested.state, context, requested.request, 'success', [{ severity: 2, report: {
    ok: true, official: true, provider: 'redemet', station: 'ZZBB', observedAt: '2032-02-02T12:00:00Z', raw: 'METAR ZZBB 021200Z 09015G30KT 3000 TSRA BKN008',
  } }], now);
  const h = make(), intent = settled.activeIntents[0]; assert.ok(intent);
  // Synthetic test mapping only; persisted Home review-key compatibility is deferred.
  h.session.publish(weather('qa-weather', { review: { occurrence: intent.bindingKey, version: intent.materialKey } }));
  h.session.publish(message('qa-sos', { priority: 'critica' }));
  const expired = advanceWeatherPulse(settled.state, context, now + hour + 1);
  assert.deepEqual(expired.activeIntents, []);
  h.reconcile(expired.activeIntents.map(item => ({ occurrence: item.bindingKey, version: item.materialKey })));
  assert.equal(h.session.state.message.id, 'qa-sos'); assert.equal(h.session.state.queued, 0); assert.equal(h.reviewWrites, 0);
});
