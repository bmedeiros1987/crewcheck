// Disconnected, process-local policy. No requests, timers, storage or queue writes.
// Callers supply integer epoch-ms instants, published clock proof and a fresh now.
import { evaluateWeatherObservation, weatherFlightWindow } from '../server/weather/critical-observation.mjs';

export const WEATHER_PULSE_SCOPE = 'weather:operational:v1';
export const WEATHER_PULSE_REQUEST_INTERVAL_MS = 60 * 60_000;
export const WEATHER_PULSE_STATION_LIMIT = 2;

const validNow = value => Number.isSafeInteger(value) && Math.abs(value) <= 8.64e15;
const text = value => typeof value === 'string' ? value.trim() : '';
const key = parts => JSON.stringify(parts);
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const earliest = values => values.reduce((minimum, value) => minimum === null || value < minimum ? value : minimum, null);
const station = value => /^[A-Z]{4}$/.test(text(value).toUpperCase()) ? text(value).toUpperCase() : '';
const isoWithZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function absoluteInstant(value) {
  if (validNow(value)) return value;
  if (typeof value !== 'string' || !isoWithZone.test(value)) return NaN;
  const parsed = Date.parse(value);
  // Date.parse normalizes e.g. February 31; it is not canonical clock proof.
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return validNow(parsed) && day >= 1 && day <= days[month - 1] ? parsed : NaN;
}

function publishedClock(value) {
  // Same accepted clock notation as #1031, including 24:00 and both +1 forms.
  const match = text(value).match(/^(\d{1,2})[:hH](\d{2})(?:\s*(?:\+1|\(\+1\)))?$/);
  return Boolean(match && ((Number(match[1]) < 24 && Number(match[2]) < 60) || (Number(match[1]) === 24 && Number(match[2]) === 0)));
}

function normalizeContext(context) {
  const ownerId = text(context?.ownerId), sourceId = text(context?.sourceId), sourceRevision = text(context?.sourceRevision);
  if (!ownerId || !sourceId || !sourceRevision || !Array.isArray(context?.flights)) return null;
  const flights = new Map(), rejected = new Set();
  for (const input of context.flights) {
    const id = text(input?.id), journeyId = text(input?.journeyId);
    const departure = absoluteInstant(input?.departure), arrival = absoluteInstant(input?.arrival);
    const origin = station(input?.origin), destination = station(input?.destination);
    if (!id) continue;
    if (input?.kind !== 'flight' || input?.placeholder === true || !journeyId || !validNow(departure) || !validNow(arrival) || arrival <= departure
      || !origin || !destination || !publishedClock(input?.departureClock) || !publishedClock(input?.arrivalClock)) {
      rejected.add(id); continue;
    }
    const flight = { id, journeyId, departure, arrival, origin, destination, departureClock: text(input.departureClock), arrivalClock: text(input.arrivalClock) };
    const prior = flights.get(id);
    if (prior && key(prior) !== key(flight)) rejected.add(id);
    else flights.set(id, flight);
  }
  for (const id of rejected) flights.delete(id);
  const normalized = [...flights.values()].sort((a, b) => compareText(a.id, b.id));
  return { ownerId, sourceId, sourceRevision, flights: normalized, contextKey: key([ownerId, sourceId, sourceRevision, normalized, [...rejected].sort(compareText)]) };
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function select(context, now) {
  if (!context || !validNow(now)) return { bindings: [], nextSelectionAt: null };
  const candidates = [], boundaries = [];
  for (const flight of context.flights) {
    // Inclusive active interval changes phase just AFTER arrival, not at midnight.
    boundaries.push(flight.departure, flight.arrival + 1);
    for (const role of ['origin', 'destination']) {
      const flightWindow = weatherFlightWindow({ ...flight, role, now });
      boundaries.push(flightWindow.opensAt, flightWindow.closesAt + 1);
      if (!flightWindow.eligible) continue;
      // Complete phase table: recent destination, active, future, short origin tail.
      const phase = role === 'destination' && now > flight.arrival ? 0
        : now >= flight.departure && now <= flight.arrival ? 1
          : now < flight.departure ? 2 : 3;
      const airport = flight[role];
      const bindingKey = key([context.ownerId, context.sourceId, context.sourceRevision, flight.id, flight.journeyId, flight.departure, flight.arrival, role, airport]);
      candidates.push({ flightId: flight.id, journeyId: flight.journeyId, departure: flight.departure, arrival: flight.arrival, station: airport, role, phase, opensAt: flightWindow.opensAt, closesAt: flightWindow.closesAt, bindingKey });
    }
  }
  candidates.sort((a, b) => a.phase - b.phase || a.closesAt - b.closesAt || a.departure - b.departure || a.arrival - b.arrival
    || compareText(a.flightId, b.flightId) || compareText(a.role, b.role) || compareText(a.station, b.station));
  const seen = new Set(), bindings = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.station)) continue;
    seen.add(candidate.station); bindings.push(candidate);
    if (bindings.length === WEATHER_PULSE_STATION_LIMIT) break;
  }
  const future = boundaries.filter(value => validNow(value) && value > now);
  return { bindings, nextSelectionAt: earliest(future) };
}

export function selectWeatherPulseBindings(context, now) {
  const normalized = normalizeContext(context), selection = select(normalized, now);
  return freeze({ contextKey: normalized?.contextKey ?? null, ...selection });
}

export function createWeatherPulseState() {
  return freeze({ version: 1, epoch: 0, contextKey: null, lastNow: null, lastAttemptAt: null, nextTicketId: 1,
    pending: null, selected: [], observations: [], activeIntents: [], clockBlocked: false });
}

const selectionKey = bindings => key(bindings.map(binding => binding.bindingKey));
const revoke = pending => pending ? { ticket: pending.ticket, revoked: true } : null;

function refresh(previous, input, now) {
  if (previous?.version !== 1) throw new TypeError('Use createWeatherPulseState() for this process-local controller');
  const context = normalizeContext(input);
  const state = { ...previous, selected: [], activeIntents: [] };
  if (state.contextKey !== (context?.contextKey ?? null)) {
    state.epoch += 1; state.contextKey = context?.contextKey ?? null;
    state.observations = []; state.pending = revoke(state.pending);
  }
  const rollback = validNow(now) && validNow(previous.lastNow) && now < previous.lastNow;
  if (!validNow(now) || rollback) {
    // Never resurrect old observations or invent elapsed quota after a clock step.
    if (!previous.clockBlocked) state.epoch += 1;
    state.clockBlocked = true; state.observations = []; state.pending = revoke(state.pending);
    return { state, context, nextSelectionAt: rollback ? previous.lastNow : null, reason: rollback ? 'clock_rollback' : 'invalid_now' };
  }
  state.lastNow = now; state.clockBlocked = false;
  const selection = select(context, now);
  state.selected = selection.bindings;
  if (state.pending && selectionKey(state.pending.ticket.bindings) !== selectionKey(state.selected)) state.pending = revoke(state.pending);
  const selectedStations = new Set(state.selected.map(binding => binding.station));
  // At most two observations; no persistent or cross-owner/source station cache.
  state.observations = state.observations.filter(observation => selectedStations.has(observation.station)
    && observation.observedAt <= now && now <= observation.expiresAt);
  return { state, context, nextSelectionAt: selection.nextSelectionAt, reason: context ? 'waiting' : 'invalid_context' };
}

function finish(refreshed, now, request = null) {
  const { state, context, nextSelectionAt, reason } = refreshed;
  if (!state.clockBlocked && context) {
    state.activeIntents = state.selected.flatMap(binding => {
      const observation = state.observations.find(item => item.station === binding.station);
      if (!observation || observation.severity < 2) return [];
      const materialKey = key([binding.bindingKey, observation.provider, observation.observedAt, observation.raw, observation.severity]);
      return [{ scope: WEATHER_PULSE_SCOPE, ownerId: context.ownerId, sourceId: context.sourceId, sourceRevision: context.sourceRevision,
        bindingKey: binding.bindingKey, materialKey, flightId: binding.flightId, journeyId: binding.journeyId, station: binding.station, role: binding.role,
        observedAt: observation.observedAt, expiresAt: Math.min(binding.closesAt, observation.expiresAt), severity: observation.severity,
        report: { ok: true, official: true, provider: observation.provider, station: observation.station, observedAt: new Date(observation.observedAt).toISOString(), raw: observation.raw } }];
    });
  }
  const boundaries = [nextSelectionAt, ...state.observations.map(observation => observation.expiresAt + 1)];
  if (!state.clockBlocked && !state.pending && state.selected.length && validNow(state.lastAttemptAt)) boundaries.push(state.lastAttemptAt + WEATHER_PULSE_REQUEST_INTERVAL_MS);
  const future = validNow(now) ? boundaries.filter(value => validNow(value) && value > now) : [];
  const nextWakeAt = earliest(future);
  return freeze({ state, request, activeIntents: state.activeIntents, nextWakeAt, reason: request ? 'request' : reason });
}

export function advanceWeatherPulse(previous, context, now) {
  const refreshed = refresh(previous, context, now), { state } = refreshed;
  let request = null;
  if (!state.clockBlocked && state.selected.length && !state.pending && Number.isSafeInteger(state.nextTicketId)
    && (state.lastAttemptAt === null || now - state.lastAttemptAt >= WEATHER_PULSE_REQUEST_INTERVAL_MS)) {
    request = { id: state.nextTicketId, epoch: state.epoch, contextKey: state.contextKey, issuedAt: now,
      stations: state.selected.map(binding => binding.station), bindings: state.selected.map(binding => ({ ...binding })) };
    state.nextTicketId += 1; state.lastAttemptAt = now; state.pending = { ticket: request, revoked: false };
  }
  return finish(refreshed, now, request);
}

function explicitObservationTime(value) {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value))) {
    const numeric = Number(value), milliseconds = numeric < 100_000_000_000 ? numeric * 1000 : numeric;
    return numeric > 0 && validNow(milliseconds);
  }
  return typeof value === 'string' && isoWithZone.test(value) && validNow(absoluteInstant(value));
}

// Pass the ORIGINAL request object back: tickets are opaque in-memory identities.
// Terminal means success, failure or acknowledged abort, never just abort requested.
// This method cannot issue another ticket. Call advance after terminal settlement
// to discover a quota-eligible request; do not schedule zero-delay wake loops.
export function settleWeatherPulse(previous, context, ticket, outcome, reports, now) {
  const refreshed = refresh(previous, context, now), { state } = refreshed;
  if (!state.pending || state.pending.ticket !== ticket || !['success', 'failure', 'aborted-ack'].includes(outcome)) return finish(refreshed, now);
  const admitted = !state.pending.revoked && !state.clockBlocked && ticket.epoch === state.epoch && ticket.contextKey === state.contextKey;
  state.pending = null; // Only this ticket's terminal acknowledgement releases its slot.
  if (outcome === 'success' && admitted && Array.isArray(reports)) {
    for (const binding of state.selected) {
      const entries = reports.filter(entry => entry?.report?.station === binding.station);
      if (entries.length !== 1) continue; // Ambiguous duplicate reports never depend on order.
      const { report, severity } = entries[0];
      if (!Number.isInteger(severity) || severity < 0 || severity > 3 || !explicitObservationTime(report?.observedAt)) continue;
      const observation = evaluateWeatherObservation({ report, station: binding.station, now });
      if (!observation.accepted) continue;
      const observedAt = Date.parse(observation.observedAt), old = state.observations.find(item => item.station === binding.station);
      if (old && observedAt < old.observedAt) continue;
      const value = { station: binding.station, provider: report.provider, raw: String(report.raw).trim().toUpperCase().replace(/\s+/g, ' '),
        observedAt, expiresAt: observation.expiresAt, severity };
      state.observations = [...state.observations.filter(item => item.station !== binding.station), value];
    }
  }
  return finish(refreshed, now);
}
