import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import { operationalRosterContentDigest, readOperationalBriefingPreview } from '../../server/concierge/operational-briefing-source.mjs';

// Only synthetic local identities, tokens, accounts and roster data are used.
// Compile the exact canonical bridge before running this suite:
// node scripts/p1-concierge-journey/compile.mjs
// node --test scripts/tests/operational-briefing-source.test.mjs
// No test reads environment credentials, opens a real DB, or calls a provider.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const COMMON = readFileSync(new URL('../../server/v139/common.mjs', import.meta.url), 'utf8');
const PLATFORM = readFileSync(new URL('../../server/platform.mjs', import.meta.url), 'utf8');
const SOURCE = readFileSync(new URL('../../server/concierge/operational-briefing-source.mjs', import.meta.url), 'utf8');
const NOW = Date.parse('2099-10-06T07:00:00Z');
const SECRET = 'synthetic-local-test-secret-never-a-real-credential';
const EMAIL = 'synthetic-account-a@example.invalid';
const OTHER_EMAIL = 'synthetic-account-b@example.invalid';
const PUBLIC_ID = 'CC-SYNTHETIC-ACCOUNT-A';
const PATH = '/api/platform/operational-briefing/preview';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const functionSource = (source, name) => {
  const match = source.match(new RegExp(`^(?:export )?((?:async )?function ${name}\\([^]*?^})`, 'm'));
  assert.ok(match, `Missing production function ${name}`);
  return match[1];
};
const authSource = ['env', 'safeEmail', 'secureCompare', 'authSecret', 'b64Json', 'issueJwt',
  'verifyJwt', 'requestToken', 'readExistingMainIdentity'].map(name => functionSource(COMMON, name)).join('\n');
const policySource = PLATFORM.slice(PLATFORM.indexOf('const PLATFORM_METHOD_POLICIES = ['), PLATFORM.indexOf('\nfunction enforcePlatformMethod'));
assert.ok(policySource.startsWith('const PLATFORM_METHOD_POLICIES = ['));
const routeSource = [policySource, ...['sendJson', 'enforcePlatformMethod', 'handleOperationalBriefingPreview',
  'handlePlatformRoute'].map(name => functionSource(PLATFORM, name))].join('\n');

// Execute the production verifier, issuer and cookie extractor verbatim. The VM
// supplies a synthetic process.env and fixed clock, never the host environment.
function canonicalAuth({ clock = NOW, secret = SECRET } = {}) {
  const effects = [];
  const deny = name => () => { effects.push(name); throw new Error(`Forbidden side effect: ${name}`); };
  class FixedDate extends Date { static now() { return clock; } }
  const sandbox = { crypto, Buffer, Date: FixedDate,
    process: { env: { CREWCHECK_AUTH_SECRET: secret, JWT_SECRET: '', CREWCHECK_AUTH_REQUIRED: 'false' } },
    dbPool: deny('default-dbPool'), ensureProfile: deny('ensureProfile'), userFromAccount: deny('userFromAccount'),
    setAuthCookie: deny('setAuthCookie'), fetch: deny('fetch'), setTimeout: deny('setTimeout'), setInterval: deny('setInterval') };
  const context = vm.createContext(sandbox);
  const api = vm.runInContext(`${authSource}\n({ issueJwt, verifyJwt, requestToken, readExistingMainIdentity })`, context);
  const issue = api.issueJwt;
  context.issueJwt = deny('request-token-issuance');
  return { ...api, issueJwt: issue, effects };
}
const auth = canonicalAuth();
const user = overrides => ({ id: PUBLIC_ID, email: EMAIL, name: 'Synthetic Private Display Name',
  role: 'free', plan: 'free', admin: false, mustChangePassword: false, ...overrides });
const mainToken = overrides => auth.issueJwt(user(overrides));
function signedClaims(changes = {}, remove = []) {
  const claims = { ...auth.verifyJwt(mainToken()), ...changes };
  for (const key of remove) delete claims[key];
  const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${head}.${body}.${crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url')}`;
}
function request(token = mainToken(), extra = {}) {
  return { method: 'GET', headers: token ? { authorization: `Bearer ${token}` } : {}, ...extra };
}
function roster() {
  const day = (date, dayNumber, flightNumber) => ({ date, dayNumber, month: 10, year: 2099,
    dayOfWeek: '', type: 'VOO', pairingCode: flightNumber, dutyReport: '05:00', dutyDebrief: '08:35',
    dutyHours: null, flyingHours: null, isNextDay: false, hotel: null, base: 'AAA',
    rawText: 'SYNTHETIC_PRIVATE_DAILY_RAW', legs: [{ id: flightNumber, flightNumber,
      origin: 'AAA', destination: 'BBB', departureTime: '06:00', arrivalTime: '08:00', workType: 'OP' }] });
  return { month: 10, year: 2099, base: 'AAA', rank: 'CCM',
    rawText: 'SYNTHETIC_PRIVATE_MONTHLY_RAW', ownerEmail: EMAIL,
    metadata: { privateLabel: 'SYNTHETIC_PRIVATE_METADATA', ordered: ['first', 'second'] },
    days: [day('06/10/2099', 6, 'SYNTH-NEXT'), day('20/10/2099', 20, 'SYNTH-PRIVATE-LATER')] };
}
const profile = () => ({ email: EMAIL, public_id: PUBLIC_ID,
  display_name: 'SYNTHETIC_PRIVATE_PROFILE', plan: 'SYNTHETIC_PRIVATE_PLAN' });
function activeRow(overrides = {}) {
  const data = roster();
  return { account_email: EMAIL, account_public_id: PUBLIC_ID, id: 'synthetic-active-row-a', owner_email: EMAIL,
    roster_key: '2099-10', roster: JSON.stringify(data), fingerprint: hash(JSON.stringify(data)), active: 1,
    revision_seconds: (NOW - 120_000) / 1000, updated_at: 'SYNTHETIC_UNQUALIFIED_DATETIME_MUST_NOT_BE_PARSED', ...overrides };
}
function fakeDb(options = {}) {
  const statements = [], forbidden = [];
  const profiles = 'profiles' in options ? options.profiles : [profile()];
  const rows = 'rows' in options ? options.rows : [activeRow()];
  const deny = name => { forbidden.push(name); throw new Error(`Forbidden DB action: ${name}`); };
  const db = new Proxy({ async query(sql, params) {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    statements.push({ sql: normalized, params: [...params] });
    if (!/^SELECT\b/i.test(normalized) || /;|\b(?:INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|TRUNCATE|CALL|SET|INTO|OUTFILE|FOR UPDATE)\b/i.test(normalized)) return deny(normalized);
    if (normalized === 'SELECT email,public_id FROM crewcheck_platform_profiles WHERE email=? LIMIT 2') {
      assert.deepEqual([...params], [EMAIL]);
      if (options.identityError) throw options.identityError;
      return [profiles];
    }
    assert.match(normalized, /^SELECT p\.email AS account_email,p\.public_id AS account_public_id,/);
    assert.match(normalized, /UNIX_TIMESTAMP\(r\.updated_at\) AS revision_seconds/);
    assert.match(normalized, /FROM crewcheck_platform_profiles p LEFT JOIN crewcheck_platform_rosters r ON r\.owner_email=p\.email AND r\.active=TRUE WHERE p\.email=\? AND p\.public_id=\? ORDER BY r\.updated_at DESC,r\.id DESC LIMIT 2$/);
    assert.deepEqual([...params], [EMAIL, PUBLIC_ID]);
    if (options.sourceError) throw options.sourceError;
    return [rows];
  } }, { get(target, key) {
    if (key in target) return target[key];
    if (key === 'then') return undefined;
    return () => deny(String(key));
  } });
  return { db, statements, forbidden };
}
const context = db => ({ ok: true, db, email: EMAIL, publicId: PUBLIC_ID });
async function readSource(options = {}, clock = NOW) {
  const fake = fakeDb(options);
  const result = await readOperationalBriefingPreview(context(fake.db), { now: () => clock });
  assert.deepEqual(fake.forbidden, []);
  return { ...result, fake };
}
async function readIdentity(req = request(), options = {}, api = auth) {
  const fake = fakeDb(options);
  let connections = 0;
  const getDb = async () => {
    connections += 1;
    if (options.dbError) throw options.dbError;
    return options.offline ? null : fake.db;
  };
  const result = await api.readExistingMainIdentity(req, { getDb, now: () => options.clock ?? NOW });
  assert.deepEqual(api.effects, []);
  assert.deepEqual(fake.forbidden, []);
  return { result, fake, connections };
}
async function invokeRoute(req = request(), options = {}, url = new URL(PATH, 'https://synthetic.invalid')) {
  const fake = fakeDb(options), effects = [], calls = { auth: 0, source: 0 };
  const deny = name => () => { effects.push(name); throw new Error(`Forbidden route action: ${name}`); };
  const run = vm.runInNewContext(`${routeSource}\nhandlePlatformRoute`, {
    readExistingMainIdentity: async received => {
      calls.auth += 1;
      return auth.readExistingMainIdentity(received, { getDb: async () => {
        if (options.dbError) throw options.dbError;
        return options.offline ? null : fake.db;
      }, now: () => options.clock ?? NOW });
    },
    readOperationalBriefingPreview: async identity => {
      calls.source += 1;
      return readOperationalBriefingPreview(identity, { now: () => options.clock ?? NOW });
    },
    requireMain: deny('requireMain'), requireIdentity: deny('requireIdentity'), readBody: deny('readBody'),
    pool: deny('pool'), dbPool: deny('dbPool'), ensureProfile: deny('ensureProfile'),
    issueJwt: deny('issueJwt'), setAuthCookie: deny('setAuthCookie'), fetch: deny('fetch'),
    setInterval: deny('setInterval'), setTimeout: deny('setTimeout'),
  });
  const response = { status: null, headers: {}, body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, headers) { this.status = status; for (const [name, value] of Object.entries(headers)) this.setHeader(name, value); },
    end(body) { assert.equal(this.body, null, 'single response'); this.body = JSON.parse(body); } };
  const handled = await run(req, response, url);
  assert.deepEqual(effects, []);
  assert.deepEqual(fake.forbidden, []);
  assert.deepEqual(auth.effects, []);
  return { ...response, handled, fake, calls };
}
function failure(result, status, code) {
  assert.equal(result.status, status);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.code, code);
  assert.notEqual(result.body.submissionAllowed, true);
  assert.equal(result.body.briefing, undefined);
  assert.equal(result.body.source, undefined);
}

test('compiled canonical bridge matches the prepared production TypeScript sources', () => {
  const hashes = JSON.parse(readFileSync(new URL('../../server/concierge/generated/source-hashes.json', import.meta.url), 'utf8'));
  assert.ok(Object.keys(hashes).length >= 2);
  for (const [name, expected] of Object.entries(hashes)) {
    assert.equal(hash(readFileSync(new URL(`../../client/src/lib/${name}`, import.meta.url))), expected, name);
  }
});

test('existing requireIdentity and requireMain remain byte-identical to draft909 baseline 5883cdbc', () => {
  const declaration = (source, name) => source.match(new RegExp(`^(?:export )?(?:async )?function ${name}\\([^]*?^}`, 'm'))?.[0];
  assert.equal(hash(declaration(COMMON, 'requireIdentity')), '8470d011ee2cecdc04bff1b1e920e37f45487d22b8801c9eed25d0405ddce019');
  assert.equal(hash(declaration(PLATFORM, 'requireMain')), '26654396670a1b60163180bdefd6aae0b37924a221770322ce66d3e9b6aeb230');
});

test('actual active-roster preparation preserves the briefing handler, policy and route and is idempotent', () => {
  const directory = mkdtempSync(join(tmpdir(), 'crewcheck-briefing-preparation-'));
  const script = fileURLToPath(new URL('../p0-active-roster-server/apply.mjs', import.meta.url));
  const filename = join(directory, 'server/platform.mjs');
  try {
    mkdirSync(join(directory, 'server'));
    const activeHandler = functionSource(PLATFORM, 'handleRosterActive');
    // In prepared CI, make only the disposable fixture need the real handler
    // replacement again. Raw production input already needs that replacement.
    const legacyHandler = activeHandler.replace('roster: rosterSummary(row)', 'roster: row');
    assert.equal(legacyHandler.includes('roster: rosterSummary(row)'), false);
    writeFileSync(filename, PLATFORM.replace(activeHandler, legacyHandler), 'utf8');
    const prepare = () => {
      const result = spawnSync(process.execPath, [script], {
        cwd: directory, encoding: 'utf8', timeout: 10_000, env: { PATH: '/usr/bin:/bin', TZ: 'UTC' },
      });
      assert.equal(result.status, 0, result.stderr || result.error?.message);
      return readFileSync(filename, 'utf8');
    };
    const first = prepare();
    assert.match(functionSource(first, 'handleRosterActive'), /roster: rosterSummary\(row\)/, 'actual replacement path ran');
    assert.equal(functionSource(first, 'handleOperationalBriefingPreview'), functionSource(PLATFORM, 'handleOperationalBriefingPreview'));
    assert.equal(first.slice(first.indexOf('const PLATFORM_METHOD_POLICIES = ['), first.indexOf('\nfunction enforcePlatformMethod')), policySource);
    assert.equal(functionSource(first, 'enforcePlatformMethod'), functionSource(PLATFORM, 'enforcePlatformMethod'));
    assert.equal(functionSource(first, 'handlePlatformRoute'), functionSource(PLATFORM, 'handlePlatformRoute'));
    assert.equal((first.match(/^async function handleOperationalBriefingPreview\(/gm) || []).length, 1);
    assert.ok(first.includes("import { readExistingMainIdentity } from './v139/common.mjs';"));
    assert.ok(first.includes("import { readOperationalBriefingPreview } from './concierge/operational-briefing-source.mjs';"));
    assert.equal(prepare(), first, 'second actual preparation run is byte-identical');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('canonical main-account issuer, verifier and extractor accept bearer and main cookie only', async () => {
  const token = mainToken();
  assert.equal(auth.verifyJwt(token).sub, PUBLIC_ID);
  for (const headers of [{ authorization: `Bearer ${token}` }, { authorization: `bEaReR  ${token}  ` },
    { cookie: `unrelated=synthetic; crewcheck_auth_token=${encodeURIComponent(token)}; other=synthetic` }]) {
    const req = request(null, { headers });
    assert.equal(auth.requestToken(req), token);
    const { result, fake } = await readIdentity(req);
    assert.equal(result.ok, true);
    assert.equal(result.db, fake.db);
    assert.equal(result.email, EMAIL);
    assert.equal(result.publicId, PUBLIC_ID);
    assert.deepEqual(Object.keys(result).sort(), ['db', 'email', 'ok', 'publicId']);
    assert.equal(fake.statements.length, 1);
  }
});

test('visitor tokens, wrong audience or issuer, and visitor-like main claims are rejected before profile lookup', async () => {
  for (const changes of [{ aud: 'crewcheck-visitor', role: 'visitor', visitorId: 'synthetic-visitor', ownerEmail: EMAIL },
    { aud: 'other-service' }, { aud: ['crewcheck-web'] }, { iss: 'other-issuer' }, { role: 'visitor' },
    { visitorId: 'synthetic-visitor' }, { visitorId: null }, { ownerEmail: OTHER_EMAIL }, { ownerEmail: null }]) {
    const { result, fake } = await readIdentity(request(signedClaims(changes)));
    assert.equal(result.status, 401, JSON.stringify(changes));
    assert.equal(result.code, 'AUTH_REQUIRED');
    assert.equal(fake.statements.length, 0);
  }
  const visitorCookie = await readIdentity(request(null, { headers: { cookie: `crewcheck_visitor_token=${mainToken()}` } }));
  assert.equal(visitorCookie.result.status, 401);
});

test('absent, malformed, unsigned, tampered, expired and structurally invalid tokens never authorize', async () => {
  const token = mainToken(), [head, body] = token.split('.');
  const inputs = ['', 'malformed', `${head}.${body}.invalid`, `${head}.${body}.`,
    signedClaims({ exp: Math.floor(NOW / 1000) - 1 }), signedClaims({ exp: Math.floor(NOW / 1000) }),
    signedClaims({ iat: Math.floor(NOW / 1000) + 1 }), signedClaims({ exp: '99999999999' }),
    signedClaims({ iat: '1' }), signedClaims({ iat: 1.5 }), signedClaims({ exp: 1.5 }),
    signedClaims({ sub: 1 }), signedClaims({ sub: '' }), signedClaims({ email: 'not-an-email' }),
    ...['sub', 'email', 'exp', 'iat', 'iss', 'aud'].map(key => signedClaims({}, [key]))];
  for (const token of inputs) {
    const { result, fake } = await readIdentity(request(token));
    assert.equal(result.status, 401);
    assert.equal(fake.statements.length, 0);
  }
  for (const headers of [{ cookie: 'crewcheck_auth_token=%E0%A4%A' },
    { authorization: 'Bearer broken', cookie: `crewcheck_auth_token=${mainToken()}` }]) {
    assert.equal((await readIdentity(request(null, { headers }))).result.status, 401);
  }
});

test('email headers, body, query and disabled legacy auth flag cannot replace a verified main token', async () => {
  const req = request(null, { headers: { 'x-crewcheck-email': EMAIL, 'x-user-email': EMAIL },
    body: { email: EMAIL, token: mainToken() }, query: { email: EMAIL, token: mainToken() } });
  const result = await invokeRoute(req, {}, new URL(`${PATH}?email=${encodeURIComponent(EMAIL)}&token=${mainToken()}`, 'https://synthetic.invalid'));
  failure(result, 401, 'AUTH_REQUIRED');
  assert.equal(result.fake.statements.length, 0);
  assert.equal(result.calls.source, 0);
});

test('existing account incarnation must match the signed subject without creating a missing profile', async () => {
  for (const profiles of [[], [{ email: EMAIL, public_id: 'CC-SYNTHETIC-RECREATED' }],
    [{ email: OTHER_EMAIL, public_id: PUBLIC_ID }], [{ email: EMAIL }], [{ email: EMAIL, public_id: 1 }]]) {
    const { result, fake } = await readIdentity(request(), { profiles });
    assert.equal(result.status, 401);
    assert.equal(fake.statements.length, 1);
  }
  const { result } = await readIdentity(request(mainToken({ email: `  ${EMAIL.toUpperCase()}  ` })));
  assert.equal(result.ok, true);
  assert.equal(result.email, EMAIL);
});

test('password-change sessions fail with 403 before reading a profile or active roster', async () => {
  const result = await invokeRoute(request(mainToken({ mustChangePassword: true })));
  failure(result, 403, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal(result.fake.statements.length, 0);
  assert.equal(result.calls.source, 0);
});

test('database outage, schema/query errors and ambiguous account lookup have safe 503 results', async () => {
  const internal = 'SYNTHETIC_INTERNAL_DATABASE_DETAIL';
  for (const options of [{ offline: true }, { dbError: new Error(internal) },
    { identityError: Object.assign(new Error(internal), { code: 'ER_NO_SUCH_TABLE' }) },
    { identityError: Object.assign(new Error(internal), { code: 'ER_BAD_FIELD_ERROR' }) },
    { identityError: new Error(internal) }, { profiles: [profile(), profile()] }, { profiles: null }]) {
    const result = await invokeRoute(request(), options);
    assert.equal(result.status, 503);
    assert.equal(result.calls.source, 0);
    assert.doesNotMatch(JSON.stringify(result.body), new RegExp(internal));
    assert.equal(result.headers['cache-control'], 'no-store');
  }
  const noCredentials = await invokeRoute(request(null), { offline: true });
  failure(noCredentials, 503, 'DATABASE_OFFLINE');
  const noSecret = await readIdentity(request(), {}, canonicalAuth({ secret: '' }));
  assert.equal(noSecret.result.status, 503);
  assert.equal(noSecret.result.code, 'AUTH_UNAVAILABLE');
  assert.equal(noSecret.connections, 0);
});

test('real GET route returns a bounded next-duty preview using two parameterized SELECTs', async () => {
  for (const req of [request(), request(null, { headers: { cookie: `crewcheck_auth_token=${mainToken()}` } })]) {
    const result = await invokeRoute(req);
    assert.equal(result.handled, true);
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.submissionAllowed, false);
    assert.deepEqual(result.calls, { auth: 1, source: 1 });
    assert.equal(result.fake.statements.length, 2);
    assert.equal(result.body.source.kind, 'primary-active-roster');
    assert.equal(result.body.source.rosterId, 'synthetic-active-row-a');
    assert.equal(result.body.source.rosterKey, '2099-10');
    assert.equal(result.body.source.revisionAt, '2099-10-06T06:58:00.000Z');
    assert.equal(result.body.source.checkedAt, '2099-10-06T07:00:00.000Z');
    assert.deepEqual(result.body.briefing.duty.legs.map(item => item.flight), ['SYNTH-NEXT']);
    assert.equal(result.body.briefing.window.state, 'due');
    assert.equal(result.body.briefing.duty.presentationAt, '2099-10-06T08:00:00.000Z');
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.equal(result.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(result.headers['x-content-type-options'], 'nosniff');
    assert.equal(result.headers['set-cookie'], undefined);
  }
});

test('route ignores client authority, roster, clock, prior publication, consent and identity overrides', async () => {
  const baseline = await invokeRoute();
  const injection = { email: OTHER_EMAIL, publicId: 'CC-SYNTHETIC-B', now: NOW + 365 * 86400_000,
    authority: { ownerScope: 'foreign', active: true, rosterKey: '2099-11', rosterId: 'foreign' },
    roster: { days: [] }, previousPublication: { corrupt: true }, weather: [{ raw: 'forged' }],
    consent: { enabled: true }, submissionAllowed: true };
  const req = request(mainToken(), { headers: { authorization: `Bearer ${mainToken()}`,
    'x-crewcheck-email': OTHER_EMAIL, 'x-crewcheck-public-id': 'CC-SYNTHETIC-B' }, body: injection, query: injection });
  req.on = () => assert.fail('GET must never consume or parse request body');
  const url = new URL(PATH, 'https://synthetic.invalid');
  for (const [name, value] of Object.entries(injection)) url.searchParams.set(name, typeof value === 'object' ? JSON.stringify(value) : String(value));
  const result = await invokeRoute(req, {}, url);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, baseline.body);
  assert.deepEqual(result.fake.statements, baseline.fake.statements);
});

test('every non-GET method is 405 with Allow GET and no-store before authentication or DB access', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE']) {
    const result = await invokeRoute(request(null, { method }));
    failure(result, 405, 'METHOD_NOT_ALLOWED');
    assert.equal(result.handled, true);
    assert.equal(result.headers.allow, 'GET');
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.deepEqual(result.calls, { auth: 0, source: 0 });
    assert.equal(result.fake.statements.length, 0);
  }
  assert.equal((await invokeRoute(request(), {}, new URL('/not-platform', 'https://synthetic.invalid'))).handled, false);
});

test('source requires the existing-main-account context before any query', async () => {
  for (const invalid of [null, {}, { ok: false }, { ok: true, email: EMAIL, publicId: PUBLIC_ID },
    { ok: true, email: '', publicId: PUBLIC_ID, db: { query() { assert.fail(); } } },
    { ok: true, email: EMAIL, publicId: '', db: { query() { assert.fail(); } } }]) {
    failure(await readOperationalBriefingPreview(invalid, { now: () => NOW }), 401, 'AUTH_REQUIRED');
  }
});

test('direct primary active-row join fails closed for vanished, missing or ambiguous active rows', async () => {
  failure(await readSource({ rows: [] }), 401, 'AUTH_REQUIRED');
  failure(await readSource({ rows: [activeRow({ id: null })] }), 404, 'ACTIVE_ROSTER_MISSING');
  failure(await readSource({ rows: [activeRow(), activeRow({ id: 'synthetic-second-active' })] }), 409, 'ACTIVE_ROSTER_AMBIGUOUS');
  failure(await readSource({ rows: [activeRow(), activeRow()] }), 409, 'ACTIVE_ROSTER_AMBIGUOUS');
  for (const overrides of [{ account_email: OTHER_EMAIL }, { account_public_id: 'CC-SYNTHETIC-RECREATED' }]) {
    failure(await readSource({ rows: [activeRow(overrides)] }), 401, 'AUTH_REQUIRED');
  }
  for (const overrides of [{ owner_email: OTHER_EMAIL }, { active: false }, { active: 'true' }, { active: 2 },
    { id: 1 }, { id: '' }, { id: 'x'.repeat(161) }, { fingerprint: '' }, { fingerprint: 'unverified' },
    { fingerprint: 'A'.repeat(64) }, { roster_key: '2099-13' }, { roster_key: '2099-1' }]) {
    failure(await readSource({ rows: [activeRow(overrides)] }), 409, 'ACTIVE_ROSTER_UNVERIFIED');
  }
  for (const active of [true, 1, '1']) assert.equal((await readSource({ rows: [activeRow({ active })] })).status, 200);
});

test('joined read rejects a profile removed or recreated after the initial authenticated lookup', async () => {
  for (const rows of [[], [activeRow({ account_public_id: 'CC-SYNTHETIC-RECREATED' })],
    [activeRow({ account_email: OTHER_EMAIL })]]) {
    const result = await invokeRoute(request(), { rows });
    failure(result, 401, 'AUTH_REQUIRED');
    assert.deepEqual(result.calls, { auth: 1, source: 1 });
    assert.equal(result.fake.statements.length, 2);
    assert.equal(result.headers['cache-control'], 'no-store');
  }
});

test('source schema/query failures and malformed driver row sets return safe 503', async () => {
  for (const options of [{ sourceError: new Error('SYNTHETIC_INTERNAL_QUERY_FAILURE') },
    { sourceError: Object.assign(new Error('SYNTHETIC_INTERNAL_SCHEMA_FAILURE'), { code: 'ER_NO_SUCH_TABLE' }) },
    { sourceError: Object.assign(new Error('SYNTHETIC_INTERNAL_COLUMN_FAILURE'), { code: 'ER_BAD_FIELD_ERROR' }) },
    { rows: null }, { rows: {} }, { rows: [null] }, { rows: [[]] }, { rows: [1] }]) {
    const result = await readSource(options);
    failure(result, 503, 'DATABASE_OFFLINE');
    assert.doesNotMatch(JSON.stringify(result.body), /SYNTHETIC_INTERNAL/);
  }
});

test('revision must be a valid nonfuture SQL epoch and never an unqualified DATETIME fallback', async () => {
  for (const revision_seconds of [undefined, null, '', false, {}, -1, 0, NaN, Infinity, 'Infinity',
    '2099-10-06 06:58:00', '2099-10-06T06:58:00Z', `${NOW / 1000 + 1}`, '1e12', ' 1 ', Number.MAX_VALUE]) {
    failure(await readSource({ rows: [activeRow({ revision_seconds, updated_at: '2099-10-06 06:58:00' })] }), 409, 'ACTIVE_ROSTER_UNVERIFIED');
  }
  for (const revision_seconds of [(NOW - 120_000) / 1000, String((NOW - 120_000) / 1000), (NOW - 119_750) / 1000]) {
    const row = activeRow({ revision_seconds });
    Object.defineProperty(row, 'updated_at', { get() { assert.fail('SQL DATETIME must never be parsed in the host timezone'); } });
    const result = await readSource({ rows: [row] });
    assert.equal(result.status, 200);
    assert.equal(result.body.source.revisionAt, new Date(Number(revision_seconds) * 1000).toISOString());
  }
});

test('invalid clocks fail safely without publishing an invalid instant', async () => {
  for (const clock of [NaN, Infinity, -Infinity, null, '2099-10-06T07:00:00Z', 0, -1, Number.MAX_VALUE]) {
    const result = await readSource({}, clock);
    failure(result, 503, 'DATABASE_OFFLINE');
  }
  for (const clock of [NaN, Infinity]) {
    const { result, fake } = await readIdentity(request(), { clock });
    assert.equal(result.status, 401);
    assert.equal(fake.statements.length, 0);
  }
});

test('invalid JSON, unsupported JSON values and oversized monthly input cannot reach a preview', async () => {
  const invalid = ['{invalid', 'null', '[]', '42', '"scalar"', {}, { days: {} },
    { days: Array.from({ length: 371 }, () => ({})) }, JSON.stringify({ days: [], rawText: 'x'.repeat(4_500_000) }),
    { days: [], rawText: 'x'.repeat(4_500_000) },
    { ...roster(), impossible: undefined }, { ...roster(), impossible: NaN }, { ...roster(), impossible: new Date(NOW) }];
  const cycle = roster(); cycle.cycle = cycle; invalid.push(cycle);
  let deep = {}; for (let i = 0; i < 45; i++) deep = { nested: deep };
  invalid.push({ ...roster(), deep });
  for (const data of invalid) failure(await readSource({ rows: [activeRow({ roster: data })] }), 422, 'ACTIVE_ROSTER_INVALID');
});

test('published period and invalid civil dates or flight clocks are rejected by the real canonical planner', async () => {
  for (const mutate of [data => { data.month = 11; }, data => { data.year = 2100; },
    data => { data.days[0].date = '31/02/2099'; }, data => { data.days.forEach(day => { day.date = day.date.replace('/10/', '/11/'); }); },
    data => { data.days[0].date = ''; }, data => { data.days[0].legs = null; },
    data => { data.days[0].legs[0].departureTime = '24:00'; }, data => { data.days[0].legs[0].arrivalTime = '08:60'; }]) {
    const data = roster(); mutate(data);
    const result = await readSource({ rows: [activeRow({ roster: JSON.stringify(data) })] });
    assert.equal(result.status, 422, mutate.toString());
    assert.ok(['ACTIVE_ROSTER_INVALID', 'BRIEFING_UNAVAILABLE'].includes(result.body.code));
    assert.equal(result.body.submissionAllowed, false);
    assert.equal(result.body.briefing, undefined);
  }
});

test('malformed optional presentation and debrief fields never become confirmed published clocks', async () => {
  for (const field of ['dutyReport', 'dutyDebrief', 'presentationTime']) {
    for (const value of ['unknown 05:00 tentative', 'invalid 05:00', '25:00', '05:61', '05:00(+1)', 500, true, {}]) {
      const data = roster();
      const target = field === 'presentationTime' ? data.days[0].legs[0] : data.days[0];
      target[field] = value;
      failure(await readSource({ rows: [activeRow({ roster: data })] }), 422, 'ACTIVE_ROSTER_INVALID');
    }
  }
  for (const dutyReport of [null, '', '06:00']) {
    const data = roster(); data.days[0].dutyReport = dutyReport;
    const result = await readSource({ rows: [activeRow({ roster: data })] });
    assert.equal(result.status, 200);
    assert.equal(result.body.briefing.window.state, 'presentation-unconfirmed');
    assert.equal(result.body.briefing.duty.presentationAt, null);
    assert.match(result.body.message, /apresentação não está confirmada/i);
  }
});

test('unsupported explicit flight-day offsets and nonboolean next-day flags are rejected', async () => {
  for (const overrides of [{ departureTime: '06:00(+1)' }, { arrivalTime: '08:00(+1)' },
    { departureTime: '06:00(+1)', arrivalTime: '08:00(+1)' }, { arrivalTime: '08:00(+99)' },
    { isNextDay: 'false' }, { isNextDay: 'true' }, { isNextDay: 1 }, { isNextDay: {} }]) {
    const data = roster(); Object.assign(data.days[0].legs[0], overrides);
    failure(await readSource({ rows: [activeRow({ roster: data })] }), 422, 'ACTIVE_ROSTER_INVALID');
  }
  for (const isNextDay of [true, false]) {
    const data = roster(); data.days[0].legs[0].isNextDay = isNextDay;
    assert.equal((await readSource({ rows: [activeRow({ roster: data })] })).status, 200);
  }
});

test('no upcoming flight or unsupported earlier duty remains an explicit bounded preview', async () => {
  const finished = await readSource({}, Date.parse('2099-11-01T00:00:00Z'));
  assert.equal(finished.status, 200);
  assert.equal(finished.body.briefing.window.state, 'no-upcoming-duty');
  assert.equal(finished.body.briefing.duty, null);
  assert.deepEqual(finished.body.briefing.weather, []);
  assert.match(finished.body.message, /não há jornada de voo futura/i);
  const data = roster();
  data.days.unshift({ ...data.days[0], type: 'RES', pairingCode: 'RES', dutyReport: '03:00', dutyDebrief: '04:30', legs: [] });
  const unsupported = await readSource({ rows: [activeRow({ roster: data })] });
  assert.equal(unsupported.status, 200);
  assert.equal(unsupported.body.briefing.window.state, 'unsupported-duty');
  assert.equal(unsupported.body.briefing.duty, null);
  assert.equal(unsupported.body.submissionAllowed, false);
  assert.match(unsupported.body.message, /não é um voo/i);
});

test('full canonical digest ignores object key order, preserves arrays and binds every full-roster field', async () => {
  const data = roster();
  const reorder = value => Array.isArray(value) ? value.map(reorder)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).reverse().map(key => [key, reorder(value[key])])) : value;
  assert.equal(operationalRosterContentDigest(data), operationalRosterContentDigest(reorder(data)));
  const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  assert.equal(operationalRosterContentDigest(data), hash(`crewcheck:full-roster-json:v1\0${JSON.stringify(canonical(data))}`));
  const first = await readSource({ rows: [activeRow({ roster: JSON.stringify(data) })] });
  const second = await readSource({ rows: [activeRow({ roster: reorder(data) })] });
  assert.deepEqual(first.body.source.contentDigest, second.body.source.contentDigest);
  assert.equal(first.body.source.contentDigest.algorithm, 'sha256-canonical-json-v1');
  for (const mutate of [copy => { copy.rawText += ' amended'; }, copy => { copy.metadata.privateLabel += ' amended'; },
    copy => { copy.days[1].dutyDebrief = '09:15'; }, copy => { copy.metadata.ordered.reverse(); },
    copy => { copy.days.reverse(); }, copy => { copy.extraUnprojectedField = 'synthetic'; }]) {
    const changed = clone(data); mutate(changed);
    const result = await readSource({ rows: [activeRow({ roster: changed })] });
    assert.equal(result.status, 200);
    assert.equal(result.body.source.legacyFingerprint, first.body.source.legacyFingerprint);
    assert.notEqual(result.body.source.contentDigest.value, first.body.source.contentDigest.value);
  }
  assert.deepEqual(data.metadata.ordered, ['first', 'second']);
  assert.deepEqual(data.days.map(item => item.dayNumber), [6, 20]);
});

test('source preserves frozen DB roster objects and ordered arrays', async () => {
  const freeze = value => {
    if (value && typeof value === 'object') {
      Object.freeze(value);
      for (const child of Object.values(value)) freeze(child);
    }
    return value;
  };
  const data = freeze(roster());
  const before = JSON.stringify(data);
  const row = freeze(activeRow({ roster: data }));
  const result = await readSource({ rows: Object.freeze([row]) });
  assert.equal(result.status, 200);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(data.metadata.ordered, ['first', 'second']);
  assert.deepEqual(data.days.map(item => item.dayNumber), [6, 20]);
});

test('response omits raw monthly roster, other duties, profile, email and authority/consent details', async () => {
  const result = await invokeRoute();
  assert.equal(result.status, 200);
  const serialized = JSON.stringify(result.body);
  for (const secret of [EMAIL, OTHER_EMAIL, PUBLIC_ID, 'SYNTHETIC_PRIVATE_MONTHLY_RAW', 'SYNTHETIC_PRIVATE_DAILY_RAW',
    'SYNTHETIC_PRIVATE_METADATA', 'SYNTHETIC_PRIVATE_PROFILE', 'SYNTHETIC_PRIVATE_PLAN', 'SYNTH-PRIVATE-LATER']) {
    assert.equal(serialized.includes(secret), false, secret);
  }
  assert.deepEqual(Object.keys(result.body).sort(), ['briefing', 'message', 'ok', 'source', 'submissionAllowed']);
  assert.deepEqual(Object.keys(result.body.briefing).sort(), ['duty', 'generatedAt', 'kind', 'previewFingerprint',
    'sourceLabel', 'unsupportedChanges', 'unsupportedSources', 'validUntil', 'weather', 'window']);
  assert.deepEqual(Object.keys(result.body.source).sort(), ['checkedAt', 'contentDigest', 'kind', 'legacyFingerprint', 'revisionAt', 'rosterId', 'rosterKey']);
  assert.equal(result.body.briefing.publication, undefined);
  assert.equal(result.body.briefing.authority, undefined);
  assert.equal(result.body.consent, undefined);
});

test('weather is explicitly unavailable and caller observations cannot activate delivery', async () => {
  const result = await invokeRoute();
  assert.equal(result.body.submissionAllowed, false);
  assert.deepEqual(result.body.briefing.weather, [
    { airport: 'AAA', state: 'unavailable', reason: 'station-unconfirmed' },
    { airport: 'BBB', state: 'unavailable', reason: 'station-unconfirmed' },
  ]);
  assert.deepEqual(result.body.briefing.unsupportedSources, ['radar', 'transport', 'notam', 'operational-clearance']);
});

test('read-only boundary never imports providers, queues, consent/settings writers or legacy auth', () => {
  const identity = functionSource(COMMON, 'readExistingMainIdentity');
  const handler = functionSource(PLATFORM, 'handleOperationalBriefingPreview');
  assert.match(identity, /verifyJwt\(requestToken\(req\)\)/);
  assert.doesNotMatch(identity, /ensureProfile\s*\(|userFromAccount\s*\(|issueJwt\s*\(|setAuthCookie\s*\(/);
  assert.doesNotMatch(handler, /requireMain\s*\(|requireIdentity\s*\(|readBody\s*\(|ensureProfile\s*\(/);
  assert.doesNotMatch(SOURCE, /\b(?:fetch|setTimeout|setInterval|dbPool|issueJwt|ensureProfile|setAuthCookie)\s*\(|process\.env|telegram-fast-ack/);
  const imports = [...SOURCE.matchAll(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g)].map(match => match[2]);
  assert.deepEqual(imports.sort(), ['./operational-briefing.mjs', 'node:crypto']);
  assert.ok(SOURCE.indexOf("import('./operational-briefing.mjs')") > SOURCE.indexOf('contentDigest = operationalRosterContentDigest(roster)'), 'planner loads only after verified data');
});

test('runtime source and real canonical auth import perform no writes, providers, timers or token issuance', () => {
  const sourceUrl = new URL('../../server/concierge/operational-briefing-source.mjs', import.meta.url);
  const commonUrl = new URL('../../server/v139/common.mjs', import.meta.url);
  const generated = new URL('../../server/concierge/generated/', import.meta.url);
  const metadata = () => readdirSync(generated).sort().map(name => [name, statSync(new URL(name, generated)).mtimeMs]);
  const before = metadata();
  const script = `
    import assert from 'node:assert/strict';
    import fs from 'node:fs';
    import fsPromises from 'node:fs/promises';
    import crypto from 'node:crypto';
    import http from 'node:http';
    import https from 'node:https';
    import net from 'node:net';
    import timers from 'node:timers';
    import { syncBuiltinESMExports } from 'node:module';
    process.env.CREWCHECK_AUTH_SECRET = ${JSON.stringify(SECRET)};
    process.env.JWT_SECRET = '';
    Date.now = () => ${NOW};
    const effects = [];
    const deny = name => () => { effects.push(name); throw new Error('Forbidden side effect: ' + name); };
    globalThis.fetch = deny('fetch');
    for (const name of ['setTimeout', 'setInterval', 'setImmediate']) { globalThis[name] = deny(name); timers[name] = deny(name); }
    for (const name of ['writeFile', 'appendFile', 'mkdir', 'rm', 'unlink', 'rename']) {
      fs[name] = deny('fs.' + name); fs[name + 'Sync'] = deny('fs.' + name + 'Sync'); fsPromises[name] = deny('fsPromises.' + name);
    }
    fs.createWriteStream = deny('fs.createWriteStream');
    http.request = deny('http.request'); https.request = deny('https.request');
    http.get = deny('http.get'); https.get = deny('https.get');
    net.connect = deny('net.connect'); net.createConnection = deny('net.createConnection');
    crypto.randomBytes = deny('crypto.randomBytes');
    syncBuiltinESMExports();
    const common = await import(${JSON.stringify(commonUrl.href)});
    const source = await import(${JSON.stringify(sourceUrl.href)});
    const token = common.issueJwt(${JSON.stringify(user())});
    const hmac = crypto.createHmac;
    let hmacCalls = 0;
    crypto.createHmac = (...args) => {
      hmacCalls += 1;
      const instance = hmac(...args), update = instance.update.bind(instance);
      instance.update = value => { assert.equal(String(value), token.split('.').slice(0, 2).join('.')); update(value); return instance; };
      return instance;
    };
    let queries = 0;
    const db = { query: async (sql, params) => {
      assert.match(sql.trim(), /^SELECT /); assert.doesNotMatch(sql, /\\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\\b/);
      queries += 1;
      if (queries === 1) { assert.deepEqual(params, [${JSON.stringify(EMAIL)}]); return [[${JSON.stringify(profile())}]]; }
      assert.equal(queries, 2); assert.deepEqual(params, [${JSON.stringify(EMAIL)}, ${JSON.stringify(PUBLIC_ID)}]);
      return [[${JSON.stringify(activeRow())}]];
    } };
    const identity = await common.readExistingMainIdentity({ headers: { authorization: 'Bearer ' + token } }, { getDb: async () => db, now: () => ${NOW} });
    assert.equal(identity.ok, true);
    const result = await source.readOperationalBriefingPreview(identity, { now: () => ${NOW} });
    assert.equal(result.status, 200); assert.equal(result.body.submissionAllowed, false); assert.equal(queries, 2);
    assert.equal(hmacCalls, 1, 'only one token verification; no request-time token issuance');
    assert.ok(result.body.briefing.weather.every(item => item.state === 'unavailable'));
    assert.deepEqual(effects, []);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: ROOT, encoding: 'utf8', timeout: 10_000,
    env: { PATH: '/usr/bin:/bin', TZ: 'Pacific/Kiritimati', CREWCHECK_AUTH_SECRET: SECRET, JWT_SECRET: '' },
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.deepEqual(metadata(), before, 'runtime import must never regenerate the canonical bridge');
});
