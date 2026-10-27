import { radarFlightId, radarResultDecision } from '../shared/gate-query-day.mjs';

// Cirium FlightStats Flex Flight Status (Commercial Plan) as the Radar primary.
// Sky/Premium APIs need the Contract Plan and stay OFF. One origin-scoped call for
// the published occurrence; the row is accepted only when it is that exact
// occurrence. Flex has no per-gate observation instant: receipt is recorded as
// receipt, never as a gate update.
const FLEX_STATUS_URL = 'https://api.flightstats.com/flex/flightstatus/rest/v2/json/flight/status';
const STATUS = { S: 'Programado', A: 'Em voo', L: 'Pousou', C: 'Cancelado', D: 'Alternado', R: 'Redirecionado' };
const text = value => typeof value === 'string' ? value.trim() : '';
// The named dateUtc field is UTC even when the zone suffix is omitted.
const utc = value => { const raw = text(value?.dateUtc); return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw) ? raw + 'Z' : raw; };

export function ciriumFlexStatusUrl(identity, credentials) {
  const flight = radarFlightId(identity?.flight).match(/^([A-Z0-9]{2})(\d{1,4})$/);
  const date = text(identity?.departureDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!flight || !date || !/^[A-Z]{3}$/.test(text(identity?.origin)) || !text(credentials?.appId) || !text(credentials?.appKey)) return null;
  const url = new URL(`${FLEX_STATUS_URL}/${flight[1]}/${flight[2]}/dep/${date[1]}/${date[2]}/${date[3]}`);
  // Published rosters carry IATA flight numbers; the response appendix binds FS codes back.
  url.searchParams.set('codeType', 'IATA');
  url.searchParams.set('airport', identity.origin);
  url.searchParams.set('appId', credentials.appId);
  url.searchParams.set('appKey', credentials.appKey);
  return url;
}

export function normalizeCiriumFlexRow(row = {}, appendix = {}) {
  const airline = (Array.isArray(appendix.airlines) ? appendix.airlines : []).find(item => item?.fs === row.carrierFsCode);
  const times = row.operationalTimes || {}, resources = row.airportResources || {}, equipment = row.flightEquipment || {};
  return {
    ok: true, configured: true, provider: 'cirium-flex',
    flight: `${text(airline?.iata) || text(row.carrierFsCode)}${text(String(row.flightNumber ?? ''))}`,
    origin: text(row.departureAirportFsCode), destination: text(row.arrivalAirportFsCode),
    scheduledDepartureUtc: utc(times.scheduledGateDeparture) || utc(times.publishedDeparture) || utc(row.departureDate),
    status: STATUS[row.status] || 'Monitorando',
    gate: text(resources.departureGate), terminal: text(resources.departureTerminal),
    departure: text(times.actualGateDeparture?.dateLocal) || text(times.estimatedGateDeparture?.dateLocal) || text(times.scheduledGateDeparture?.dateLocal),
    arrival: text(times.actualGateArrival?.dateLocal) || text(times.estimatedGateArrival?.dateLocal) || text(times.scheduledGateArrival?.dateLocal),
    aircraft: text(equipment.actualEquipmentIataCode) || text(equipment.scheduledEquipmentIataCode),
    registration: text(equipment.tailNumber), cancelled: row.status === 'C',
  };
}

/** Exactly one row of the published occurrence, or null (no data, other day/route, ambiguity). */
export function selectCiriumFlexOccurrence(payload, identity, now) {
  const rows = Array.isArray(payload?.flightStatuses) ? payload.flightStatuses : [];
  const matches = rows.map(row => normalizeCiriumFlexRow(row, payload?.appendix)).filter(item => radarResultDecision(item, identity, now).allowed);
  return matches.length === 1 ? matches[0] : null;
}

export async function fetchCiriumFlexOccurrence({ identity, credentials, fetchImpl = globalThis.fetch, timeoutMs = 4000, now = Date.now } = {}) {
  const url = ciriumFlexStatusUrl(identity, credentials);
  if (!url || typeof fetchImpl !== 'function') return { ok: false, configured: false, provider: 'cirium-flex', providerState: 'not_configured' };
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: 'GET', headers: { accept: 'application/json' }, redirect: 'error', signal: controller.signal });
    if (response.status === 429) return { ok: false, configured: true, provider: 'cirium-flex', providerState: 'rate_limited', httpStatus: 429 };
    if (!response.ok) return { ok: false, configured: true, provider: 'cirium-flex', providerState: 'provider_error', httpStatus: response.status };
    const payload = await response.json();
    const receivedAt = now(), row = selectCiriumFlexOccurrence(payload, identity, receivedAt);
    if (!row) return { ok: false, configured: true, provider: 'cirium-flex', providerState: 'not_found', message: 'Voo não localizado na fonte operacional.' };
    const fields = Object.fromEntries([['departureGate', row.gate], ['departureTerminal', row.terminal], ['status', row.status]].filter(([, value]) => value)
      .map(([field, value]) => [field, { value, provider: 'cirium-flex', observedAt: null, receivedAt: new Date(receivedAt).toISOString(), coverageState: 'provided_no_source_freshness' }]));
    return { ...row, sourceReceivedAt: receivedAt, gateUpdate: null, provenance: { occurrenceKey: '', matchedProviders: ['cirium-flex'], fields } };
  } catch {
    return { ok: false, configured: true, provider: 'cirium-flex', providerState: controller.signal.aborted ? 'timeout' : 'provider_error' };
  } finally {
    clearTimeout(timer);
  }
}
