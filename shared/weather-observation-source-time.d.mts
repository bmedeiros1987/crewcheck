export interface WeatherObservationTimeSource { readonly field?: unknown; readonly value?: unknown }
/** Returns a proven absolute integer epoch-ms, not freshness or station admission. */
export function weatherObservationSourceTime(input?: { provider?: unknown; source?: WeatherObservationTimeSource | null; raw?: unknown }): number | null;
