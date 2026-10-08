// Pure evidence policy. No network, inferred timetable, or provider-specific coverage.
const instant = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
const dateOrdinal = date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return NaN;
  const value = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(value) && new Date(value).toISOString().slice(0, 10) === date ? value / 86400000 : NaN;
};
export function transitServiceSeconds(at, serviceDate, timeZone) {
  const stamp = instant(at), day = dateOrdinal(serviceDate);
  if (!Number.isFinite(stamp) || !Number.isFinite(day) || !timeZone) return null;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    const civilStamp = value => {
      const parts = Object.fromEntries(formatter.formatToParts(value).map(part => [part.type, part.value]));
      return dateOrdinal(`${parts.year}-${parts.month}-${parts.day}`) * 86400000
        + Number(parts.hour) * 3600000 + Number(parts.minute) * 60000 + Number(parts.second) * 1000;
    };
    // GTFS time is elapsed from local noon minus 12h, including DST transitions.
    const desiredNoon = day * 86400000 + 12 * 3600000;
    let noon = desiredNoon;
    for (let attempt = 0; attempt < 4; attempt++) noon += desiredNoon - civilStamp(noon);
    if (civilStamp(noon) !== desiredNoon) return null;
    return (stamp - (noon - 12 * 3600000)) / 1000;
  } catch { return null; }
}
const id = value => typeof value === 'string' && value.length > 0 && value.trim() === value;
function validScope(scope) {
  return Boolean(scope && id(scope.lineId) && (scope.kind === 'line' && !Object.hasOwn(scope, 'stationId')
    || scope.kind === 'station' && id(scope.stationId)));
}
function stations(leg) { return [leg.originStationId, ...leg.intermediateStationIds, leg.destinationStationId]; }
function coversStation(evidence, leg, stationId) {
  return evidence.coverage.some(scope => scope.lineId === leg.lineId && (scope.kind === 'line' || scope.stationId === stationId));
}
function coversAny(evidence, leg) { return stations(leg).some(station => coversStation(evidence, leg, station)); }
function validSource(source) {
  if (!id(source?.name) || !id(source?.url)) return false;
  try { const url = new URL(source.url); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
function validEvidence(evidence, now) {
  const fetched = instant(evidence?.fetchedAt), updated = instant(evidence?.sourceUpdatedAt);
  return Boolean(validSource(evidence?.source) && Array.isArray(evidence?.coverage) && evidence.coverage.length > 0 && evidence.coverage.every(validScope) && ['last-change', 'refresh'].includes(evidence.sourceTimestampKind)
    && Number.isFinite(updated) && Number.isFinite(fetched) && updated <= fetched && fetched <= now
    && instant(evidence.validUntil) > instant(evidence.validFrom)
    && Number.isFinite(evidence.maxAgeSeconds) && evidence.maxAgeSeconds > 0 && now - fetched <= evidence.maxAgeSeconds * 1000
    && (evidence.sourceTimestampKind === 'last-change' || now - updated <= evidence.maxAgeSeconds * 1000));
}
function contains(evidence, from, to) {
  return instant(evidence.validFrom) <= from && instant(evidence.validUntil) >= to;
}
function overlaps(evidence, from, to) {
  return instant(evidence.validFrom) <= to && instant(evidence.validUntil) > from;
}
function scheduleForStation(leg, station, evidence, now, timeZone) {
  if (!validEvidence(evidence, now) || !coversStation(evidence, leg, station) || evidence.timeZone !== timeZone
    || evidence.serviceDate !== leg.serviceDate || evidence.calendarConfirmed !== true
    || !contains(evidence, instant(leg.boardAt), instant(leg.alightAt))) return 'unknown';
  if (evidence.serviceRuns === false) return 'unavailable';
  if (evidence.serviceRuns !== true || !Array.isArray(evidence.windows) || !evidence.windows.length) return 'unknown';
  const board = transitServiceSeconds(leg.boardAt, leg.serviceDate, timeZone), alight = transitServiceSeconds(leg.alightAt, leg.serviceDate, timeZone);
  const windows = evidence.windows.filter(w => w && [w.opensAtSeconds, w.closesAtSeconds, w.lastBoardAtSeconds].every(Number.isFinite)
    && w.opensAtSeconds >= 0 && w.closesAtSeconds > w.opensAtSeconds && w.lastBoardAtSeconds >= w.opensAtSeconds && w.lastBoardAtSeconds < w.closesAtSeconds);
  if (windows.length !== evidence.windows.length || board === null || alight === null || board < 0 || alight < board) return 'unknown';
  // End is exclusive; boarding cutoff can be inclusive. Arrival must precede closure.
  return windows.some(w => board >= w.opensAtSeconds && board <= w.lastBoardAtSeconds && alight < w.closesAtSeconds) ? 'available' : 'unavailable';
}
export function evaluateTransitAvailability(input = {}) {
  input = input || {};
  const now = instant(input.now), departure = instant(input.departureAt);
  const legs = Array.isArray(input.legs) ? input.legs : [];
  const validTrip = Number.isFinite(now) && Number.isFinite(departure) && legs.length > 0 && legs.every((leg, index) => {
    if (!leg) return false;
    const board = instant(leg.boardAt), alight = instant(leg.alightAt);
    return Boolean(id(leg.lineId) && id(leg.originStationId) && id(leg.destinationStationId) && leg.stationCoverageComplete === true
      && Array.isArray(leg.intermediateStationIds) && leg.intermediateStationIds.every(id) && Number.isFinite(dateOrdinal(leg.serviceDate)) && board >= departure && alight >= board
      && (index === 0 || board >= instant(legs[index - 1].alightAt)) && transitServiceSeconds(leg.boardAt, leg.serviceDate, input.timeZone) !== null);
  });
  let schedule = 'unknown', operational = 'unknown';
  const scheduleEvidence = Array.isArray(input.schedules) ? input.schedules : [], operationEvidence = Array.isArray(input.operations) ? input.operations : [];
  if (validTrip) {
    const schedules = legs.map(leg => {
      const states = stations(leg).map(station => {
        const candidates = scheduleEvidence.map(e => scheduleForStation(leg, station, e, now, input.timeZone));
        return candidates.includes('unavailable') ? 'unavailable' : candidates.includes('available') ? 'available' : 'unknown';
      });
      return states.includes('unavailable') ? 'unavailable' : states.every(state => state === 'available') ? 'available' : 'unknown';
    });
    schedule = schedules.includes('unavailable') ? 'unavailable' : schedules.every(s => s === 'available') ? 'available' : 'unknown';
    const states = legs.map(leg => {
      const from = instant(leg.boardAt), to = instant(leg.alightAt);
      const applicable = operationEvidence.filter(e => validEvidence(e, now) && coversAny(e, leg) && e.timeZone === input.timeZone && overlaps(e, from, to));
      if (applicable.some(e => e.state === 'suspended')) return 'suspended';
      if (applicable.some(e => e.state === 'disrupted')) return 'disrupted';
      // A current normal observation never confirms an upcoming trip.
      return departure <= now && from <= now && stations(leg).every(station => applicable.some(e => e.state === 'normal' && coversStation(e, leg, station) && contains(e, from, to))) ? 'normal' : 'unknown';
    });
    operational = states.includes('suspended') ? 'suspended' : states.includes('disrupted') ? 'disrupted' : states.every(s => s === 'normal') ? 'normal' : 'unknown';
  }
  const blocked = schedule === 'unavailable' || operational === 'suspended';
  return { schedule, operational, recommendation: blocked ? 'blocked' : operational === 'disrupted' ? 'alternative-required' : schedule === 'available' && operational === 'normal' ? 'confirmed' : 'unconfirmed',
    label: blocked ? 'Transporte indisponível para este trajeto' : operational === 'disrupted' ? 'Interrupção no trajeto · confira uma alternativa' : schedule === 'available' && operational === 'normal' ? 'Funcionamento confirmado para o período consultado' : 'Funcionamento não confirmado',
    departureAt: input.departureAt || null, timeZone: input.timeZone || null,
    evidence: [...scheduleEvidence, ...operationEvidence].filter(e => validEvidence(e, now)).map(e => ({ source: e.source, sourceUpdatedAt: e.sourceUpdatedAt, fetchedAt: e.fetchedAt, sourceTimestampKind: e.sourceTimestampKind, validFrom: e.validFrom, validUntil: e.validUntil, coverage: e.coverage })) };
}

// Shared presentation decision for itinerary, hero, estimate and consumers.
export function transitDeparturePresentation(mode, input = {}) {
  if (typeof mode !== 'string' || !mode.includes('transit')) return null;
  const availability = evaluateTransitAvailability(input);
  return { availability, showDepartureTime: availability.recommendation === 'confirmed',
    statusLabel: availability.recommendation === 'blocked' ? 'TRANSPORTE INDISPONÍVEL' : availability.recommendation === 'alternative-required' ? 'ALTERNATIVA NECESSÁRIA' : availability.recommendation === 'confirmed' ? 'FUNCIONAMENTO CONFIRMADO' : 'FUNCIONAMENTO NÃO CONFIRMADO',
    whenLabel: availability.recommendation === 'confirmed' ? 'Sair em' : 'Horário a confirmar' };
}
