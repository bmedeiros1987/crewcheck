// Owner-controlled public deployment data only. Never read an HTTP/job envelope.
import assert from 'node:assert/strict';
import { ENVIRONMENT_NODE_ID, REPOSITORY } from './oidc.mjs';
export const ENROLLMENT_KEY = 'CREWCHECK_RELEASE_APPROVAL_ENROLLMENT';
export const SERVICE_ID = 'srv-d8de30sm0tmc73drgvig';
export const SERVICE_ORIGIN = 'https://crewcheck.onrender.com';
export const PROBE_OPERATIONS = Object.freeze(['probe']);
const keys = ['reviewedCodeSha', 'reviewedWorkflowSha', 'environmentNodeId', 'protectedJobName', 'operations'];
export function parseProbeEnrollment(raw, identity) {
  try {
    assert(typeof raw === 'string' && Buffer.byteLength(raw) > 0 && Buffer.byteLength(raw) <= 4096);
    assert(identity?.serviceId === SERVICE_ID && identity.repository === REPOSITORY && identity.origin === SERVICE_ORIGIN);
    assert(/^[0-9a-f]{40}$/.test(identity.commit));
    const policy = JSON.parse(raw);
    assert(policy && Object.getPrototypeOf(policy) === Object.prototype);
    assert.deepEqual(Object.keys(policy).sort(), [...keys].sort());
    for (const key of ['reviewedCodeSha', 'reviewedWorkflowSha']) assert(/^[0-9a-f]{40}$/.test(policy[key]));
    assert.equal(policy.reviewedCodeSha, identity.commit);
    assert.equal(policy.environmentNodeId, ENVIRONMENT_NODE_ID);
    assert.equal(policy.protectedJobName, 'reviewed-mobile');
    assert.deepEqual(policy.operations, PROBE_OPERATIONS);
    return Object.freeze({ ...policy, operations: PROBE_OPERATIONS });
  } catch { throw Error('RELEASE_ENROLLMENT_UNVERIFIED'); }
}
export function probeEnrollmentFromEnvironment(environment) {
  const raw = environment?.[ENROLLMENT_KEY];
  if (raw === undefined || raw === '') return Object.freeze({ policy: null, code: 'RELEASE_ENROLLMENT_ABSENT' });
  try {
    const policy = parseProbeEnrollment(raw, {
      serviceId: environment.RENDER_SERVICE_ID,
      repository: environment.RENDER_GIT_REPO_SLUG,
      origin: environment.RENDER_EXTERNAL_URL,
      commit: environment.RENDER_GIT_COMMIT,
    });
    return Object.freeze({ policy, code: null });
  } catch { return Object.freeze({ policy: null, code: 'RELEASE_ENROLLMENT_UNVERIFIED' }); }
}
