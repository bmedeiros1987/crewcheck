import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { newestImports, startupCanCommit, pastRosterPeriod } from '../shared/rosterStartup.mjs';
const start = { owner: 'user-a', token: 'session-a', revision: 1 };
assert.equal(startupCanCommit(start, { ...start, cleared: false }), true);
for (const changed of [{ owner: 'user-b' }, { token: null }, { token: 'new-login' }, { revision: 2 }, { cleared: true }]) {
  assert.equal(startupCanCommit(start, { ...start, cleared: false, ...changed }), false);
}
const imports = [
  { id: 'nominal-new', createdAt: '2026-09-01', month: 12, isActive: true },
  { id: 'latest-v1', uploadedAt: '2026-10-01', month: 7, version: 1 },
  { id: 'latest-v2', uploadedAt: '2026-10-01', month: 7, version: 2 },
  { id: 'deleted', uploadedAt: '2026-10-07', deletedAt: '2026-10-07' },
  { id: 'failed', uploadedAt: '2026-10-07', importStatus: 'failed' },
];
assert.deepEqual(newestImports(imports).map(x => x.id), ['latest-v2', 'latest-v1', 'nominal-new']);
assert.equal(pastRosterPeriod({ year: 2026, month: 7 }, new Date('2026-10-07')), true);
assert.equal(pastRosterPeriod({ year: 2026, month: 10 }, new Date('2026-10-07')), false);
let user = { id: 'user-a' }, token = 'session-a', responses = [], calls = [];
const local = new Map();
const auth = { getStoredUser: () => user, getToken: () => token, authFetch: async url => {
  calls.push(url);
  const response = responses.shift();
  if (typeof response === 'function') return response();
  if (response instanceof Error) throw response;
  return response;
} };
const exports = {};
const source = ts.transpileModule(fs.readFileSync('client/src/lib/rosterStartup.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(source, { exports, require: name => name === './authClient' ? auth : { newestImports }, localStorage: { getItem: key => local.get(key) }, window: { dispatchEvent() {} }, CustomEvent: class {} });
responses = [{ ok: true, rosters: imports }, { ok: true, data: { roster: { days: [{}], month: 7, year: 2026 } } }];
assert.equal((await exports.restoreLatestImport()).roster.month, 7);
assert.equal(calls.at(-1), '/api/rosters/latest-v2');
responses = [{ ok: true, rosters: [] }];
assert.equal(await exports.restoreLatestImport(), null);
for (const status of [401, 403, 500]) {
  const error = Object.assign(new Error('HTTP'), { status }); responses = [error];
  await assert.rejects(exports.restoreLatestImport(), e => e === error);
}
responses = [{ ok: true }]; await assert.rejects(exports.restoreLatestImport(), /inválida/);
responses = [{ ok: true, rosters: [{ id: 'invalid' }, { id: 'valid' }] }, { ok: true, data: { roster: { days: [] } } }, { ok: true, data: { roster: { days: [{}] } } }];
assert.ok((await exports.restoreLatestImport()).roster.days.length);
responses = [() => { user = { id: 'user-b' }; return { ok: true, rosters: [] }; }];
await assert.rejects(exports.restoreLatestImport(), /Sessão alterada/);
user = { id: 'user-a' }; const a = exports.startupKey(); local.set(a, JSON.stringify({ cleared: true }));
assert.equal(exports.startupCleared(), true);
user = { id: 'user-b' }; assert.notEqual(exports.startupKey(), a); assert.equal(exports.startupCleared(), false);
user = { id: 'user-a' }; const firstChoice = exports.beginRosterChoice(); const secondChoice = exports.beginRosterChoice();
assert.equal(firstChoice(), false); assert.equal(secondChoice(), true); token = null; assert.equal(secondChoice(), false);
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
assert.match(home, /if \(!primary.days\?\.length\) return;/);
assert.match(home, /function currentCompliance[^\n]+bundle.roster.days\?\.length/);
assert.match(home, /payload.owner !== startupOwner\(\)/);
assert.match(home, /view === 'alerts' && !bundle.roster.days\?\.length/);
assert.match(home, /view === 'salary' && !bundle.roster.days\?\.length/);
assert.match(home, /historyError \? <article/);
assert.match(home, /rosterWindowPrimaryRef.current === bundle.roster/);
assert.match(home, /openActive: \(\) => \{ const canCommit = beginRosterChoice\(\)/);
console.log('PASS: startup ordering, empty/loading/error gates, session and choice races, clear intent, stale period; synthetic data only.');
