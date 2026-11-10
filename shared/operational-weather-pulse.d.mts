export const WEATHER_PULSE_SCOPE: 'weather:operational:v1';
export const WEATHER_PULSE_REQUEST_INTERVAL_MS: number;
export const WEATHER_PULSE_STATION_LIMIT: 2;
export type WeatherPulseRole = 'origin' | 'destination';
export interface WeatherPulseFlight {
  readonly id: string;
  readonly journeyId: string;
  readonly kind: 'flight';
  readonly placeholder?: boolean;
  /** Safe-integer canonical epoch-ms or ISO with explicit Z/offset; never APZ. */
  readonly departure: number | string;
  readonly arrival: number | string;
  readonly departureClock: string;
  readonly arrivalClock: string;
  /** ICAO outputs from the existing airport mapping; this module does not map IATA. */
  readonly origin: string;
  readonly destination: string;
}
export interface WeatherPulseContext {
  readonly ownerId: string;
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly flights: readonly WeatherPulseFlight[];
}
export interface WeatherPulseBinding {
  readonly flightId: string;
  readonly journeyId: string;
  readonly departure: number;
  readonly arrival: number;
  readonly station: string;
  readonly role: WeatherPulseRole;
  /** 0 recent destination; 1 active; 2 future; 3 short-flight origin tail. */
  readonly phase: 0 | 1 | 2 | 3;
  readonly opensAt: number;
  readonly closesAt: number;
  readonly bindingKey: string;
}
export interface WeatherPulseTicket {
  readonly id: number;
  readonly epoch: number;
  readonly contextKey: string;
  readonly issuedAt: number;
  readonly stations: readonly string[];
  readonly bindings: readonly WeatherPulseBinding[];
}
export interface WeatherPulseReport {
  readonly ok?: unknown;
  readonly official?: unknown;
  readonly provider?: unknown;
  readonly station?: unknown;
  readonly observedAt?: unknown;
  readonly raw?: unknown;
  readonly [key: string]: unknown;
}
export interface WeatherPulseAssessment {
  readonly report: WeatherPulseReport;
  /** Existing severity classifier output, not a new classifier. */
  readonly severity: number;
}
export interface WeatherPulseObservation {
  readonly station: string;
  readonly provider: string;
  readonly raw: string;
  readonly observedAt: number;
  readonly expiresAt: number;
  readonly severity: number;
}
export interface WeatherPulseIntent {
  readonly scope: typeof WEATHER_PULSE_SCOPE;
  readonly ownerId: string;
  readonly sourceId: string;
  readonly sourceRevision: string;
  readonly bindingKey: string;
  /** Material evidence only. Not an existing persisted review/disposition hash. */
  readonly materialKey: string;
  readonly flightId: string;
  readonly journeyId: string;
  readonly station: string;
  readonly role: WeatherPulseRole;
  readonly observedAt: number;
  readonly expiresAt: number;
  readonly severity: 2 | 3;
  readonly report: Readonly<{ ok: true; official: true; provider: string; station: string; observedAt: string; raw: string }>;
}
declare const stateBrand: unique symbol;
export interface WeatherPulseState {
  readonly [stateBrand]: never;
  readonly version: 1;
  readonly epoch: number;
  readonly contextKey: string | null;
  readonly lastNow: number | null;
  readonly lastAttemptAt: number | null;
  readonly nextTicketId: number;
  readonly pending: Readonly<{ ticket: WeatherPulseTicket; revoked: boolean }> | null;
  readonly selected: readonly WeatherPulseBinding[];
  readonly observations: readonly WeatherPulseObservation[];
  readonly activeIntents: readonly WeatherPulseIntent[];
  readonly clockBlocked: boolean;
}
export interface WeatherPulseResult {
  readonly state: WeatherPulseState;
  readonly request: WeatherPulseTicket | null;
  readonly activeIntents: readonly WeatherPulseIntent[];
  /** Strictly greater than supplied now or null. Never an instruction to query. */
  readonly nextWakeAt: number | null;
  readonly reason: string;
}
export function selectWeatherPulseBindings(context: WeatherPulseContext | null | undefined, now: number): Readonly<{
  contextKey: string | null;
  bindings: readonly WeatherPulseBinding[];
  nextSelectionAt: number | null;
}>;
export function createWeatherPulseState(): WeatherPulseState;
/** now must be safe-integer epoch-ms. Fractional/invalid time revokes admission. */
export function advanceWeatherPulse(state: WeatherPulseState, context: WeatherPulseContext | null | undefined, now: number): WeatherPulseResult;
/** Return the original ticket object. Terminal acknowledgement releases only its
 * own slot; a requested abort is not acknowledgement. This never issues a ticket.
 * Advance after settlement to discover any quota-eligible next request intent.
 * now/canonical epochs are integer ms; numeric observation seconds must resolve
 * to integer ms as well. The reused server delivery policy is not changed. */
export function settleWeatherPulse(state: WeatherPulseState, context: WeatherPulseContext | null | undefined, ticket: WeatherPulseTicket,
  outcome: 'success' | 'failure' | 'aborted-ack', reports: readonly WeatherPulseAssessment[] | null | undefined, now: number): WeatherPulseResult;
