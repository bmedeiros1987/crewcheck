// Pure policy only: no network, persistence, timers, credentials or registration.
// The caller retains existing subscription, schedule-window and channel checks.
export const WEATHER_OBSERVATION_MAX_AGE_MS = 60 * 60_000;
export const WEATHER_ALERT_COOLDOWN_MS = 90 * 60_000;

function timestamp(value) {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value))) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return NaN;
    // AviationWeather obsTime is Unix seconds; REDEMET supplies an ISO string.
    return number < 100_000_000_000 ? number * 1000 : number;
  }
  return typeof value === 'string' && value.trim() ? Date.parse(value) : NaN;
}

export function evaluateCriticalWeatherDelivery({ report, station, previous = {}, change, now } = {}) {
  const reject = (reason) => ({ accepted: false, shouldSend: false, reason });
  if (!Number.isFinite(now)) return reject('invalid_now');
  if (report?.ok !== true || report?.official !== true || !['redemet', 'aviationweather'].includes(report?.provider)) {
    return reject('unverified_report');
  }
  const expectedStation = String(station || '').trim().toUpperCase();
  const raw = String(report?.raw || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const match = raw.match(/^(?:(?:METAR|SPECI)(?: COR)? )?([A-Z]{4}) (\d{2})(\d{2})(\d{2})Z(?: |$)/);
  if (!match || !/^[A-Z]{4}$/.test(expectedStation) || match[1] !== expectedStation || report.station !== expectedStation) {
    return reject('invalid_station_or_report');
  }
  const observedAt = timestamp(report.observedAt);
  if (!Number.isFinite(observedAt)) return reject('invalid_observed_at');
  const observed = new Date(observedAt);
  if (observed.getUTCDate() !== Number(match[2]) || observed.getUTCHours() !== Number(match[3]) || observed.getUTCMinutes() !== Number(match[4])) {
    return reject('observation_time_mismatch');
  }
  if (observedAt > now) return reject('future_observation');
  if (now - observedAt > WEATHER_OBSERVATION_MAX_AGE_MS) return reject('stale_observation');
  const previousObservedAt = timestamp(previous.observedAt);
  if (Number.isFinite(previousObservedAt) && observedAt < previousObservedAt) return reject('older_observation');
  if (!change || !Number.isInteger(change.severity) || change.severity < 0 || change.severity > 3 || !change.fingerprint) {
    return reject('invalid_assessment');
  }

  const firstObservation = !String(previous.raw || '').trim();
  // The previous first-observation threshold was 3, silently omitting +RA and
  // 25–34kt gusts (severity 2) even though the in-app notice already shows them.
  const firstRelevantObservation = firstObservation && change.severity >= 2;
  const lastSentAt = timestamp(previous.lastSentAt);
  const cooldownActive = Number.isFinite(lastSentAt) && now - lastSentAt < WEATHER_ALERT_COOLDOWN_MS;
  const severityIncreased = change.severity > Number(previous.severity || 0);
  const duplicate = previous.fingerprint === change.fingerprint;
  const pendingRetry = Boolean(previous.pendingDelivery && change.severity >= 2);
  const critical = firstRelevantObservation || change.critical === true;
  const shouldSend = pendingRetry || (critical && !duplicate && (!cooldownActive || severityIncreased));
  const reason = pendingRetry ? 'pending_retry'
    : duplicate ? 'duplicate'
      : !critical ? 'no_relevant_worsening'
        : cooldownActive && !severityIncreased ? 'cooldown'
          : firstRelevantObservation ? 'first_relevant_observation' : 'relevant_worsening';
  return { accepted: true, shouldSend, reason, firstObservation, observedAt: observed.toISOString() };
}
