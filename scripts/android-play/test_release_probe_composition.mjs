// Offline only: real verifier/provider/receiver with RSA, HTTP-shaped evidence and
// transactional in-memory SQL. No real token, service configuration or network.
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { parseProbeEnrollment, probeEnrollmentFromEnvironment, ENROLLMENT_KEY, SERVICE_ID, SERVICE_ORIGIN, PROBE_OPERATIONS } from '../../server/release-journal/enrollment.mjs';
import { createRenderTrustBoundaryVerifier } from '../../server/release-journal/render-ingress.mjs';
import { prepareProbeDependencies, createProbeOnlyReleaseHandler } from '../../server/release-journal/probe-composition.mjs';
import { createReleaseJournalHandler, PATH } from '../../server/release-journal/route.mjs';
import { createOidcVerifier } from '../../server/release-journal/oidc.mjs';
import { canonical } from './reconcile_journal.mjs';
import { database } from './mysql_journal_fixture.mjs';
import { mysqlAdapter } from '../../server/mysql-platform-adapter.mjs';
import { reviewFixture } from './release_review_fixture.mjs';
import { fixtureToken, fixtureJwk } from './test_release_oidc.mjs';
const f = reviewFixture({ operations: ['probe'] });
let time = 10000, publicGets = 0, poolCalls = 0;
const identity = { serviceId: SERVICE_ID, repository: 'bmedeiros1987/crewcheck', origin: SERVICE_ORIGIN, commit: f.policy.reviewedCodeSha };
const environment = { RENDER_SERVICE_ID: identity.serviceId, RENDER_GIT_REPO_SLUG: identity.repository, RENDER_EXTERNAL_URL: identity.origin, RENDER_GIT_COMMIT: identity.commit, [ENROLLMENT_KEY]: JSON.stringify(f.policy) };
assert.deepEqual(parseProbeEnrollment(environment[ENROLLMENT_KEY], identity), f.policy);
assert.equal(Object.isFrozen(parseProbeEnrollment(environment[ENROLLMENT_KEY], identity).operations), true);
for (const override of [{ reviewedCodeSha: 'a'.repeat(40) }, { reviewedWorkflowSha: 'bad' }, { environmentNodeId: 'caller-environment' }, { protectedJobName: 'other' }, { operations: ['probe', 'reserve'] }, { operations: [] }, { enabled: true }]) {
  assert.throws(() => parseProbeEnrollment(JSON.stringify({ ...f.policy, ...override }), identity), /RELEASE_ENROLLMENT_UNVERIFIED/);
}
for (const override of [{ serviceId: 'other' }, { repository: 'foreign/repo' }, { origin: 'https://foreign.invalid' }, { commit: 'bad' }]) assert.throws(() => parseProbeEnrollment(environment[ENROLLMENT_KEY], { ...identity, ...override }), /RELEASE_ENROLLMENT_UNVERIFIED/);
assert.equal(probeEnrollmentFromEnvironment({}).policy, null);
assert.equal(probeEnrollmentFromEnvironment({ ...environment, [ENROLLMENT_KEY]: 'bad secret sentinel' }).policy, null);
assert.equal(probeEnrollmentFromEnvironment({ ...environment, [ENROLLMENT_KEY]: 'x'.repeat(4097) }).code, 'RELEASE_ENROLLMENT_UNVERIFIED');
// Explicit TEST-only acceptance of trusted infrastructure/process/peers.
// This is an administrative policy; it does not attest public TLS or a socket.
const renderTrustBoundary = { serviceId: SERVICE_ID, origin: SERVICE_ORIGIN,
  trustedInfrastructure: 'render', trustedProcess: 'reviewed-node-process-and-authorized-administrators',
  trustedPeers: 'authorized-render-private-network-peers' };
const forged = { socket: {}, headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'crewcheck.onrender.com', forwarded: 'proto=https;host=crewcheck.onrender.com' }, trustedTls: true, ingressProof: { verified: true } };
assert.equal(await createRenderTrustBoundaryVerifier()(forged), false);
assert.equal(await createRenderTrustBoundaryVerifier(forged)(forged), false);
assert.equal(await createRenderTrustBoundaryVerifier(renderTrustBoundary)(forged), true);
for (const override of [{ origin: 'https://foreign.invalid' }, { serviceId: 'other' }, { trustedPeers: false }, { trustedProcess: false }, { trustedInfrastructure: false }, { publicHTTPSproof: true }]) {
  assert.equal(await createRenderTrustBoundaryVerifier({ ...renderTrustBoundary, ...override })(forged), false);
}
const raw = database();
const native = { query: (...args) => raw.query(...args), async getConnection() { const c = await raw.getConnection(); return { async query(sql, args) { if (sql === 'BEGIN') { await c.beginTransaction(); return [{}]; } if (sql === 'COMMIT') { await c.commit(); return [{}]; } if (sql === 'ROLLBACK') { await c.rollback(); return [{}]; } return c.query(sql, args); }, release: () => c.release(), destroy: () => c.destroy() }; } };
const db = mysqlAdapter(native);
const dependencies = prepareProbeDependencies({ environment, renderTrustBoundary, githubRequest: url => { publicGets++; return f.request(url); }, now: () => time });
assert.deepEqual(dependencies.allowedOperations, ['probe']);
assert(dependencies.githubReviewProvider);
const verifyToken = createOidcVerifier({ now: () => time, loadJwks: async () => ({ keys: [fixtureJwk] }) });
// TEST ONLY enabled receiver; production composition below is always compiled OFF.
const active = createReleaseJournalHandler({ enabled: true, allowedOperations: dependencies.allowedOperations, verifyIngress: dependencies.verifyIngress, githubReviewProvider: dependencies.githubReviewProvider, poolProvider: async () => { poolCalls++; return db; }, verifyToken, now: () => time });
const frame = operation => ({ schema: 2, id: 'fixture_' + operation, operation, binding: f.binding, revision: 0, input: {} });
async function call(handler, operation = 'probe', transport = true, bodyOverride) {
  const req = Readable.from([Buffer.from(canonical(bodyOverride ?? frame(operation)))]);
  req.method = 'POST'; req.socket = {}; // Socket carries no TLS proof.
  req.headers = { ...forged.headers, 'content-type': 'application/json', authorization: 'Bearer ' + (transport ? fixtureToken(f.claims) : 'forged.jwt.token') };
  req.trustedTls = true; req.ingressProof = { verified: true };
  const res = { writeHead(status) { this.status = status; }, end(text) { this.body = JSON.parse(text); } };
  await handler(req, res, new URL(SERVICE_ORIGIN + PATH)); return res;
}
assert.equal((await call(active, 'probe', false)).status, 403);
assert.equal(publicGets, 0); assert.equal(poolCalls, 0); assert.equal(raw.rows.size, 0);
for (const operation of ['read', 'observe', 'reserve', 'startAllocation', 'saveEdit', 'allocate', 'finalize', 'startStage', 'reconcile', 'rollover']) assert.equal((await call(active, operation)).status, 403);
assert.equal(publicGets, 0); assert.equal(poolCalls, 0); assert.equal(raw.rows.size, 0);
assert.equal((await call(active, 'probe', true, { ...frame('probe'), allowedOperations: ['reserve'] })).status, 403);
const result = await call(active); assert.equal(result.status, 200); assert.equal(result.body.storeMutationAllowed, false); assert.equal(result.body.retryAllowed, false);
assert.deepEqual([...raw.rows.keys()].sort(), ['play-release-admission:com.crewcheck.app:123:1', 'play-release-approval:com.crewcheck.app:123:1', 'play-release-revocation:com.crewcheck.app:123:1']);
const before = canonical([...raw.rows]); f.state.reviews = [];
assert.equal((await call(active)).status, 403); assert.equal(canonical([...raw.rows]), before);
f.state.reviews = reviewFixture({ operations: ['probe'] }).state.reviews; time = f.approval.expiresAt;
assert.equal((await call(active)).status, 403); assert.equal(canonical([...raw.rows]), before);
// Cancellation may update the revocation authority row but cannot reopen a
// probe or widen its scope. Expiry does not delete rows or renew approval.
time = 10000; f.state.meta.conclusion = 'cancelled';
assert.equal((await call(active)).status, 403);
assert.equal(JSON.parse(raw.rows.get('play-release-revocation:com.crewcheck.app:123:1')).revoked, true);
f.state.meta.conclusion = null;
assert.equal((await call(active)).status, 403);
assert.equal(raw.rows.has('play-release-journal:com.crewcheck.app'), false);
// Failure before COMMIT rolls back authority inserts, preserving unrelated data.
// A lost COMMIT reply preserves all committed rows and reports uncertainty.
for (const mode of ['rollback', 'lost-commit']) {
  const fixture = database(); fixture.rows.set('profile:fictional', 'unchanged fictional user data');
  let inserts = 0, commits = 0;
  const testDb = mysqlAdapter({ query: (...args) => fixture.query(...args), async getConnection() {
    const c = await fixture.getConnection();
    return { async query(sql, args) {
      if (sql === 'BEGIN') { await c.beginTransaction(); return [{}]; }
      if (sql === 'COMMIT') { commits++; await c.commit(); return [{}]; }
      if (sql === 'ROLLBACK') { await c.rollback(); return [{}]; }
      if (sql.startsWith('INSERT INTO') && ++inserts === 3 && mode === 'rollback') throw Error('fictional private diagnostic');
      return c.query(sql, args);
    }, release: () => c.release(), destroy: () => c.destroy() };
  } });
  if (mode === 'lost-commit') fixture.lose();
  const ownFixture = reviewFixture({ operations: ['probe'] });
  const ownDeps = prepareProbeDependencies({ environment, renderTrustBoundary, githubRequest: ownFixture.request, now: () => time });
  const handler = createReleaseJournalHandler({ enabled: true, ...ownDeps, poolProvider: async () => testDb, verifyToken, now: () => time });
  const response = await call(handler); assert.equal(response.status, 403); assert.equal(response.body.code, 'RELEASE_JOURNAL_DENIED');
  assert.equal(fixture.rows.get('profile:fictional'), 'unchanged fictional user data');
  assert.equal(fixture.rows.has('play-release-journal:com.crewcheck.app'), false);
  assert.equal(inserts, 3); assert.equal(commits, mode === 'rollback' ? 0 : 1);
  assert.equal([...fixture.rows.keys()].filter(key => key.startsWith('play-release-')).length, mode === 'rollback' ? 0 : 3);
}
// Caller/environment "enabled" flags cannot switch this factory on, even with a
// complete valid enrollment and trust boundary. Bad enrollment also leaves app startup safe.
for (const env of [{}, environment, { ...environment, [ENROLLMENT_KEY]: 'bad' }, { ...environment, RELEASE_ENABLED: 'true' }]) {
  let touches = 0;
  const off = createProbeOnlyReleaseHandler({ enabled: true, environment: env, githubRequest: () => { touches++; throw Error(); }, poolProvider: () => { touches++; throw Error(); }, renderTrustBoundary });
  const req = { method: 'POST', get headers() { touches++; throw Error(); }, [Symbol.asyncIterator]() { touches++; throw Error(); } };
  const res = { writeHead(status) { this.status = status; }, end(text) { this.body = JSON.parse(text); } };
  await off(req, res, new URL(SERVICE_ORIGIN + PATH)); assert.equal(res.status, 503); assert.equal(res.body.code, 'RELEASE_JOURNAL_OFF'); assert.equal(touches, 0);
}
console.log('PASS probe-only composition: exact trusted enrollment, explicit process trust boundary, forged headers cannot authenticate, scope before GitHub/DB, exactly3 authority rows in fictional SQL, expiry and compiled OFF');
