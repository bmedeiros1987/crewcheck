import { normalizeCiriumFlightStatus } from './cirium-flight-adapter.mjs';
import { radarOccurrenceKey } from './radar-occurrence-identity.mjs';
import { buildRadarFieldProvenance } from './radar-field-provenance.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const code = (value, pattern) => typeof value === 'string' && pattern.test(value) ? value : '';
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return null;
  const calendar = Date.parse(`${value.slice(0, 10)}T12:00:00Z`);
  const ms = Date.parse(value);
  return Number.isFinite(calendar) && new Date(calendar).toISOString().slice(0, 10) === value.slice(0, 10)
    && Number.isFinite(ms) ? ms : null;
}
function localDate(ms, zone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ms);
    const part = type => parts.find(item => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  } catch { return ''; }
}
function localStamp(ms, zone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' }).formatToParts(ms);
  const part = type => parts.find(item => item.type === type)?.value;
  const offset = part('timeZoneName').replace('GMT', '') || '+00:00';
  const milliseconds = String((ms % 1000 + 1000) % 1000).padStart(3, '0');
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}.${milliseconds}${offset}`;
}

const transportStates = new Set(['not_configured', 'timeout', 'rate_limited', 'provider_error']);
const result = (state, extra = {}) => ({ state, ok: state === 'available', provider: 'cirium-sky', candidate: null, provenance: null, ...extra });

// Shared physical identity validation; namespace is explicit, never inferred.
export function validCiriumRadarIdentity(request, namespace = 'FS') {
  if (!object(request) || !['FS', 'IATA'].includes(namespace)) return false;
  const carrier = namespace === 'FS' ? code(request.carrierFsCode, /^[A-Z0-9]{2,3}$/)
    : code(request.carrierIataCode, /^[A-Z0-9]{2}$/);
  const scheduledMs = instant(request.scheduledDepartureUtc);
  return request.carrierNamespace === namespace && Boolean(carrier)
    && Boolean(code(request.flightNumber, /^[0-9]{1,4}[A-Z]?$/))
    && Boolean(code(request.origin, /^[A-Z]{3}$/)) && Boolean(code(request.destination, /^[A-Z]{3}$/))
    && request.origin !== request.destination && typeof request.originTimeZone === 'string' && Boolean(request.originTimeZone)
    && scheduledMs !== null && /^\d{4}-\d{2}-\d{2}$/.test(request.departureDate || '')
    && localDate(scheduledMs, request.originTimeZone) === request.departureDate
    && (namespace !== 'IATA' || request.carrierFsCode === undefined);
}

// Pure eligibility contract, deliberately disconnected from HTTP, env and admin diagnostics.
// `response.rows` is the parsed row collection supplied by a future reviewed transport.
export function evaluateCiriumRadar(request, response, options = {}) {
  if (options.enabled !== true) return result('disabled');
  if (!validCiriumRadarIdentity(request)) return result('invalid_request');
  const carrier = code(request.carrierFsCode, /^[A-Z0-9]{2,3}$/);
  const flightNumber = code(request.flightNumber, /^[0-9]{1,4}[A-Z]?$/);
  const origin = code(request.origin, /^[A-Z]{3}$/);
  const destination = code(request.destination, /^[A-Z]{3}$/);
  const scheduledMs = instant(request.scheduledDepartureUtc);
  if (!object(response)) return result('invalid_payload');
  if (transportStates.has(response.state)) return result(response.state);
  if (response.state !== 'available' || !Array.isArray(response.rows) || response.rows.length > 100) return result('invalid_payload');
  if (!response.rows.length) return result('no_data');

  const matching = [];
  for (const row of response.rows) {
    if (!object(row)) return result('invalid_payload');
    const departure = row.operationalTimes?.scheduledGateDeparture?.dateUtc;
    const arrival = row.operationalTimes?.scheduledGateArrival?.dateUtc;
    const depMs = instant(departure);
    const arrMs = instant(arrival);
    if (!code(row.carrierFsCode, /^[A-Z0-9]{2,3}$/) || !code(row.flightNumber, /^[0-9]{1,4}[A-Z]?$/)
      || !code(row.departureAirportFsCode, /^[A-Z]{3}$/) || !code(row.arrivalAirportFsCode, /^[A-Z]{3}$/)
      || row.departureAirportFsCode === row.arrivalAirportFsCode || depMs === null || arrMs === null
      || arrMs <= depMs || arrMs - depMs > 24 * 60 * 60_000) return result('invalid_payload');
    if (row.carrierFsCode !== carrier || row.flightNumber !== flightNumber || row.departureAirportFsCode !== origin
      || row.arrivalAirportFsCode !== destination || depMs !== scheduledMs
      || localDate(depMs, request.originTimeZone) !== request.departureDate) continue;
    matching.push(row);
  }
  if (!matching.length) return result('no_data');
  if (matching.length !== 1) return result('ambiguous');
  const row = matching[0];
  // Restrict optional fields before normalization: no context fallback or object coercion.
  const clean = { carrierFsCode: carrier, flightNumber, departureAirportFsCode: origin, arrivalAirportFsCode: destination,
    operationalTimes: {}, airportResources: {}, flightEquipment: {}, lastUpdatedDate: row.lastUpdatedDate };
  if (row.status !== undefined && !['A', 'C', 'D', 'L', 'NO', 'R', 'S', 'U'].includes(row.status)) return result('invalid_payload');
  clean.status = row.status;
  for (const name of ['scheduledGateDeparture', 'scheduledGateArrival', 'estimatedGateDeparture', 'estimatedGateArrival', 'actualGateDeparture', 'actualGateArrival']) {
    const time = row.operationalTimes?.[name];
    if (time === undefined) continue;
    if (!object(time) || instant(time.dateUtc) === null) return result('invalid_payload');
    clean.operationalTimes[name] = { dateUtc: time.dateUtc };
  }
  const scheduledArrivalMs = instant(clean.operationalTimes.scheduledGateArrival.dateUtc);
  const day = 24 * 60 * 60_000;
  for (const kind of ['estimated', 'actual']) {
    const dep = instant(clean.operationalTimes[`${kind}GateDeparture`]?.dateUtc);
    const arr = instant(clean.operationalTimes[`${kind}GateArrival`]?.dateUtc);
    if ((dep !== null && Math.abs(dep - scheduledMs) > day) || (arr !== null && Math.abs(arr - scheduledArrivalMs) > day)
      || (dep !== null && arr !== null && (arr <= dep || arr - dep > day))) return result('invalid_payload');
  }
  for (const [group, fields] of Object.entries({ airportResources: ['departureGate', 'departureTerminal', 'arrivalGate', 'arrivalTerminal', 'baggage'],
    flightEquipment: ['actualEquipmentIataCode', 'scheduledEquipmentIataCode', 'tailNumber'] })) {
    if (row[group] !== undefined && !object(row[group])) return result('invalid_payload');
    for (const name of fields) {
      const value = row[group]?.[name];
      if (value === undefined || value === null) continue;
      if (typeof value !== 'string' || value.length > 80 || /[\x00-\x1f\x7f]/.test(value)) return result('invalid_payload');
      clean[group][name] = value.trim();
    }
  }
  const candidate = normalizeCiriumFlightStatus(clean);
  const displayedDeparture = instant(candidate.departure);
  const displayedArrival = instant(candidate.arrival);
  if (displayedDeparture === null || displayedArrival === null || displayedArrival <= displayedDeparture
    || displayedArrival - displayedDeparture > day) return result('invalid_payload');
  // Identity helper expects local calendar/time; keep the same instant with canonical origin offset.
  candidate.scheduledDeparture = localStamp(scheduledMs, request.originTimeZone);
  candidate.carrier = carrier;
  candidate.flightNumber = flightNumber;
  candidate.departureDate = request.departureDate;
  // Provider observation time is never invented from retrieval time or wall clock.
  const updatedMs = instant(candidate.updatedAt);
  candidate.updatedAt = updatedMs === null ? '' : new Date(updatedMs).toISOString();
  candidate.message = 'Candidato Cirium validado offline; integração não ativada.';
  const provenance = buildRadarFieldProvenance([candidate]);
  // The shared local-minute key alone collides during DST folds and within a minute.
  // Preserve it for readability, then qualify this contract's identity by the exact instant.
  const occurrenceKey = `${radarOccurrenceKey(candidate)}|UTC:${new Date(scheduledMs).toISOString()}`;
  provenance.occurrenceKey = occurrenceKey;
  for (const field of Object.values(provenance.fields)) field.occurrenceKey = occurrenceKey;
  return result('available', { candidate, provenance, occurrenceKey });
}
