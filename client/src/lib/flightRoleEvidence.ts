import type { CrewRoster } from './pdfParser';

export const AIMS_FLIGHT_ROLE_SOURCE = 'aims-extra-following-v1';
export const TICKET_FLIGHT_ROLE_SOURCE = 'ticket-published-extra-v1';
const verifiedSources = new Set([AIMS_FLIGHT_ROLE_SOURCE, TICKET_FLIGHT_ROLE_SOURCE]);
const extraMarker = /\[extra\]/i;

/** Saved PS is a role, not proof that an old parser attached it correctly.
 * Never repair persisted roles from a flight number or day/payroll code. */
export function pendingFlightRoleDates(roster: CrewRoster): string[] {
  const flightDays = (roster.days || []).filter(day => day.legs?.length
    || (day.type === 'VOO' && typeof day.flyingHours === 'number'));
  const pending = flightDays.filter(day => {
    const hasExtra = extraMarker.test(day.rawText || '')
      || (day.legs || []).some(leg => String(leg.workType || '').trim().toUpperCase() === 'PS');
    return hasExtra && (!day.legs?.length || day.legs.some(leg => !verifiedSources.has(String(leg.workTypeSource || ''))));
  });
  // Old reconstruction could lose the marker and all PS roles in a day.
  // The full document can establish that extra exists, but not which old leg
  // is reliable. Only a fresh parse may attach provenance to those legs.
  if (extraMarker.test(roster.rawText || '') && !pending.length
    && flightDays.some(day => !day.legs?.length || day.legs.some(leg => !verifiedSources.has(String(leg.workTypeSource || ''))))) {
    return flightDays.filter(day => !day.legs?.length || day.legs.some(leg => !verifiedSources.has(String(leg.workTypeSource || '')))).map(day => day.date);
  }
  return pending.map(day => day.date);
}

export const FLIGHT_ROLE_PENDING_MESSAGE = 'Origem da classificação de extra pendente. Reimporte a escala original para verificar OP/PS; o acumulado de voo operado não está confirmado.';
