import assert from 'node:assert/strict';
import fs from 'node:fs';

// Root cause this fixes: server/platform.mjs's requireMain() — the identity/database gate
// behind almost every /api/platform/* and legacy /api/rosters* route — checked identity
// before checking database availability. When the database was unavailable, that ordering
// meant any request without a currently-verifiable session (missing token, or a session
// the caller can't prove alongside a real outage) got a bare 401 AUTH_REQUIRED instead of
// a distinct backend-unavailable signal. The shared client's jsonFetch() (see
// client/src/lib/authClient.ts's classifyAuthErrorReason) treats a 401 on a protected
// request as reason 'session_expired' and calls expireSession(), clearing the stored auth
// token — so a transient database outage could log a user out even though nothing ever
// confirmed their session was invalid. Same class of bug as the one just fixed in
// server/v139/auth.mjs's me(); fixed here by checking database availability first so a
// distinct 503 DATABASE_OFFLINE is always returned during an outage, never a 401.

const server = fs.readFileSync('server/platform.mjs', 'utf8');

const fnMatch = server.match(/async function requireMain\(req, res, body = \{\}\) \{[\s\S]*?\n\}/);
assert.ok(fnMatch, 'requireMain() not found in server/platform.mjs');
const fnSource = fnMatch[0];

// --- Structural check: the database check must run before the identity check. ---
const dbCheckAt = fnSource.indexOf("sendJson(res, 503, { ok: false, code: 'DATABASE_OFFLINE'");
const identityCheckAt = fnSource.indexOf("sendJson(res, 401, { ok: false, code: 'AUTH_REQUIRED'");
assert.ok(dbCheckAt >= 0, 'requireMain() must still return a classifiable 503 DATABASE_OFFLINE when the pool is unavailable');
assert.ok(identityCheckAt >= 0, 'requireMain() must still return 401 AUTH_REQUIRED for a missing/invalid session');
assert.ok(dbCheckAt < identityCheckAt, 'the database availability check must run before the identity check, so an outage can never be masked as AUTH_REQUIRED');

// --- Guard against regressing to the old, buggy order. ---
assert.doesNotMatch(
  fnSource,
  /const identity = mainIdentity\(req, body\);\s*\n\s*if \(!identity\.email\)[\s\S]*?const db = await pool\(\);/,
  'must not regress to checking identity before database availability',
);

// --- Behavioral check: actually exercise the exported route handler with no database
// configured, exactly like the live repro ("local build, no DB configured") — the whole
// point is that this must hold even for a request that carries no credentials at all,
// since that's the case the old ordering got wrong. ---
delete process.env.DATABASE_URL;
delete process.env.CREWCHECK_DATABASE_URL;
delete process.env.MYSQL_URL;

const { handlePlatformRoute } = await import('../server/platform.mjs');

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

for (const pathname of ['/api/rosters/active', '/api/platform/rosters/active']) {
  for (const headers of [{}, { authorization: 'Bearer garbage.garbage.garbage' }]) {
    const url = new URL(`http://localhost${pathname}`);
    const { req, res, status, body } = mockExchange(headers);
    const handled = await handlePlatformRoute(req, res, url);
    assert.equal(handled, true, `handlePlatformRoute must recognize ${pathname}`);
    assert.equal(status(), 503, `${pathname} with headers=${JSON.stringify(headers)} must return 503 when the database is unavailable, not ${status()}`);
    assert.equal(body().code, 'DATABASE_OFFLINE', `${pathname} must report a classifiable DATABASE_OFFLINE code`);
    assert.notEqual(status(), 401, `${pathname} must never mask a database outage as 401 AUTH_REQUIRED`);
  }
}

// --- The client's own classification must treat this response as backend_unavailable,
// never session_expired, so expireSession() is never triggered by a database outage. ---
const authClient = fs.readFileSync('client/src/lib/authClient.ts', 'utf8');
assert.match(
  authClient,
  /if \(code === 'DATABASE_REQUIRED' \|\| code === 'DATABASE_MIGRATION_REQUIRED' \|\| code === 'BACKEND_UNAVAILABLE' \|\| status === 0 \|\| status >= 500\) \{\s*\n\s*return 'backend_unavailable';/,
  'classifyAuthErrorReason must treat any >=500 status as backend_unavailable regardless of code, covering DATABASE_OFFLINE',
);

console.log('[platform-requiremain-backend-unavailable] OK — database outages on /api/rosters/active and /api/platform/rosters/active surface as 503, never 401.');
