import { stayInstant, stayLocalInstant } from './stay-edit-plan.mjs';
import { validTimeZone, resolveTimeZoneChoice, timeZoneOffsetLabel } from './timezone-choice.mjs';

export function stayTimeZonePreference(value) {
  return { source: ['local', 'base', 'utc', 'manual'].includes(value?.source) ? value.source : 'local',
    manualZone: validTimeZone(value?.manualZone) ? value.manualZone : '' };
}
export function resolveStayDisplayZone(preference, { localZone = '', baseZone = '' } = {}) {
  const value = stayTimeZonePreference(preference);
  return resolveTimeZoneChoice(value.source, { local: localZone, base: baseZone, manual: value.manualZone, strict: true });
}
export function presentStayInstant(instant, zone) {
  const epoch = stayInstant(instant);
  if (epoch === null || !validTimeZone(zone)) return { status: 'unavailable' };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(epoch)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return { status: 'available', instant, date: `${parts.year}-${parts.month}-${parts.day}`, clock: `${parts.hour}:${parts.minute}`, timeZone: zone, offset: timeZoneOffsetLabel(zone, instant) };
}
/** Received pickup civil time belongs to the pickup location. No base/device fallback. */
export function normalizePickupLocal({ date, clock, timeZone } = {}) {
  if (!validTimeZone(timeZone)) return { status: 'unavailable', reason: 'pickup-zone-missing' };
  const epoch = stayLocalInstant(date, clock, timeZone);
  if (epoch === null) return { status: 'unavailable', reason: 'pickup-local-time-invalid-or-ambiguous' };
  return Object.freeze({ status: 'available', instant: new Date(epoch).toISOString(), date, clock, timeZone, clockOrigin: 'pickup-local' });
}
export function presentPickup(pickup, preference, context) {
  if (pickup?.status !== 'available' || pickup.clockOrigin !== 'pickup-local') return { status: 'unavailable' };
  const checked = normalizePickupLocal(pickup);
  if (checked.status !== 'available' || stayInstant(checked.instant) !== stayInstant(pickup.instant)) return { status: 'unavailable', reason: 'pickup-source-conflict' };
  const zone = resolveStayDisplayZone(preference, { ...context, localZone: pickup.timeZone });
  return zone.zone ? presentStayInstant(pickup.instant, zone.zone) : { status: 'unavailable', message: zone.message };
}
