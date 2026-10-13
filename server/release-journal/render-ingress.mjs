// A transport attestor must be wired from reviewed server code after real ingress
// verification. Headers, env strings and request flags are never attestations.
import { SERVICE_ID, SERVICE_ORIGIN } from './enrollment.mjs';
export function createRenderIngressVerifier(transportAttestor) {
  return async request => {
    try {
      if (!transportAttestor || typeof transportAttestor.inspect !== 'function' ||
          typeof transportAttestor.isVerified !== 'function') return false;
      const proof = await transportAttestor.inspect(request);
      if (transportAttestor.isVerified(proof) !== true) return false;
      return proof.request === request && !!request.socket && proof.socket === request.socket &&
        proof.serviceId === SERVICE_ID && proof.origin === SERVICE_ORIGIN &&
        proof.transport === 'render-public-https' && proof.forwardedHeaderOnly === false;
    } catch { return false; }
  };
}
