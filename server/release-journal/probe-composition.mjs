// Reuse the reviewed receiver/provider/pool. This composition cannot be enabled
// by an environment flag, HTTP field or caller option. No deployment data writes.
import { createReleaseJournalHandler } from './route.mjs';
import { createGitHubReviewProvider } from './github-review.mjs';
import { probeEnrollmentFromEnvironment, PROBE_OPERATIONS } from './enrollment.mjs';
import { createRenderTrustBoundaryVerifier } from './render-ingress.mjs';

export function prepareProbeDependencies({ environment = process.env, githubRequest, renderTrustBoundary, now } = {}) {
  const enrollment = probeEnrollmentFromEnvironment(environment);
  const githubReviewProvider = enrollment.policy
    ? createGitHubReviewProvider({ policy: enrollment.policy, request: githubRequest, now }) : undefined;
  return Object.freeze({
    enrollment,
    githubReviewProvider,
    verifyIngress: createRenderTrustBoundaryVerifier(renderTrustBoundary),
    allowedOperations: PROBE_OPERATIONS,
  });
}
export function createProbeOnlyReleaseHandler({ poolProvider, environment = process.env, githubRequest, renderTrustBoundary, now } = {}) {
  const dependencies = prepareProbeDependencies({ environment, githubRequest, renderTrustBoundary, now });
  return createReleaseJournalHandler({
    enabled: false,
    poolProvider,
    githubReviewProvider: dependencies.githubReviewProvider,
    verifyIngress: dependencies.verifyIngress,
    allowedOperations: dependencies.allowedOperations,
    now,
  });
}
