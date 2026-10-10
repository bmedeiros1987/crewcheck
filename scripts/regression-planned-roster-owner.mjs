import assert from 'node:assert/strict';
import { loadClientModules } from './lib/ts-module-harness.mjs';

const originals = { localStorage: globalThis.localStorage, window: globalThis.window };
const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
globalThis.window = new EventTarget();
const modules = loadClientModules({ files: ['client/src/lib/plannedRosterStore.ts'], prefix: 'synthetic-planned-owner-' });
try {
  const store = modules.load('plannedRosterStore');
  const auth = modules.load('financialStatementLearning');
  const session = (owner, token = 'synthetic-' + owner, role = 'user') => {
    localStorage.setItem('crewcheck_auth_user', JSON.stringify({ id: owner, role }));
    if (token) localStorage.setItem('crewcheck_auth_token', token); else localStorage.removeItem('crewcheck_auth_token');
  };
  const roster = { year: 2032, month: 10, base: 'BSB', rank: 'CC', airline: 'LA', days: [{ date: '10/10/2032', type: 'ASB', pairingCode: 'ASB', dutyReport: '04:10', dutyDebrief: '10:10', legs: [] }] };
  session('SYN-A');
  const sessionA = auth.financialRateSession();
  const a = store.saveOwnedPlannedRoster(roster, 'SYNTHETIC A');
  assert.ok(a); assert.equal(a.owner, 'SYN-A'); assert.deepEqual(a.period, { year: 2032, month: 10 });
  const rawA = localStorage.getItem(store.plannedRosterKey('SYN-A'));
  localStorage.setItem('crewcheck_planned_roster_snapshot_v1', JSON.stringify({ roster, source: 'UNOWNED SYNTHETIC A' }));
  modules.load('authClient').clearSession();
  assert.equal(store.loadOwnedPlannedRoster(), null, 'actual clearSession leaves owned reference inaccessible while signed out');
  session('SYN-B');
  assert.equal(store.loadOwnedPlannedRoster(), null, 'same period cannot load another owner or unowned legacy');
  assert.equal(store.isCurrentPlannedRoster(a), false);
  assert.equal(store.saveOwnedPlannedRoster(roster, 'stale A handler', sessionA), null);
  assert.equal(store.clearOwnedPlannedRoster(sessionA), false);
  assert.equal(localStorage.getItem(store.plannedRosterKey('SYN-A')), rawA);
  const b = store.saveOwnedPlannedRoster(roster, 'SYNTHETIC B'); assert.ok(b);
  const rawB = localStorage.getItem(store.plannedRosterKey('SYN-B'));
  for (const forged of [a, { ...b, owner: undefined }, { ...b, version: 1 }, { ...b, period: { year: 2032, month: 9 } }, { ...b, fingerprint: 'forged' }, { ...b, capturedAt: 'invalid' }, { ...b, source: '' }, { ...b, roster: { ...roster, days: [] } }]) {
    localStorage.setItem(store.plannedRosterKey('SYN-B'), JSON.stringify(forged));
    assert.equal(store.loadOwnedPlannedRoster(), null, 'invalid metadata/owner/fingerprint rejected');
  }
  localStorage.setItem(store.plannedRosterKey('SYN-B'), rawB);
  assert.equal(store.loadOwnedPlannedRoster().source, 'SYNTHETIC B');
  const previousB = auth.financialRateSession(); session('SYN-B', 'rotated-synthetic-token');
  assert.equal(store.saveOwnedPlannedRoster(roster, 'expired handler', previousB), null);
  modules.load('authClient').expireSession(); assert.equal(store.loadOwnedPlannedRoster(), null);
  assert.equal(store.saveOwnedPlannedRoster(roster, 'expired'), null);
  session('SYN-B', 'visitor-token', 'visitor'); assert.equal(store.loadOwnedPlannedRoster(), null);
  assert.equal(store.saveOwnedPlannedRoster(roster, 'visitor'), null); assert.equal(store.clearOwnedPlannedRoster(), false);
  session('SYN-A', 'new-synthetic-A-token'); assert.equal(store.loadOwnedPlannedRoster().source, 'SYNTHETIC A', 'same owner can resume their own reference');
  assert.equal(store.clearOwnedPlannedRoster(), true); assert.equal(store.loadOwnedPlannedRoster(), null);
  assert.equal(localStorage.getItem(store.plannedRosterKey('SYN-B')), rawB, 'clear removes only current owner');
  assert.ok(localStorage.getItem('crewcheck_planned_roster_snapshot_v1'), 'legacy ignored without deleting user data');
  console.log('PASS planned reference owner/session/visitor/expiry/forged metadata/period/fingerprint isolation, stale handlers, own-only clear and legacy ignored; synthetic accounts only');
} finally {
  modules.cleanup();
  for (const [key, value] of Object.entries(originals)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
}
