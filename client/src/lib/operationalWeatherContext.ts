import { alertAccount } from './alertReviewStore';
import { alertRosterOwned } from './alertRosterOwnership';
import { captureAutomaticRosterGuard, startupIntentRevision, startupKey } from './rosterStartup';
import type { WeatherPulseContext } from '../../../shared/operational-weather-pulse.mjs';

export type WeatherEventInput = {
  id: string; kind: string; placeholder?: boolean; origin: string; destination: string; flightNumber: string;
  canonical?: { kind?: string; journeyId?: string; startDateTime?: string; endDateTime?: string;
    leg?: { departureTime?: string; arrivalTime?: string } };
};
export type WeatherFlightPresentation = Readonly<{
  id: string; journeyId: string; flightNumber: string; origin: string; destination: string;
  originIcao: string; destinationIcao: string; departure: number; arrival: number;
}>;
export type OperationalWeatherSnapshot = Readonly<{
  context: WeatherPulseContext;
  flights: Readonly<Record<string, WeatherFlightPresentation>>;
}>;
export type WeatherContextReader = () => OperationalWeatherSnapshot | null;

/** Capture the existing read-only selection fence. Never restore/select a roster.
 * The new context revision is exact serialization; existing ownership helper
 * digest semantics are deliberately unchanged. Owner is Pulse's digest. */
export function createOperationalWeatherContextReader(
  roster: { year?: number; month?: number; days?: unknown[] }, source: string,
  events: readonly WeatherEventInput[], mapAirport: (code: string) => string,
  enabled: () => boolean,
): WeatherContextReader {
  const owner = alertAccount(), guard = captureAutomaticRosterGuard(), revision = startupIntentRevision();
  let choice: string | null = null, selectedSource: unknown = null;
  try {
    choice = localStorage.getItem(startupKey());
    const selected = JSON.parse(choice || 'null');
    // saveRoster writes sourceFileName; loadRoster also understands explicit
    // legacy source. Session fallback cannot prove the selected source here.
    const primary = selected?.sourceFileName;
    selectedSource = primary === undefined || primary === '' ? selected?.source : typeof primary === 'string' ? primary : null;
  } catch { /* Strict getter below fails closed. */ }
  const flights: Record<string, WeatherFlightPresentation> = Object.create(null);
  const projection = events.map(event => {
    const canonical = event.canonical;
    const origin = mapAirport(event.origin), destination = mapAirport(event.destination);
    if (event.kind !== 'flight' || canonical?.kind !== 'flight' || event.placeholder) return null;
    const flight = Object.freeze({ id: event.id, journeyId: canonical.journeyId || '', flightNumber: event.flightNumber || '',
      origin: event.origin.trim().toUpperCase(), destination: event.destination.trim().toUpperCase(), originIcao: origin, destinationIcao: destination,
      departure: Date.parse(canonical.startDateTime || ''), arrival: Date.parse(canonical.endDateTime || '') });
    flights[event.id] = flight;
    return Object.freeze({ id: event.id, journeyId: flight.journeyId, kind: 'flight' as const,
      departure: canonical.startDateTime || '', arrival: canonical.endDateTime || '',
      departureClock: canonical.leg?.departureTime || '', arrivalClock: canonical.leg?.arrivalTime || '', origin, destination });
  }).filter((flight): flight is NonNullable<typeof flight> => flight !== null);
  const snapshot: OperationalWeatherSnapshot = Object.freeze({
    context: Object.freeze({ ownerId: owner || '', sourceId: JSON.stringify([source, roster.year, roster.month]),
      sourceRevision: JSON.stringify([revision, roster, projection]), flights: Object.freeze(projection) }),
    flights: Object.freeze(flights),
  });
  return () => {
    try {
      return owner && choice && typeof selectedSource === 'string' && selectedSource.trim().length > 0 && selectedSource === source && choice === localStorage.getItem(startupKey()) && owner === alertAccount() && enabled()
        && revision === startupIntentRevision() && guard() && alertRosterOwned(roster) ? snapshot : null;
    } catch { return null; }
  };
}

/** Only completed authority changes may rebuild a captured read fence. An
 * intent-epoch storage event alone must not resume an in-progress selection. */
export function weatherContextRefreshEvent(event: Event): boolean {
  if (event.type !== 'storage') return true;
  const key = (event as StorageEvent).key;
  try { return key === null || key === startupKey() || key === 'crewcheck_auth_token' || key === 'crewcheck_auth_user'; }
  catch { return false; }
}
