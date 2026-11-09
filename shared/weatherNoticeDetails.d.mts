/** Presentation only; the caller retains observation admission and delivery policy. */
export type WeatherNoticeObservation = {
  raw?: unknown;
  observedAt?: unknown;
  station?: unknown;
};
/** Supported current METAR/SPECI body facts, never a before/after claim. */
export function formatWeatherNoticeDetails(observation?: WeatherNoticeObservation): string;
