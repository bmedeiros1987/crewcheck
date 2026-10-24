// Availability is not channel consent, medical-data consent or delivery authority.
export function emergencyAvailability({ ownerId, preferences, stay = null, override = null,
  rest = 'unknown', at } = {}) {
  const no = reason => Object.freeze({ available: false, reason, source: 'none' });
  if (!ownerId || preferences?.ownerId !== ownerId || !Number.isFinite(at)) return no('scope_unknown');
  let available = preferences.available === true, source = 'habitual';
  if (override) {
    if (!stay || stay.ownerId !== ownerId || override.ownerId !== ownerId
      || override.stayId !== stay.id || override.revision !== stay.revision
      || !['on', 'off', 'inherit'].includes(override.value)
      || ![stay.startsAt, stay.endsAt, override.expiresAt].every(Number.isFinite)
      || stay.endsAt <= stay.startsAt || override.expiresAt > stay.endsAt) return no('override_invalid');
    if (at >= stay.startsAt && at < stay.endsAt && at < override.expiresAt && override.value !== 'inherit') {
      available = override.value === 'on'; source = 'stay';
    }
  }
  if (!available) return Object.freeze({ available: false, reason: 'unavailable', source });
  if (!['awake', 'resting'].includes(rest)) return no('rest_unknown');
  if (rest === 'resting' && preferences.receiveDuringRest !== true) return no('rest_silent');
  return Object.freeze({ available: true, reason: 'available', source });
}
