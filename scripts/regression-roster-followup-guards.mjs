import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const classification = {}, policy = {};
vm.runInNewContext(compile(fs.readFileSync('client/src/lib/scheduleActivityClassification.ts', 'utf8')), { exports: classification });
vm.runInNewContext(compile(fs.readFileSync('client/src/lib/airportDeparturePolicy.ts', 'utf8')), { exports: policy, require: () => classification });
if (!process.argv.includes('--storage') && !process.argv.includes('--empty')) {
  const sa = { kind: 'duty', flightNumber: 'SA', presentation: '02:00', origin: 'BSB', destination: 'BSB', day: { type: 'SA', legs: [] }, canonical: { kind: 'duty', code: 'SA' } };
  assert.equal(policy.isHomeStandby(sa), true, 'bare SA code is home standby');
  assert.equal(classification.isSmartDepartureEligible(sa), false);
  assert.equal(policy.isAirportDepartureEligible(sa), false);
  assert.equal(policy.isAirportDepartureEligible({ ...sa, activated: true }), false);
  assert.equal(policy.isAirportDepartureEligible({ ...sa, airportAssignment: true }), false);
  assert.equal(policy.isAirportDepartureEligible({ ...sa, activated: true, airportAssignment: true }), true);
}
class CustomEvent extends Event { constructor(type) { super(type); } }
const values = new Map(); let restricted = false, readsBlocked = false, owner = 'synthetic-a', token = 'synthetic-token';
const helper = {}, bus = new EventTarget();
const localStorage = { getItem: key => { if (readsBlocked) throw new Error('SecurityError synthetic'); return values.get(key) || null; }, setItem: (key, value) => { if (restricted) throw new Error(readsBlocked ? 'SecurityError synthetic' : 'QuotaExceededError synthetic'); values.set(key, value); } };
vm.runInNewContext(compile(fs.readFileSync('client/src/lib/rosterStartup.ts', 'utf8')), { exports: helper, require: () => ({ getStoredUser: () => ({ id: owner }), getToken: () => token }), localStorage, window: bus, CustomEvent, crypto: { randomUUID: (() => { let n = 0; return () => `synthetic-${++n}`; })() } });
if (!process.argv.includes('--sa') && !process.argv.includes('--empty')) {
  for (const prior of [null, 'synthetic-old-intent']) {
    values.clear(); if (prior) values.set(helper.startupKey() + '_intent_epoch', prior);
    restricted = true;
    const first = helper.beginRosterChoice(); assert.equal(first(), true, 'failed intent persistence retains a usable memory guard');
    const newer = helper.beginRosterChoice(); assert.equal(first(), false); assert.equal(newer(), true);
    let finished = 0; bus.addEventListener('crewcheck:roster-choice-finished', () => finished++, { once: true }); newer.finish(); assert.equal(finished, 1);
    values.set(helper.startupKey() + '_intent_epoch', 'foreign-explicit-intent'); assert.equal(newer(), false, 'foreign persisted choice still invalidates a memory fallback');
    const current = helper.beginRosterChoice(); restricted = false; helper.markStartupCleared(); assert.equal(current(), false);
  }
  const current = helper.beginRosterChoice(); owner = 'synthetic-b'; assert.equal(current(), false); owner = 'synthetic-a'; token = 'new-token'; assert.equal(current(), false);
  readsBlocked = true; restricted = true;
  const fallback = helper.beginRosterChoice(); assert.equal(fallback(), true, 'unavailable choice storage uses session and memory guard');
  helper.invalidateRosterChoices(); assert.equal(fallback(), false, 'cross-tab invalidation still cancels an unavailable-storage guard');
  readsBlocked = false; restricted = false;
}
if (!process.argv.includes('--sa') && !process.argv.includes('--storage')) {
  const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
  const ast = ts.createSourceFile('Home.tsx', home, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); let callback;
  function visit(node) { if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'openActive' && ts.isArrowFunction(node.initializer) && node.initializer.body.getText(ast).includes('openActiveRoster')) callback = node.initializer.getText(ast); ts.forEachChild(node, visit); }
  visit(ast); assert.ok(callback);
  const run = () => {
    let resolve, resolveCompliance; const pending = new Promise(r => resolve = r), compliance = new Promise(r => resolveCompliance = r); const navigated = [], notifications = [], bundles = [];
    const context = { exports: {}, beginRosterChoice: helper.beginRosterChoice, openActiveRoster: () => pending, recomputeComplianceWithRegulatoryHistory: () => compliance, setBundle: b => bundles.push(b), saveRoster: () => {}, setView: view => navigated.push(view), toast: { success: x => notifications.push(x), message: x => notifications.push(x), error: x => notifications.push(x) } };
    vm.runInNewContext(compile('export const action = ' + callback), context); context.exports.action(); return { resolve, resolveCompliance, navigated, notifications, bundles };
  };
  for (const invalidation of ['new-choice', 'clear', 'account', 'logout', 'foreign-tab']) {
    owner = 'synthetic-a'; token = 'synthetic-token'; restricted = false; const result = run();
    if (invalidation === 'new-choice') helper.beginRosterChoice();
    if (invalidation === 'clear') helper.markStartupCleared();
    if (invalidation === 'account') owner = 'synthetic-b';
    if (invalidation === 'logout') token = null;
    if (invalidation === 'foreign-tab') helper.invalidateRosterChoices();
    result.resolve(null); await new Promise(setImmediate); assert.deepEqual(result.navigated, [], 'stale empty active result must not redirect after ' + invalidation); assert.deepEqual(result.notifications, []);
  }
  owner = 'synthetic-a'; token = 'synthetic-token'; const empty = run(); empty.resolve(null); await new Promise(setImmediate); assert.deepEqual(empty.navigated, ['import'], 'current genuine empty result keeps import navigation');
  const delayed = run(); delayed.resolve({ roster: { days: [{ id: 'synthetic' }] } }); await new Promise(setImmediate); helper.beginRosterChoice(); delayed.resolveCompliance({ compliance: {} }); await new Promise(setImmediate); assert.deepEqual(delayed.bundles, []); assert.deepEqual(delayed.navigated, [], 'retain post-compliance race guard');
  const success = run(); success.resolve({ roster: { days: [{ id: 'synthetic' }] } }); success.resolveCompliance({ compliance: {} }); await new Promise(setImmediate); assert.equal(success.bundles.length, 1); assert.deepEqual(success.navigated, ['cockpit']);
}
console.log('PASS: synthetic SA, storage-failure choice guards and actual prepared stale-empty navigation regression.');
