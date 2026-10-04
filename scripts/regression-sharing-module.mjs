import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import * as sharing from '../server/platform-sharing.mjs';

// Load the entire real platform module and its real sharing helpers. Only external
// I/O is faked. The appended export exposes pool state, not an implementation stub.
// No requireMain, subscriptionStatus, planOperationalLimits or route stub exists.
const path = new URL('../server/platform.mjs', import.meta.url);
const source = fs.readFileSync(path, 'utf8');
assert.equal((source.match(/function planOperationalLimits\(/g) || []).length, 1, 'one real helper in raw/prepared module');
const helperStart = source.indexOf('function planOperationalLimits(');
const helperEnd = source.indexOf('async function requirePremium(', helperStart);
assert.ok(helperEnd > helperStart);
const email = 'module-test@example.invalid';
const secret = 'synthetic-test-secret-never-used-in-production';
function token() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ email, role: 'free', exp: Math.floor(Date.now()/1000)+60 })).toString('base64url');
  return `${header}.${body}.${crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')}`;
}
async function load(text, premium = false) {
  const statements = [];
  const db = {
    async query(sql) {
      statements.push(sql);
      if (/SELECT \* FROM crewcheck_platform_profiles/.test(sql)) return { rows: [{ email, public_id: 'CC-SYNTHETIC', plan: premium ? 'premium_unlimited' : 'free', timezone: 'America/Sao_Paulo' }] };
      if (/SELECT email FROM crewcheck_platform_profiles/.test(sql)) return { rows: [{ email }] };
      if (/^UPDATE crewcheck_platform_profiles|^(BEGIN|COMMIT|ROLLBACK)$/.test(sql.trim())) return { rows: [] };
      if (/FROM crewcheck_platform_subscriptions|FROM crewcheck_platform_usage/.test(sql)) return { rows: [] };
      if (/SELECT COUNT\(\*\) count FROM crewcheck_platform_visitors/.test(sql)) return { rows: [{ count: premium ? 5 : 1 }] };
      if (/FROM crewcheck_platform_visitors/.test(sql) && /^SELECT/.test(sql)) return { rows: [] };
      throw new Error('Unexpected test DB operation: ' + sql.slice(0, 70));
    },
    async connect() { return { query: this.query.bind(this), release() {} }; },
  };
  const context = vm.createContext({ Buffer, URL, console: { error() {}, log() {} },
    process: { env: { NODE_ENV: 'test', DATABASE_URL: 'mysql://synthetic.invalid/test', CREWCHECK_AUTH_SECRET: secret } },
    fetch() { throw new Error('Network forbidden in module test'); } });
  const module = new vm.SourceTextModule(text + '\nexport { state as __testState };', {
    context, identifier: path.href, initializeImportMeta(meta) { meta.url = path.href; },
    importModuleDynamically() { throw new Error('Dynamic imports / real database forbidden'); },
  });
  await module.link(specifier => {
    const values = specifier === 'node:crypto' ? { default: crypto }
      : specifier === 'node:fs' ? { readFileSync: fs.readFileSync }
      : specifier === './platform-sharing.mjs' ? sharing
      : specifier === './cirium-diagnostic.mjs' ? { diagnoseCirium() { throw new Error('External API forbidden'); }, diagnoseCiriumFlight() { throw new Error('External API forbidden'); } }
      : null;
    assert.ok(values, `unexpected module dependency ${specifier}`);
    return new vm.SyntheticModule(Object.keys(values), function () { for (const [key, value] of Object.entries(values)) this.setExport(key, value); }, { context });
  });
  await module.evaluate();
  module.namespace.__testState.poolPromise = Promise.resolve(db);
  return { statements, async request(method, authenticated = true) {
    const req = new EventEmitter(); req.method = method; req.headers = authenticated ? { authorization: 'Bearer ' + token() } : {};
    const result = {};
    const res = { writeHead(status) { result.status = status; }, end(data) { result.payload = JSON.parse(data); } };
    const handling = module.namespace.handlePlatformRoute(req, res, new URL('https://example.invalid/api/platform/visitors'));
    if (method === 'POST') { req.emit('data', JSON.stringify({ email: 'visitor@example.invalid' })); req.emit('end'); }
    await handling; return result;
  } };
}
const results = [];
for (const premium of [false, true]) {
  const module = await load(source, premium);
  const get = await module.request('GET');
  assert.equal(get.status, 200); assert.ok(Array.isArray(get.payload.visitors));
  if (get.payload.limits) assert.equal(get.payload.limits.guestLimit, premium ? 5 : 1);
  const post = await module.request('POST');
  assert.equal(post.status, 402); assert.equal(post.payload.code, 'VISITOR_LIMIT_REACHED'); assert.equal(post.payload.limit, premium ? 5 : 1);
  assert.equal((await module.request('GET', false)).status, 401);
  results.push(`${premium ? 'premium' : 'free'} real-module authenticated GET, POST quota and unauthenticated control PASS`);
}
const mutant = source.slice(0, helperStart) + source.slice(helperEnd);
for (const method of ['GET', 'POST']) {
  const missing = await load(mutant);
  assert.equal((await missing.request(method)).status, 500, 'removing real helper must expose route failure');
  results.push(`missing-helper mutation is caught for ${method} (500, not hidden by a stub)`);
}
console.log(JSON.stringify({ status: 'PASS', results, realNetworkCalls: 0, productionDatabaseAccess: false }, null, 2));
