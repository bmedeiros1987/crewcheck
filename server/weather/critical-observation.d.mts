export const WEATHER_OBSERVATION_MAX_AGE_MS: number;
export const WEATHER_ALERT_COOLDOWN_MS: number;
export function weatherFlightWindow(input: { departure?: unknown; arrival?: unknown; role?: string; now?: number }): { eligible: boolean; opensAt?: number; closesAt?: number };
export function evaluateWeatherObservation(input: { report?: any; station?: string; now?: number }): { accepted: boolean; shouldSend?: boolean; reason?: string; observedAt?: string; expiresAt?: number };
export function evaluateCriticalWeatherDelivery(input?: any): any;
