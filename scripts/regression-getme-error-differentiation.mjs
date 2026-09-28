import assert from 'node:assert/strict';
import fs from 'node:fs';

// Root cause this fixes: client/src/App.tsx's Protected component used to treat every
// getMe() failure identically - `.catch(() => setLocation('/login'))` - so a rate limit,
// an account-state signal, a network hiccup, a timeout, or a 5xx all looked exactly like
// "your session is invalid" to the user, even though the token/local data were never
// actually confirmed invalid. Fixed by classifying the failure and only ever navigating
// away (or clearing the session) for a real session_expired signal.

const authSrc = fs.readFileSync('client/src/lib/authClient.ts', 'utf8');
const appSrc = fs.readFileSync('client/src/App.tsx', 'utf8');
const serverSrc = fs.readFileSync('server/v139/auth.mjs', 'utf8');

// --- Behavioral truth table: extract and actually execute the real
// classifyAuthErrorReason() body from the current source, so this test cannot silently
// drift from what the shipped code does. ---
const fnMatch = authSrc.match(/function classifyAuthErrorReason\(status: number, code: string, protectedRequest: boolean\): AuthErrorReason \{[\s\S]*?\n\}/);
assert.ok(fnMatch, 'classifyAuthErrorReason() not found in authClient.ts');
const fnSource = fnMatch[0].replace(
  'function classifyAuthErrorReason(status: number, code: string, protectedRequest: boolean): AuthErrorReason',
  'function classifyAuthErrorReason(status, code, protectedRequest)',
);
const classifyAuthErrorReason = new Function(`${fnSource}\nreturn classifyAuthErrorReason;`)();

const cases = [
  // [status, code, protectedRequest, expectedReason, note]
  [401, '', true, 'session_expired', 'protected call, token rejected'],
  [401, 'AUTH_REQUIRED', false, 'session_expired', 'explicit AUTH_REQUIRED code wins even on a public endpoint'],
  [401, '', false, 'invalid_credentials', 'wrong password on /login must never look like a logout'],
  [403, '', true, 'account_state', 'must be recoverable, not a generic logout'],
  [429, '', true, 'rate_limited', 'too many requests, session/account are fine'],
  [500, '', true, 'backend_unavailable', 'server error'],
  [502, '', true, 'backend_unavailable', 'gateway error'],
  [0, '', true, 'backend_unavailable', 'sentinel for network failure / aborted (timed out) fetch'],
  [200, 'DATABASE_REQUIRED', true, 'backend_unavailable', 'explicit backend-down code overrides status'],
  [404, '', true, 'other', 'unrelated status falls through safely'],
];
for (const [status, code, protectedRequest, expected, note] of cases) {
  const actual = classifyAuthErrorReason(status, code, protectedRequest);
  assert.equal(actual, expected, `${note}: status=${status} code=${code} protected=${protectedRequest} expected ${expected}, got ${actual}`);
}

// --- Only a real session_expired may ever clear the stored session. ---
assert.match(authSrc, /if \(reason === 'session_expired'\) expireSession\(\);/, 'expireSession() must be gated on reason===\'session_expired\', not on status alone');
assert.doesNotMatch(authSrc, /if \(response\.status === 401[^)]*\) expireSession\(\);/, 'must not regress to the old status-only check that ran before classification existed');

// --- fetch() itself (network failure, DNS, connection refused, or an aborted/timed-out
// request) must be classified as backend_unavailable, never surfaced as a raw
// unclassified exception the caller could mistake for anything else. ---
assert.match(authSrc, /let response: Response;\s*\n\s*try \{/, 'fetch() must be wrapped so network-level failures are classified, not left as a raw rejection');
assert.match(authSrc, /throw new AuthClientError\(publicApiErrorMessage\(null, 0, 'backend_unavailable'\), 0, 'BACKEND_UNAVAILABLE', null, 'backend_unavailable'\);/, 'network failure must produce an AuthClientError classified as backend_unavailable');

// --- getMe() must not be able to hang indefinitely. ---
assert.match(authSrc, /const GET_ME_TIMEOUT_MS = 10_000;/, 'getMe() must bound how long it waits before failing into backend_unavailable');
assert.match(authSrc, /new AbortController\(\)/, 'getMe() must use an AbortController to enforce its timeout');
assert.match(authSrc, /jsonFetch<\{ ok: boolean; user: AuthUser \}>\('\/api\/auth\/me', \{ signal: controller\.signal \}\)/, 'getMe() must actually pass the abort signal into the request');

// --- App.tsx: only session_expired may navigate to /login; everything else preserves
// the existing session and local data exactly as they were. ---
const protectedEffect = appSrc.match(/getMe\(\)\.then\(\(\) => enablePartnerDemoRoster\(\)\)\.catch\(\(error\) => \{[\s\S]*?\n {4}\}\)\.finally/);
assert.ok(protectedEffect, 'Protected component getMe() handling not found in the expected shape');
const effectBody = protectedEffect[0];
assert.match(effectBody, /error instanceof AuthClientError/, 'must classify the real error type, not assume every rejection means logout');
assert.match(effectBody, /reason === 'session_expired'/, 'navigation must be gated on the classified reason');
assert.match(effectBody, /if \(reason === 'session_expired'\) setLocation\('\/login'\);/, 'setLocation must only ever fire for session_expired');
assert.doesNotMatch(effectBody, /clearSession\(|expireSession\(/, 'Protected must not itself clear session state - only jsonFetch does that, and only for session_expired');
assert.doesNotMatch(effectBody, /crewcheck_demo_mode_seen|crewcheck_demo_active|setLocation\('\/demo/, 'no auth error may ever fall back into demo mode');
assert.match(appSrc, /import \{ AuthClientError, getMe, getStoredUser, isAuthenticated \} from "\.\/lib\/authClient";/, 'AuthClientError must be imported to classify getMe() failures');

// --- Server: a transient query failure in /api/auth/me must fail fast with a clean,
// classifiable response instead of hanging (no response ever sent, only logged to the
// process-level uncaughtException handler). ---
const meFn = serverSrc.match(/async function me\(req, res, db\) \{[\s\S]*?\n\}\n/);
assert.ok(meFn, 'me() handler not found in server/v139/auth.mjs');
assert.match(meFn[0], /try \{[\s\S]*?db\.query\('SELECT must_change_password[\s\S]*?\} catch \(error\) \{/, 'the account/session query must be wrapped in try/catch');
assert.match(meFn[0], /sendJson\(res, 503, \{ ok: false, authenticated: false, code: 'BACKEND_UNAVAILABLE'/, 'a query failure must return a classifiable 503, not hang or leak a stack trace');

console.log('getMe() auth-error differentiation regression: ok');
