import { radarFlightId, radarSourceEpoch } from '../shared/gate-query-day.mjs';

// Select only the exact authorized occurrence; array order is not identity.
// https://doc.aerodatabox.com/docs/openapi-rapidapi-v1.json
const airport = value => typeof value === 'string' ? value.trim().toUpperCase() : '';
const scheduled = row => radarSourceEpoch(row?.departure?.scheduledTime?.utc);
function matches(row, occurrence) {
  return row && occurrence && /^[A-Z0-9]{2,3}\d{1,5}[A-Z]?$/.test(radarFlightId(occurrence.flight))
    && /^[A-Z]{3}$/.test(airport(occurrence.origin)) && /^[A-Z]{3}$/.test(airport(occurrence.destination))
    && radarFlightId(row.number) === radarFlightId(occurrence.flight)
    && airport(row.departure?.airport?.iata) === airport(occurrence.origin)
    && airport(row.arrival?.airport?.iata) === airport(occurrence.destination)
    && Number.isFinite(scheduled(row)) && scheduled(row) === radarSourceEpoch(occurrence.scheduledDepartureUtc);
}
export function selectAeroDataBoxOccurrence(payload, occurrence) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [payload];
  const matching = rows.filter(row => matches(row, occurrence));
  // Ambiguous rows are not ranked by proximity or array order.
  return matching.length === 1 ? matching[0] : null;
}
