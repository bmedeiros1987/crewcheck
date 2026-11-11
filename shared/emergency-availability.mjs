// Availability is not channel consent, medical-data consent or delivery authority.
const scopeId = value => typeof value === 'string' && value.length > 0 && value.length <= 160
  && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const revisionId = value => scopeId(value) || (Number.isSafeInteger(value) && value >= 0);
export function emergencyAvailability({ ownerId, preferences, stay = null, override = null,
  rest = 'unknown', at } = {}) {
  const no = reason => Object.freeze({ available: false, reason, source: 'none' });
  if (!scopeId(ownerId) || preferences?.ownerId !== ownerId || !Number.isFinite(at)
    || (stay && stay.ownerId !== ownerId)) return no('scope_unknown');
  let available = preferences.available === true, source = 'habitual';
  if (override) {
    if (override.ownerId !== ownerId || !scopeId(override.stayId) || !revisionId(override.revision)
      || !['on', 'off', 'inherit'].includes(override.value)
      || !Number.isFinite(override.expiresAt)) return no('override_invalid');
    // Once an owner-bound override expires, it cannot affect a subsequent stay
    // or street context merely because the previous occurrence is no longer loaded.
    if (at < override.expiresAt) {
      if (!stay || !scopeId(stay.id) || !revisionId(stay.revision)
        || override.stayId !== stay.id || override.revision !== stay.revision
        || ![stay.startsAt, stay.endsAt].every(Number.isFinite)
        || stay.endsAt <= stay.startsAt || override.expiresAt > stay.endsAt) return no('override_invalid');
      if (at >= stay.startsAt && at < stay.endsAt && override.value !== 'inherit') {
        available = override.value === 'on'; source = 'stay';
      }
    }
  }
  if (!available) return Object.freeze({ available: false, reason: 'unavailable', source });
  if (!['awake', 'resting'].includes(rest)) return no('rest_unknown');
  if (rest === 'resting' && preferences.receiveDuringRest !== true) return no('rest_silent');
  return Object.freeze({ available: true, reason: 'available', source });
}
