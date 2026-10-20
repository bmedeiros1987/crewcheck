import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
// Only dbPool is replaced. The handler's default authentication, token parsing,
// JWT verification and profile lookup execute their actual repository bodies.
const compiled = await build({ stdin: { contents: "export { handleBidsAlertPreferences } from './server/v139/bidsAlertPreferences.mjs'; export { issueJwt } from './server/v139/common.mjs';", resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'cjs', plugins: [{ name: 'isolated-pool-only', setup(build) { build.onLoad({ filter: /server\/v139\/common\.mjs$/ }, ({ path }) => {
  const source = fs.readFileSync(path, 'utf8');
  const changed = source.replace(/export async function dbPool\(\) \{[\s\S]*?\n\}\n\nexport function parseJsonColumn/, 'export async function dbPool() { return globalThis.fixtureDb; }\n\nexport function parseJsonColumn');
  assert.notEqual(changed, source); return { contents: changed, loader: 'js' };
}); } }] });
const statements = []; let profile = null;
const fixtureDb = { query: async (sql, values) => {
  statements.push(sql);
  if (sql.startsWith('SELECT * FROM crewcheck_platform_profiles')) return [[profile].filter(Boolean)];
  if (sql.includes('INSERT INTO crewcheck_platform_profiles')) { profile = { public_id: values[1], email: values[0] }; return [{ affectedRows: 1 }]; }
  if (sql.startsWith('SELECT p.public_id')) return [[{ public_id: profile.public_id, payload: null }]];
  throw Error('Unexpected SQL in authentication regression');
} };
const module = { exports: {} }; const sandbox = { module, exports: module.exports, require, Buffer, console, fixtureDb, process: { env: { CREWCHECK_AUTH_SECRET: 'fictional-regression-only-not-a-deployed-key' } } };
vm.runInNewContext(compiled.outputFiles[0].text, sandbox);
const { handleBidsAlertPreferences, issueJwt } = module.exports;
const token = issueJwt({ id: 'owner-old', email: 'fictional@fixture.invalid', name: 'Synthetic' });
async function read() {
  let status, payload; const res = { setHeader() {}, writeHead(value) { status = value; }, end(value) { payload = JSON.parse(value); } };
  await handleBidsAlertPreferences({ method: 'GET', headers: { authorization: `Bearer ${token}` } }, res, new URL('https://fixture.invalid/api/platform/bids/alert-preferences'));
  return { status, payload };
}
const missing = await read(); assert.equal(missing.status, 401);
assert.equal(profile, null, 'deleted profile must not be recreated by observational GET');
assert(statements.every(sql => sql.startsWith('SELECT')), 'real auth chain must perform no INSERT/UPDATE/DELETE');
profile = { public_id: 'owner-new', email: 'fictional@fixture.invalid' }; statements.length = 0;
assert.equal((await read()).status, 401); assert(statements.every(sql => sql.startsWith('SELECT')));
profile.public_id = 'owner-old'; statements.length = 0;
assert.equal((await read()).status, 200); assert(statements.every(sql => sql.startsWith('SELECT')));
console.log('PASS real BIDS authentication boundary: actual handler/default auth/JWT/profile chain, absent profile and stale owner rejected without recreation; current owner observational, mock pool only, no real account or credentials.');
