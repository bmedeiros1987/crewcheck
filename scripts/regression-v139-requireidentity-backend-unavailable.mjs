import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

// Root cause this fixes: server/v139/common.mjs's requireIdentity() - the identity/database
// gate behind every route in bidsCore.mjs, bidsCalendar.mjs, crewlock.mjs, routine.mjs,
// v1391/emergency.mjs, v1391/stayProfile.mjs, v14316/controlCenter.mjs, whatsapp.mjs, and the
// v1412 admin health modules - checked identity before checking database availability, the
// same ordering bug already fixed in server/platform.mjs's requireMain() (#474). During a
// database outage, any request without a currently-verifiable session got a bare 401 instead
// of a distinct backend-unavailable status. Fixed the same way: database availability is now
// checked first.
//
// Corrected audit note (an earlier version of this comment and the PR description claimed no
// consumer used the vulnerable authFetch()/jsonFetch()/expireSession() pipeline - that was
// wrong, caught in review): client/src/components/v14316/GuardianCenterView.tsx calls
// `authFetch('/api/guardian/card', { method: 'DELETE' })`, and DELETE /api/guardian/card is
// served by revokeGuardian() in server/v14316/controlCenter.mjs, gated by this same
// requireIdentity(). That module is wired into the live server through the build-time patch
// chain (scripts/v139/apply.mjs -> v14312 -> v14315 -> v14316/apply.mjs), not imported directly
// by the committed server.mjs - confirmed by tracing the chain, not by assumption. So this is a
// real, directly reachable path: a request to delete a Guardian card with no verifiable
// identity, during a database outage, got 401 (classified session_expired by
// classifyAuthErrorReason() since it's a protected request) and fired expireSession(), instead
// of the 503/backend_unavailable the outage actually warrants. The original audit's mistake was
// scoping the authFetch() search to a few known directories instead of the whole server/ tree.

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

// --- Same behavioral check against server/v14316/controlCenter.mjs - the module missed by the
// original audit. DELETE /api/guardian/card is the specific route confirmed reachable through
// client/src/components/v14316/GuardianCenterView.tsx's authFetch() call; GET /api/admin/overview
// is covered too since it shares the same requireIdentity() gate. ---
const { handleV14316ControlRoute } = await import('../server/v14316/controlCenter.mjs');

for (const [label, pathname, method, headers] of [
  ['DELETE /api/guardian/card, no credentials', '/api/guardian/card', 'DELETE', {}],
  ['DELETE /api/guardian/card, garbage token', '/api/guardian/card', 'DELETE', { authorization: 'Bearer garbage.garbage.garbage' }],
  ['GET /api/admin/overview, no credentials', '/api/admin/overview', 'GET', {}],
]) {
  const routeUrl = new URL(`http://localhost${pathname}?id=CCG-TEST`);
  const { req, res, status, body } = mockExchange(headers);
  req.method = method;
  const handled = await handleV14316ControlRoute(req, res, routeUrl);
  assert.equal(handled, true, `handleV14316ControlRoute must recognize ${pathname} (${label})`);
  assert.equal(status(), 503, `${label}, database unavailable: must return 503, got ${status()}`);
  assert.notEqual(status(), 401, `${label}, database unavailable: must never mask the outage as 401 (this is the route the original audit missed - authFetch() would have called expireSession() here)`);
  assert.doesNotMatch(body().message || '', /login|entrar/i, `${label}: message must not read like a session/login problem while the database is down`);
}

console.log('[v139-requireidentity-backend-unavailable] OK — requireIdentity() consumers, including the authFetch()-reachable /api/guardian/card, surface database outages as 503, never 401.');
