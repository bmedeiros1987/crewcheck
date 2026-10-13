// This gate records a reviewed process trust boundary, NOT transport evidence.
// Render terminates public TLS upstream; Node cannot prove external HTTPS.
// Headers/socket flags cannot opt in. JWT and independent approval remain required.
import { SERVICE_ID, SERVICE_ORIGIN } from './enrollment.mjs';
export function createRenderTrustBoundaryVerifier(renderTrustBoundary) {
  const accepted = !!renderTrustBoundary &&
    Object.keys(renderTrustBoundary).sort().join(',') === 'origin,serviceId,trustedInfrastructure,trustedPeers,trustedProcess' &&
    renderTrustBoundary.serviceId === SERVICE_ID && renderTrustBoundary.origin === SERVICE_ORIGIN &&
    renderTrustBoundary.trustedInfrastructure === 'render' &&
    renderTrustBoundary.trustedProcess === 'reviewed-node-process-and-authorized-administrators' &&
    renderTrustBoundary.trustedPeers === 'authorized-render-private-network-peers';
  return async () => accepted;
}
