import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

// Root cause this fixes: server/v139/common.mjs's requireIdentity() - the identity/database
// gate behind every route in bidsCore.mjs, bidsCalendar.mjs, crewlock.mjs, routine.mjs,
// v1391/emergency.mjs, v1391/stayProfile.mjs, and the v1412 admin health modules - checked
// identity before checking database availability, the same ordering bug already fixed in
// server/platform.mjs's requireMain() (#474). During a database outage, any request without
// a currently-verifiable session got a bare 401 instead of a distinct backend-unavailable
// status. Fixed the same way: database availability is now checked first.
//
// Audit note (see PR description for the full writeup): none of requireIdentity()'s current
// HTTP consumers are reached through client/src/lib/authClient.ts's jsonFetch()/expireSession()
// pipeline - they all go through client/src/components/v139/api.ts's v139Api(), which never
// clears session state on any status code. So today this fix closes a real status-code
// correctness bug without there being a live "improper logout" consumer - it's preventative,
// matching the desired invariant unconditionally (backend unavailable must never look like
// AUTH_REQUIRED), not a fix for an active logout regression.

const common = fs.readFileSync('server/v139/common.mjs', 'utf8');

const fnMatch = common.match(/export async function requireIdentity\(req, res\) \{[\s\S]*?\n\}/);
assert.ok(fnMatch, 'requireIdentity() not found in server/v139/common.mjs');
const fnSource = fnMatch[0];

// --- Structural check: the database check must run before the identity check. ---
const dbCheckAt = fnSource.indexOf("sendJson(res, 503, { ok: false, message: 'Banco Aiven indisponível.' });");
const identityCheckAt = fnSource.indexOf("sendJson(res, 401, { ok: false, message: 'Faça login para continuar.' });");
assert.ok(dbCheckAt >= 0, 'requireIdentity() must still return a classifiable 503 when the pool is unavailable');
assert.ok(identityCheckAt >= 0, 'requireIdentity() must still return 401 for a missing/invalid session');
assert.ok(dbCheckAt < identityCheckAt, 'the database availability check must run before the identity check, so an outage can never be masked as a 401');

// --- Guard against regressing to the old, buggy order. ---
assert.doesNotMatch(
  fnSource,
  /const email = safeEmail\(payload\?\.email\);\s*\n\s*if \(!email\)[\s\S]*?const db = await dbPool\(\);/,
  'must not regress to checking identity before database availability',
);

// --- Behavioral check: actually exercise a real route handler with no database configured,
// once with no credentials and once with a validly-signed token (v139's authSecret() has no
// dev fallback, so CREWCHECK_AUTH_SECRET must be set for the signed-token case to exercise
// verifyJwt() rather than short-circuiting on a missing secret). ---
delete process.env.DATABASE_URL;
delete process.env.CREWCHECK_DATABASE_URL;
delete process.env.MYSQL_URL;
process.env.CREWCHECK_AUTH_SECRET = 'regression-test-secret-requireidentity';

const { handleRoutineRoute } = await import('../server/v139/routine.mjs');

function mockExchange(headers = {}) {
  const req = { method: 'GET', headers, on() {} };
  const chunks = [];
  let statusCode = null;
  const res = {
    writeHead(status) { statusCode = status; },
    end(chunk) { if (chunk) chunks.push(chunk); },
  };
  return {
    req,
    res,
    status: () => statusCode,
    body: () => JSON.parse(chunks.join('') || '{}'),
  };
}

function signedToken(email) {
  const b64Json = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const head = b64Json({ alg: 'HS256', typ: 'JWT' });
  const body = b64Json({ iss: 'crewcheck', aud: 'crewcheck-web', sub: 'CC-REG-TEST', email, name: 'Regression Test', role: 'free', plan: 'free', admin: false, mustChangePassword: false, iat: now, exp: now + 3600 });
  const signature = crypto.createHmac('sha256', process.env.CREWCHECK_AUTH_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${signature}`;
}

const url = new URL('http://localhost/api/platform/routine/preferences');

for (const [label, headers] of [
  ['no credentials', {}],
  ['validly-signed token', { authorization: `Bearer ${signedToken('regression@example.com')}` }],
  ['garbage token', { authorization: 'Bearer garbage.garbage.garbage' }],
]) {
  const { req, res, status, body } = mockExchange(headers);
  const handled = await handleRoutineRoute(req, res, url);
  assert.equal(handled, true, `handleRoutineRoute must recognize /api/platform/routine/preferences (${label})`);
  assert.equal(status(), 503, `${label}, database unavailable: must return 503, got ${status()}`);
  assert.notEqual(status(), 401, `${label}, database unavailable: must never mask the outage as 401`);
  assert.doesNotMatch(body().message || '', /login|entrar/i, `${label}: message must not read like a session/login problem while the database is down`);
}

console.log('[v139-requireidentity-backend-unavailable] OK — requireIdentity() consumers surface database outages as 503, never 401.');
