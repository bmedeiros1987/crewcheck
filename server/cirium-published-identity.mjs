import { evaluateCiriumRadar, validCiriumRadarIdentity } from './cirium-radar-provider.mjs';
import { buildRadarFieldProvenance } from './radar-field-provenance.mjs';

const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const fsCode = x => typeof x === 'string' && /^[A-Z0-9]{2,3}$/.test(x);
const number = x => typeof x === 'string' && /^[0-9]{1,4}[A-Z]?$/.test(x);
const result = state => ({ state, ok: false, candidate: null, provenance: null });
const transportStates = new Set(['not_configured', 'timeout', 'rate_limited', 'provider_error']);
const relationships = new Set(['L', 'Z', 'S', 'X', 'C']);

// Published IATA is not operating FS. Bind them only with this response's
// unambiguous appendix and exact row relationship, never a local airline alias.
export function evaluatePublishedCiriumRadar(request, response, options = {}) {
  if (options.enabled !== true) return result('disabled');
  if (!validCiriumRadarIdentity(request, 'IATA')) return result('invalid_request');
  if (!object(response)) return result('invalid_payload');
  if (transportStates.has(response.state)) return result(response.state);
  if (response.state !== 'available' || !Array.isArray(response.rows) || response.rows.length > 100) return result('invalid_payload');
  if (!response.rows.length) return result('no_data');
  const airlines = response.appendix?.airlines;
  if (!Array.isArray(airlines) || !airlines.length || airlines.length > 100
    || airlines.some(x => !object(x) || !fsCode(x.fs) || (x.iata != null && (typeof x.iata !== 'string' || !/^[A-Z0-9]{2}$/.test(x.iata))))) return result('invalid_payload');
  const marketing = airlines.filter(x => x.iata === request.carrierIataCode);
  if (marketing.length > 1) return result('ambiguous');
  if (marketing.length !== 1) return result('no_data');
  const marketingFs = marketing[0].fs;
  if (airlines.filter(x => x.fs === marketingFs).length !== 1) return result('ambiguous');

  const matching = [];
  for (const row of response.rows) {
    if (!object(row) || !fsCode(row.carrierFsCode) || !number(row.flightNumber)) return result('invalid_payload');
    // An optional competing operating identity cannot silently replace the row identity.
    if (row.operatingCarrierFsCode !== undefined && row.operatingCarrierFsCode !== row.carrierFsCode) return result('ambiguous');
    const operatingRefs = airlines.filter(x => x.fs === row.carrierFsCode);
    if (operatingRefs.length !== 1) return result(operatingRefs.length ? 'ambiguous' : 'invalid_payload');
    const physical = { ...request, carrierNamespace: 'FS', carrierFsCode: row.carrierFsCode, flightNumber: row.flightNumber };
    delete physical.carrierIataCode;
    const evaluated = evaluateCiriumRadar(physical, { state: 'available', rows: [row] }, { enabled: true });
    if (evaluated.state === 'invalid_payload') return result('invalid_payload');
    if (!evaluated.ok) continue;
    const direct = row.carrierFsCode === marketingFs && row.flightNumber === request.flightNumber;
    const shares = row.codeshares === undefined ? [] : row.codeshares;
    if (!Array.isArray(shares) || shares.length > 100 || shares.some(x => !object(x) || !fsCode(x.fsCode)
      || (x.flightNumber != null && !number(x.flightNumber)) || (x.relationship != null && !relationships.has(x.relationship))
      || (x.relationship === 'C' && x.fsCode !== row.carrierFsCode))) return result('invalid_payload');
    const links = shares.filter(x => x.fsCode === marketingFs && x.flightNumber === request.flightNumber);
    if (links.length > 1) return result('ambiguous');
    if (!direct && (links.length !== 1 || !relationships.has(links[0].relationship))) continue;
    matching.push({ evaluated, row, relationship: direct ? 'direct' : links[0].relationship });
  }
  if (!matching.length) return result('no_data');
  if (matching.length !== 1) return result('ambiguous');
  const { evaluated, row, relationship } = matching[0];
  const publishedIdentity = Object.fromEntries(['carrierNamespace', 'carrierIataCode', 'flightNumber', 'origin', 'destination',
    'departureDate', 'originTimeZone', 'scheduledDepartureUtc'].map(k => [k, request[k]]));
  publishedIdentity.scheduledDepartureUtc = new Date(request.scheduledDepartureUtc).toISOString();
  const operatingIdentity = { ...publishedIdentity, carrierNamespace: 'FS', carrierFsCode: row.carrierFsCode, flightNumber: row.flightNumber };
  delete operatingIdentity.carrierIataCode;
  const identityBinding = { source: 'cirium-sky.response', marketingCarrierFsCode: marketingFs,
    relationship, appendixPath: 'appendix.airlines', relationshipPath: relationship === 'direct' ? 'flightStatuses.carrierFsCode/flightNumber' : 'flightStatuses.codeshares',
    publishedIdentity, operatingIdentity };
  const candidate = { ...evaluated.candidate, carrier: request.carrierIataCode, carrierNamespace: 'IATA', flightNumber: request.flightNumber,
    flight: `${request.carrierIataCode}${request.flightNumber}`, publishedIdentity, operatingIdentity, identityBinding,
    operatingOccurrenceKey: evaluated.occurrenceKey };
  const occurrenceKey = `${evaluated.occurrenceKey}|MARKETING:IATA:${candidate.flight}`;
  const provenance = buildRadarFieldProvenance([candidate]);
  provenance.occurrenceKey = occurrenceKey; provenance.identityBinding = identityBinding;
  for (const field of Object.values(provenance.fields)) field.occurrenceKey = occurrenceKey;
  return { state: 'available', ok: true, candidate, provenance, occurrenceKey };
}
