import { radarFlightId, radarSourceEpoch } from '../shared/gate-query-day.mjs';

// Opt-in DATA contract of the existing configured custom source, not a provider
// activation. Generic updated/received/cache/aircraft-signal clocks are excluded.
export function customGateSourceUpdate(payload, now = Date.now()) {
  if (!Number.isFinite(now)) return null;
  const proof = payload?.departureGateUpdate;
  if (!proof || proof.schema !== 'crewcheck.departure-gate-update.v1') return null;
  const first = (...values) => values.find(value => typeof value === 'string' && value.trim())?.trim() || '';
  const upper = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
  const gate = upper(first(payload?.gate, payload?.departure?.gate));
  const flight = first(payload?.flight, payload?.flight_iata, payload?.flight_icao);
  const origin = upper(first(payload?.origin, payload?.departure?.iata));
  const destination = upper(first(payload?.destination, payload?.arrival?.iata));
  const planned = radarSourceEpoch(first(payload?.scheduledDepartureUtc, payload?.departure?.scheduled));
  const updated = radarSourceEpoch(proof.updatedAt);
  // Duplicate source fields are not fallbacks when both are present. Refuse
  // contradictions rather than selecting whichever alias happens to come first.
  const consistent = (values, normalize, expected) => values.every(value =>
    value === undefined || value === null || value === '' ||
    typeof value === 'string' && (!value.trim() || normalize(value) === expected));
  if (!consistent([payload?.gate, payload?.departure?.gate], upper, gate)
    || !consistent([payload?.flight, payload?.flight_iata, payload?.flight_icao], radarFlightId, radarFlightId(flight))
    || !consistent([payload?.origin, payload?.departure?.iata], upper, origin)
    || !consistent([payload?.destination, payload?.arrival?.iata], upper, destination)
    || !consistent([payload?.scheduledDepartureUtc, payload?.departure?.scheduled], radarSourceEpoch, planned)) return null;

  if (!gate || !/^[A-Z0-9]{2,3}\d{1,5}[A-Z]?$/.test(radarFlightId(flight)) || upper(proof.gate) !== gate || typeof proof.flight !== 'string' || radarFlightId(proof.flight) !== radarFlightId(flight)
    || !/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || upper(proof.origin) !== origin || upper(proof.destination) !== destination
    || !Number.isFinite(planned) || radarSourceEpoch(proof.scheduledDepartureUtc) !== planned
    || !Number.isFinite(updated) || updated <= 0 || updated > now) return null;
  return { version: 1, provider: 'custom', kind: 'departure-gate-update', sourceUpdatedAt: new Date(updated).toISOString(),
    gate, flight, origin, destination, scheduledDepartureUtc: new Date(planned).toISOString() };
}
