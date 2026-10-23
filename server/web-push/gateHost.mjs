import crypto from 'node:crypto';
import { createMysqlWatchAuthorityProducer } from '../watch-authority/mysql-authority-producer.mjs';
import { installationBindingKey } from './installationRegistry.mjs';
import { enqueueCrewCheckPush, dispatchPersistentPush } from './outbox.mjs';
import { validPushEnvelope } from '../../shared/crewcheckPushContract.mjs';
import { inspectGateSourceHistory } from './gateSourceHistory.mjs';
import { gateCandidateEnvelope } from './gateCandidate.mjs';
import { radarFlightId } from '../../shared/gate-query-day.mjs';

// Code connection only. No environment variable can activate this host.
export const CREWCHECK_GATE_HOST_ENABLED = false;
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,160}$/.test(value);
// Expected refusal (revision/authority/installation fence). Only this class maps
// to HTTP 409; driver/storage failures stay internal and are never a conflict.
export class GateConsentConflictError extends Error {
  constructor() { super('Autoridade, aparelho ou consentimento de portão não confirmados.'); this.name = 'GateConsentConflictError'; this.status = 409; }
}
const denied = () => new GateConsentConflictError();
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const sameInstallation = (row, scope) => row?.email === scope.email && row.ownerId === scope.ownerId && row.installationId === scope.installationId && row.active === true;
export const gateConsentKey = (owner, installation) => 'crewcheck-push-binding:gate-v1:' + crypto.createHash('sha256').update(JSON.stringify([owner, installation])).digest('hex');
function principal(identity, now) {
  const p = identity?.payload;
  if (!p || p.iss !== 'crewcheck' || p.aud !== 'crewcheck-web' || !id(p.sub) || identity.profile?.public_id !== p.sub || p.mustChangePassword
    || typeof p.jti !== 'string' || !/^watch1_[a-f0-9]{64}$/.test(p.jti) || !Number.isSafeInteger(p.exp) || !Number.isSafeInteger(p.iat)
    || p.iat > now / 1000 || p.exp <= now / 1000 || p.exp <= p.iat || typeof identity.email !== 'string' || p.email?.trim().toLowerCase() !== identity.email) return null;
  return { email: identity.email, ownerId: p.sub, sessionId: p.jti, expiresAt: p.exp * 1000 };
}
// Reuse #1150's exact producer, but expose only existing-session reads. No issuer,
// nonce, login route, credential, table creation or session writer is added here.
function authorityReader(clock) {
  return createMysqlWatchAuthorityProducer({ clock, verifyCurrentGetMe: async () => null, verifySessionInvalidation: async () => null });
}
async function state(c, key) {
  const [rows] = await c.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=? FOR UPDATE', [key]);
  return rows.length === 1 ? parse(rows[0].payload) : null;
}
async function installation(c, scope) {
  const [profiles] = await c.query('SELECT public_id FROM crewcheck_platform_profiles WHERE email=? FOR UPDATE', [scope.email]);
  if (profiles.length !== 1 || profiles[0].public_id !== scope.ownerId) return null;
  const [accounts] = await c.query('SELECT must_change_password FROM crewcheck_platform_accounts WHERE email=? FOR UPDATE', [scope.email]);
  if (accounts.length !== 1 || accounts[0].must_change_password) return null;
  const binding = await state(c, installationBindingKey(scope.ownerId, scope.installationId));
  if (!sameInstallation(binding, scope) || !Number.isSafeInteger(binding.revision) || binding.revision < 1
    || typeof binding.endpointKey !== 'string' || !/^crewcheck-push-installation:[a-f0-9]{64}$/.test(binding.endpointKey)) return null;
  const endpoint = await state(c, binding.endpointKey);
  return sameInstallation(endpoint, scope) && endpoint.revision === binding.revision && endpoint.sealed ? { binding, endpointKey: binding.endpointKey } : null;
}
async function currentAuthority(c, scope, clock) {
  const authority = await authorityReader(clock).lockCurrentSession(c, { owner: scope.ownerId, session: scope.sessionId });
  return authority?.authenticated === true && authority.owner === scope.ownerId && authority.session === scope.sessionId && id(authority.epoch)
    && authority.revoked === false && Number.isSafeInteger(authority.expiresAt) && authority.expiresAt > clock() ? authority : null;
}
async function transaction(db, run) {
  const c = await db.getConnection();
  try { await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED'); await c.beginTransaction(); const result = await run(c); await c.commit(); return result; }
  catch (error) { await c.rollback(); throw error; } finally { c.release(); }
}
export async function changeGateConsent(db, identity, input, { enabled = false, clock = Date.now } = {}) {
  if (enabled !== true) return { status: 'disabled', received: null };
  const p = principal(identity, clock());
  if (!p || !id(input?.installationId) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || input.expectedRevision >= Number.MAX_SAFE_INTEGER
    || !Number.isSafeInteger(input.expectedInstallationRevision) || input.expectedInstallationRevision < 1 || typeof input.enabled !== 'boolean' || input.enabled && input.confirmed !== true
    || ['authorityEpoch', 'ownerId', 'sessionId'].some(key => Object.hasOwn(input, key))) throw denied();
  const scope = { ...p, installationId: input.installationId };
  return transaction(db, async c => {
    const installed = await installation(c, scope), authority = await currentAuthority(c, scope, clock);
    if (!installed || installed.binding.revision !== input.expectedInstallationRevision || !authority || authority.expiresAt > p.expiresAt) throw denied();
    const key = gateConsentKey(scope.ownerId, scope.installationId), previous = await state(c, key);
    if (previous && (previous.email !== scope.email || previous.ownerId !== scope.ownerId || previous.installationId !== scope.installationId)) throw denied();
    if ((previous?.revision || 0) !== input.expectedRevision) throw denied();
    const record = { email: scope.email, ownerId: scope.ownerId, installationId: scope.installationId, sessionId: scope.sessionId,
      authorityEpoch: authority.epoch, installationRevision: installed.binding.revision, revision: input.expectedRevision + 1,
      active: input.enabled, topic: 'departure-gate-change' };
    await c.query('INSERT INTO crewcheck_telegram_state (state_key,payload,updated_at) VALUES(?,?,NOW(3)) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_at=NOW(3)', [key, JSON.stringify(record)]);
    // A server tombstone is NOT a device fence/ACK; never claim receipt or readiness.
    return { status: input.enabled ? 'consent_recorded' : 'server_consent_revoked', ownerId:record.ownerId,installationId:record.installationId,authorityEpoch:record.authorityEpoch,consentRevision:record.installationRevision,topicRevision:record.revision,enabled:record.active, localFenceConfirmed: false, received: null };
  });
}
export function createGateOutboxConnection({ enabled = false, readSource = async () => null, clock = Date.now } = {}) {
  if (enabled !== true) return Object.freeze({ enqueue: async () => ({ status: 'disabled', received: null }), dispatch: async () => ({ status: 'disabled', received: null }) });
  const verifyContext = async (c, job, now) => {
    const envelope = job.envelope, scope = { email: job.email, ownerId: envelope?.ownerId, installationId: envelope?.installationId };
    if (!validPushEnvelope(envelope) || !id(envelope.authorityEpoch) || !Number.isFinite(now)) return false;
    const installed = await installation(c, scope), consent = await state(c, gateConsentKey(scope.ownerId, scope.installationId));
    if (!installed || !sameInstallation(consent, scope) || consent.topic !== 'departure-gate-change' || consent.revision !== envelope.topicRevision
      || consent.installationRevision !== envelope.consentRevision || installed.binding.revision !== envelope.consentRevision || consent.authorityEpoch !== envelope.authorityEpoch) return false;
    const authority = await currentAuthority(c, { ...scope, sessionId: consent.sessionId }, clock);
    if (!authority || authority.epoch !== envelope.authorityEpoch || Date.parse(envelope.expiresAt) > Math.min(authority.expiresAt, now + 300000)) return false;
    // No request body, persisted job or device can be its own operational proof.
    const source = await readSource(c, scope, now), context = job.sourceContext;
    const history = inspectGateSourceHistory(source, { ...scope, rosterRevision: context?.rosterRevision, identity: context?.identity }, now);
    if (history.status !== 'change' || !id(source.rosterRevision)) return false;
    const proof = history.current;
    if (proof.gate !== context.gate || proof.sourceUpdatedAt !== context.sourceUpdatedAt) return false;
    const expiresAt = Math.min(authority.expiresAt, now + 300000, Date.parse(proof.sourceUpdatedAt) + 1800000, Date.parse(proof.scheduledDepartureUtc) + 3600000);
    // Reuse the producer's exact canonical derivation. Neither an input key nor
    // a stored outbox row is authority for a second identity of this change.
    const expected = gateCandidateEnvelope({ ownerId: scope.ownerId,
      installation: { installationId: scope.installationId, revision: installed.binding.revision },
      consent: { revision: consent.revision }, authority: { epoch: authority.epoch }, rosterRevision: source.rosterRevision,
      occurrence: [radarFlightId(proof.flight), proof.origin, proof.destination, new Date(proof.scheduledDepartureUtc).toISOString()],
      gate: proof.gate, observedAt: Date.parse(proof.sourceUpdatedAt), expiresAt });
    return ['schema','ownerId','installationId','consentRevision','eventKey','topicRevision','authorityEpoch','route'].every(key => envelope[key] === expected[key])
      && Date.parse(envelope.expiresAt) <= expiresAt;
  };
  return Object.freeze({
    async enqueue(db, identity, input) {
      const p = principal(identity, clock()); if (!p || input.envelope?.ownerId !== p.ownerId) return { status: 'blocked', received: null };
      return enqueueCrewCheckPush(db, { ...input, email: p.email }, { verifyContext, clock });
    },
    dispatch: (db, selected, configuration, send) => dispatchPersistentPush(db, selected, { configuration, verifyContext, clock, ...(send ? { send } : {}) }),
  });
}
