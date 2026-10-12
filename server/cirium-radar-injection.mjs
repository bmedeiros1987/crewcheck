import { CIRIUM_SKY_PRODUCTION_ENABLED, productionCiriumSkyTransport, runCiriumSkyRadar } from './cirium-sky-transport.mjs';
import { evaluateCiriumRadar } from './cirium-radar-provider.mjs';

// Production remains hard OFF; no HTTP/env activation or credential reads.
export function defaultCiriumRadarOptions() {
  return CIRIUM_SKY_PRODUCTION_ENABLED ? { enabled: true, transport: productionCiriumSkyTransport() } : undefined;
}
export function ciriumRadarInjectionEnabled(options) { return options?.enabled === true; }
export function ciriumRadarRegistration() { return { key: 'cirium-sky', available: false, state: 'disabled' }; }

export function ciriumRadarIdentity(params) {
  return Object.fromEntries(['carrierNamespace', 'carrierFsCode', 'flightNumber', 'origin', 'destination',
    'departureDate', 'originTimeZone', 'scheduledDepartureUtc'].map(key => [key, params.get(key)]));
}

function radarResult(result) {
  return { ...(result.candidate || {}), provider: 'cirium-sky', providerState: result.state,
    ok: result.ok, configured: false, canonicalReadOnly: true,
    occurrenceKey: result.occurrenceKey || '', provenance: result.provenance,
    updatedAt: result.candidate?.updatedAt || null,
    message: 'Cirium: caminho sintético isolado, sem transporte de produção.' };
}

export async function runCiriumRadarInjection(identity, options, requestedFlight) {
  if (!ciriumRadarInjectionEnabled(options)) return null;
  if (options.transport) return runCiriumSkyRadar(identity, options.transport, requestedFlight);
  // Reuse the pure request validation before invoking any injected source.
  const validation = evaluateCiriumRadar(identity, { state: 'available', rows: [] }, { enabled: true });
  if (validation.state === 'invalid_request') return radarResult(validation);
  if (requestedFlight !== `${identity.carrierFsCode}${identity.flightNumber}`) return radarResult({ state: 'invalid_request', ok: false, provenance: null });
  if (typeof options.source !== 'function') return radarResult({ state: 'not_configured', ok: false, provenance: null });
  let response;
  try { response = await options.source(Object.freeze({ ...identity })); }
  catch { return radarResult({ state: 'provider_error', ok: false, provenance: null }); }
  return radarResult(evaluateCiriumRadar(identity, response, { enabled: true }));
}

export function ciriumRadarProjection(item) {
  if (item.provider !== 'cirium-sky') return {};
  return { provider: item.provider, providerState: item.providerState, canonicalReadOnly: true,
    occurrenceKey: item.occurrenceKey || '', provenance: item.provenance || null, updatedAt: item.updatedAt || null };
}
