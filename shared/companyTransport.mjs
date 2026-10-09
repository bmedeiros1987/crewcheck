// Reference-only, caller-owned catalogue. Never fetch, persist or infer eligibility.
const text = value => typeof value === 'string' && value.trim().length > 0;
const date = value => { try { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value; } catch { return false; } };
const seconds = value => Number.isInteger(value) && value >= 0 && value < 172800;
function valid(reference) {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: reference.timeZone });
    return reference.schemaVersion === 1 && ['id', 'operator', 'direction'].every(key => text(reference[key]))
      && text(reference.timeZone) && text(reference.provenance?.label)
      && ['unknown', 'confirmed'].includes(reference.validity?.status)
      && (reference.validity.status === 'unknown' || (date(reference.validity.from) && date(reference.validity.until) && reference.validity.from <= reference.validity.until))
      && text(reference.eligibility?.description) && ['unknown', 'confirmed'].includes(reference.eligibility.status)
      && Array.isArray(reference.days) && reference.days.length > 0 && reference.days.every(day => Number.isInteger(day) && day >= 0 && day <= 6)
      && Array.isArray(reference.exceptions) && reference.exceptions.every(item => date(item.date) && typeof item.runs === 'boolean' && text(item.note))
      && new Set(reference.exceptions.map(item => item.date)).size === reference.exceptions.length
      && Array.isArray(reference.stops) && reference.stops.length >= 2 && reference.stops.every(stop => text(stop.id) && text(stop.label) && text(stop.boardingPoint))
      && new Set(reference.stops.map(stop => stop.id)).size === reference.stops.length
      && Array.isArray(reference.trips) && reference.trips.every(trip => Array.isArray(trip) && trip.length === reference.stops.length && trip.every((at, index) => seconds(at) && (!index || at >= trip[index - 1])));
  } catch { return false; }
}
export function companyTransportPresentation(catalogue = [], query = {}) {
  query = query ?? {};
  const result = { operational: 'unknown', recommendation: 'unconfirmed', leaveAt: null, travelMinutes: null,
    label: 'Transporte da empresa · a confirmar', references: [] };
  if (!Array.isArray(catalogue) || !date(query.serviceDate) || !text(query.referenceId) || !text(query.originStopId) || !text(query.destinationStopId)) return result;
  // Ambiguous identities are rejected; directions and boarding stops are explicit.
  const candidates = catalogue.filter(item => item?.id === query.referenceId);
  if (candidates.length !== 1 || !valid(candidates[0])) return result;
  const reference = candidates[0];
  const origin = reference.stops.findIndex(stop => stop.id === query.originStopId);
  const destination = reference.stops.findIndex(stop => stop.id === query.destinationStopId);
  if (origin < 0 || destination <= origin) return result;
  const weekday = new Date(query.serviceDate + 'T12:00:00Z').getUTCDay();
  const exception = reference.exceptions.find(item => item.date === query.serviceDate);
  const calendarRuns = exception ? exception.runs : reference.days.includes(weekday);
  const outsideValidity = reference.validity.status === 'confirmed' && (query.serviceDate < reference.validity.from || query.serviceDate > reference.validity.until);
  result.references = [{ ...reference, serviceDate: query.serviceDate, originStopId: query.originStopId, destinationStopId: query.destinationStopId,
    calendarRuns, outsideValidity, plannedTimes: calendarRuns && !outsideValidity ? reference.trips.map(trip => ({ boardAtSeconds: trip[origin], alightAtSeconds: trip[destination] })) : [],
    verificationRequired: true }];
  // A timetable cannot establish operation, a viable connection, or a home leg.
  return result;
}
