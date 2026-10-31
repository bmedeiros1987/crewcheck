import { alertAccount, alertDigest, readAlertReviews, type AlertIdentity, type AlertReviewRecord } from './alertReviewStore';
import { publishCrewCheckNotice, publishCrewCheckPulse, reconcileCrewCheckPulse } from '../components/pulse/pulseRuntime';
import type { CrewCheckPulseMessage } from '../components/pulse/pulseTypes';
import { WEATHER_PULSE_SCOPE, type WeatherPulseIntent } from '../../../shared/operational-weather-pulse.mjs';
import { WEATHER_OBSERVATION_MAX_AGE_MS, weatherFlightWindow } from '../../../server/weather/critical-observation.mjs';
import { formatWeatherNoticeDetails } from '../../../shared/weatherNoticeDetails.mjs';
import type { OperationalWeatherSnapshot, WeatherFlightPresentation } from './operationalWeatherContext';

export const WEATHER_LANDING_SCOPE = 'weather:landing:v1';
export type LegacyWeatherFacts = Readonly<{ raw: string; taf: string; hazardText: string; severity: number; observedAt: number }>;
const normalizedRaw = (value: string) => value.trim().toUpperCase().replace(/\s+/g, ' ');
export function operationalWeatherIdentity(intent: WeatherPulseIntent, flight: WeatherFlightPresentation): AlertIdentity {
  return {
    occurrence: alertDigest(['weather-operational-v2', flight.departure, flight.arrival,
      flight.flightNumber.toUpperCase().replace(/\s+/g, ''), flight.originIcao.trim().toUpperCase(), flight.destinationIcao.trim().toUpperCase(), intent.station]),
    version: alertDigest(['weather-observation-v2', intent.observedAt, normalizedRaw(intent.report.raw), intent.severity]),
  };
}
function legacyReviewed(intent: WeatherPulseIntent, flight: WeatherFlightPresentation, facts: LegacyWeatherFacts | undefined,
  rows: readonly AlertReviewRecord[], read: (key: string) => string, now: number): boolean {
  if (!facts || facts.observedAt !== intent.observedAt || facts.severity !== intent.severity || normalizedRaw(facts.raw) !== normalizedRaw(intent.report.raw)) return false;
  const airport = intent.role === 'origin' ? flight.origin : flight.destination;
  const current = [facts.severity, facts.raw, facts.taf, facts.hazardText].join('|');
  const stored = read(`crewcheck_weather_pulse_signature_${flight.id}_${airport}`);
  const window = weatherFlightWindow({ departure: flight.departure, arrival: flight.arrival, role: intent.role, now });
  if (!window.eligible) return false;
  for (const signature of new Set([current, stored])) {
    const parts = signature.split('|');
    if (parts.length !== 4 || parts[0] !== String(intent.severity) || normalizedRaw(parts[1]) !== normalizedRaw(intent.report.raw) || parts[3] !== facts.hazardText) continue;
    const key = `weather:${flight.id}:${airport}:${signature}`;
    const identity = { occurrence: alertDigest(['notice', key]), version: alertDigest([key, parts[3] || `${flight.flightNumber || 'Próximo voo'} · METAR/TAF com critério operacional relevante.`]) };
    if (rows.some(row => {
      if (row.occurrence !== identity.occurrence || row.version !== identity.version || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(row.at)) return false;
      const at = Date.parse(row.at);
      return Number.isFinite(at) && at >= intent.observedAt && at >= window.opensAt! && at <= Math.min(now, intent.expiresAt, window.closesAt!);
    })) return true;
  }
  return false;
}
export type WeatherNoticeDependencies = {
  owner(): string | null; reviews(): AlertReviewRecord[]; readLegacy(key: string): string;
  reconcile(scope: string, active: AlertIdentity[]): void;
  notice(message: CrewCheckPulseMessage): unknown; pulse(message: CrewCheckPulseMessage): unknown;
  format: typeof formatWeatherNoticeDetails;
};
/** Process-memory only: no cross-reload exactly-once OS guarantee. */
export function createOperationalWeatherNoticeProjector(deps: WeatherNoticeDependencies) {
  const announcements = new Map<string, number>(); let highWater = 0;
  return (intents: readonly WeatherPulseIntent[], snapshot: OperationalWeatherSnapshot | null,
    legacy: ReadonlyMap<string, LegacyWeatherFacts>, now: number, isCurrent: () => boolean) => {
    if (now >= highWater) { highWater = now; for (const [key, expiry] of announcements) if (expiry < now) announcements.delete(key); }
    const owner = deps.owner(), rows = deps.reviews();
    const messages: Array<{ message: CrewCheckPulseMessage; announcement: string; expiry: number }> = [];
    if (snapshot && owner === snapshot.context.ownerId && isCurrent()) for (const intent of intents) {
      const flight = snapshot.flights[intent.flightId];
      if (!flight || intent.ownerId !== owner || intent.sourceId !== snapshot.context.sourceId || intent.sourceRevision !== snapshot.context.sourceRevision) continue;
      const review = operationalWeatherIdentity(intent, flight);
      if (rows.some(row => row.occurrence === review.occurrence && row.version === review.version) || legacyReviewed(intent, flight, legacy.get(intent.station), rows, deps.readLegacy, now)) continue;
      const airport = intent.role === 'origin' ? flight.origin : flight.destination;
      const id = `${WEATHER_PULSE_SCOPE}:${owner}:${review.occurrence}`;
      messages.push({ announcement: JSON.stringify([owner, intent.station, intent.observedAt, normalizedRaw(intent.report.raw), intent.severity]),
        expiry: intent.observedAt + WEATHER_OBSERVATION_MAX_AGE_MS,
        message: { id, dedupeKey: id, account: owner, scope: WEATHER_PULSE_SCOPE, review, category: 'weather',
          tone: intent.severity >= 3 ? 'erro' : 'atencao', priority: intent.severity >= 3 ? 'critica' : 'alta',
          title: intent.severity >= 3 ? `Meteorologia crítica · ${airport}` : `Meteorologia requer atenção · ${airport}`,
          detail: deps.format({ raw: intent.report.raw, observedAt: intent.report.observedAt, station: intent.station }),
          pulseCooldownMs: 10 * 60_000, systemNotification: 'background', notificationCooldownMs: 15 * 60_000,
          notificationTag: `crewcheck:weather:${owner}:${review.occurrence}`,
          action: { label: 'Ver meteorologia', view: 'weather', context: { programId: flight.id, dateEpochMs: flight.departure,
            journeyId: flight.journeyId, flightKey: flight.flightNumber, airportCode: airport } } } });
    }
    if (!isCurrent() || deps.owner() !== owner) { deps.reconcile(WEATHER_PULSE_SCOPE, []); return; }
    deps.reconcile(WEATHER_PULSE_SCOPE, messages.map(item => item.message.review!));
    for (const item of messages) {
      if (!isCurrent() || deps.owner() !== owner) { deps.reconcile(WEATHER_PULSE_SCOPE, []); return; }
      if (!announcements.has(item.announcement) && announcements.size < 128 && now >= highWater) {
        // Record the attempt even if foreground/permissions prevent OS delivery.
        announcements.set(item.announcement, item.expiry); deps.notice(item.message);
      } else deps.pulse(item.message);
    }
  };
}
export const projectOperationalWeatherNotices = createOperationalWeatherNoticeProjector({
  owner: alertAccount, reviews: readAlertReviews,
  readLegacy: key => { try { return localStorage.getItem(key) || ''; } catch { return ''; } },
  reconcile: reconcileCrewCheckPulse, notice: publishCrewCheckNotice, pulse: publishCrewCheckPulse, format: formatWeatherNoticeDetails,
});
