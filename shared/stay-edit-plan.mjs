/** Pure preparation for a future stay editor. No IO, scheduling or provider imports. */
const own = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const fields = ['hotelName', 'apzAt', 'pickupAt', 'leadMinutes', 'alarmChoice'];
const none = (reason, extra = {}) => Object.freeze({ action: 'none', reason, ...extra });

export function stayInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return null;
  const day = value.slice(0, 10), midnight = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day) return null;
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

function scopeEqual(a, b) {
  return ['accountId', 'rosterId', 'rosterRevision'].every(key => typeof a?.[key] === 'string' && a[key].length > 0 && a[key] === b?.[key]);
}

/** Explicit local date/clock + IANA zone; repeated/nonexistent DST times require review. */
export function stayLocalInstant(day, clock, timeZone) {
  if (typeof day !== 'string' || typeof clock !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)
    || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clock) || !validZone(timeZone)) return null;
  const nominal = stayInstant(`${day}T${clock}:00Z`);
  if (nominal === null) return null;
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const local = epoch => {
    const p = Object.fromEntries(formatter.formatToParts(new Date(epoch)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`;
  };
  const offsets = new Set();
  for (let hour = -48; hour <= 48; hour += 6) {
    const epoch = nominal + hour * 3_600_000;
    offsets.add(Date.parse(local(epoch)) - epoch);
  }
  const matches = [...offsets].map(offset => nominal - offset).filter(epoch => local(epoch) === `${day}T${clock}:00Z`);
  return matches.length === 1 ? matches[0] : null;
}

export function selectStayForEdit(events, clickedId, now) {
  const stays = Array.isArray(events) ? events.filter(item => item?.kind === 'stay' && typeof item.id === 'string' && item.id) : [];
  const current = stays.filter(item => {
    const start = stayInstant(item.startAt), end = stayInstant(item.endAt);
    return start !== null && end !== null && end > start && start <= now && now < end;
  });
  const matches = stays.filter(item => item.id === clickedId);
  return Object.freeze({ selected: matches.length === 1 ? matches[0] : null,
    reason: matches.length === 1 ? 'selected' : matches.length > 1 ? 'ambiguous-identity' : 'item-removed',
    currentIds: Object.freeze(current.map(item => item.id)), ambiguousCurrent: current.length > 1 });
}

/** Callers retain one draft per explicit account/roster/event, never per date alone. */
export function reconcileStayDraft(previous, incoming, scope) {
  if (!incoming || !scopeEqual(incoming, scope) || !incoming.eventId) return null;
  const same = previous && previous.accountId === scope.accountId && previous.rosterId === scope.rosterId && previous.eventId === incoming.eventId;
  const revisionChanged = Boolean(same && previous.rosterRevision !== scope.rosterRevision);
  const values = {}, provenance = {}, touched = {};
  for (const field of fields) {
    const preserve = same && previous.touched?.[field] === true;
    values[field] = preserve ? previous.values[field] : incoming.values?.[field] ?? '';
    provenance[field] = preserve ? 'manual' : incoming.provenance?.[field] || 'missing';
    touched[field] = Boolean(preserve);
  }
  return Object.freeze({ ...scope, eventId: incoming.eventId, needsReview: revisionChanged || Boolean(same && previous.needsReview), values: Object.freeze(values), provenance: Object.freeze(provenance), touched: Object.freeze(touched) });
}

export function editStayDraft(draft, changes) {
  if (!draft) return null;
  const values = { ...draft.values }, provenance = { ...draft.provenance }, touched = { ...draft.touched };
  for (const field of fields) if (own(changes, field)) {
    values[field] = changes[field]; provenance[field] = 'manual'; touched[field] = true;
  }
  return Object.freeze({ ...draft, values: Object.freeze(values), provenance: Object.freeze(provenance), touched: Object.freeze(touched) });
}

/** Structural preview of the existing #951 fact contract, not proof of acquisition. */
export function inspectStayPickup({ fact, stay, scope, now, freshnessMs, acquisitionConfirmed = false }) {
  if (!fact) return none('missing', { dataState: 'missing' });
  if (!scopeEqual(fact, scope) || !scopeEqual(stay, scope) || fact.stayId !== stay.id || fact.rosterEventId !== stay.eventId
    || fact.airport !== stay.airport || fact.pairingId !== stay.pairingId) return none('scope-mismatch', { dataState: 'obsolete' });
  if (fact.schemaVersion !== 1 || fact.source !== 'mycrewcare' || fact.kind !== 'pickup'
    || !['published', 'changed', 'cancelled'].includes(fact.status)) return none('invalid-contract', { dataState: 'unconfirmed' });
  if (fact.status === 'cancelled') return none('provider-cancelled', { dataState: 'obsolete' });
  const observed = stayInstant(fact.observedAt), pickup = stayInstant(fact.pickupAt);
  const start = stayInstant(stay.startAt), end = stayInstant(stay.endAt);
  let validZone = false;
  try { validZone = Boolean(fact.timeZone && fact.timeZone === stay.timeZone && new Intl.DateTimeFormat('en', { timeZone: fact.timeZone })); } catch {}
  if (!Number.isFinite(now) || observed === null || pickup === null || start === null || end === null || end <= start
    || pickup <= start || pickup > end || !validZone || typeof fact.contentFingerprint !== 'string' || !fact.contentFingerprint)
    return none('invalid-contract', { dataState: 'unconfirmed' });
  if (!Number.isFinite(freshnessMs) || freshnessMs <= 0 || observed > now || now - observed >= freshnessMs)
    return none('stale-observation', { dataState: 'obsolete' });
  if (acquisitionConfirmed !== true) return none('acquisition-unconfirmed', { dataState: 'unconfirmed' });
  return Object.freeze({ action: 'preview', reason: 'confirmed-pickup', dataState: 'confirmed', pickupAt: new Date(pickup).toISOString() });
}

function validZone(timeZone) {
  try { return typeof timeZone === 'string' && timeZone.length > 0 && Boolean(new Intl.DateTimeFormat('en', { timeZone })); } catch { return false; }
}
function manualHotelApz(hotelApz, stay, scope) {
  if (!hotelApz) return none('hotel-apz-missing-manual-required');
  // #951 has no official hotel-APZ contract. Do not reinterpret its pickup/reservation facts.
  if (hotelApz.source !== 'manual') return none('hotel-apz-provider-contract-unavailable');
  if (!scopeEqual(hotelApz, scope) || !scopeEqual(stay, scope) || hotelApz.stayId !== stay.id || hotelApz.rosterEventId !== stay.eventId) return none('scope-mismatch');
  const apz = stayInstant(hotelApz.hotelReportAt);
  if (apz === null || !validZone(hotelApz.timeZone) || hotelApz.timeZone !== stay.timeZone || hotelApz.confirmed !== true) return none('hotel-apz-unconfirmed');
  return Object.freeze({ action: 'preview', reason: 'manual-hotel-apz-confirmed', apz });
}

/** Updating the default is a separate caller action; this never mutates an override. */
export function resolveStayAlarmChoice(defaultLeadMinutes, override) {
  if (override?.mode === 'absolute') return Object.freeze({ mode: 'absolute', alarmAt: override.alarmAt, source: 'individual' });
  if (override && override.mode !== 'relative') return none('invalid-mode');
  const individual = Boolean(override);
  const leadMinutes = individual ? override.leadMinutes : defaultLeadMinutes;
  if (!Number.isInteger(leadMinutes) || leadMinutes < 0 || leadMinutes > 720) return none('lead-not-configured');
  return Object.freeze({ mode: 'relative', leadMinutes, source: individual ? 'individual' : 'default' });
}

function displayInstant(epoch, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(epoch)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  return Object.freeze({ date: `${parts.year}-${parts.month}-${parts.day}`, clock: `${parts.hour}:${parts.minute}`, timeZone, instant: new Date(epoch).toISOString() });
}

/** Calculation is separate from permissions, capabilities and effective scheduling. */
export function calculateStayWakeup({ scope, stay, hotelApz, now, choice, defaultLeadMinutes }) {
  if (!scopeEqual(stay, scope)) return none('scope-mismatch');
  if (!validZone(stay.timeZone) || !Number.isFinite(now)) return none('time-context-invalid');
  const preference = resolveStayAlarmChoice(defaultLeadMinutes, choice);
  if (!preference.mode) return preference;
  const hotel = manualHotelApz(hotelApz, stay, scope);
  const warnings = [];
  let alarm;
  if (preference.mode === 'relative') {
    if (hotel.apz === undefined) return none(hotel.reason, { mode: preference.mode });
    alarm = hotel.apz - preference.leadMinutes * 60_000;
  } else {
    alarm = stayInstant(preference.alarmAt);
    if (alarm === null) return none('absolute-instant-invalid', { mode: preference.mode });
    if (hotel.apz === undefined) warnings.push(hotel.reason);
    else if (alarm >= hotel.apz) warnings.push('alarm-not-before-hotel-apz');
  }
  if (alarm <= now) warnings.push('alarm-past');
  return Object.freeze({ action: 'calculated', mode: preference.mode, preferenceSource: preference.source,
    ...(preference.mode === 'relative' ? { leadMinutes: preference.leadMinutes } : {}),
    scheduledAt: new Date(alarm).toISOString(), display: displayInstant(alarm, stay.timeZone),
    hotelReportAt: hotel.apz === undefined ? null : new Date(hotel.apz).toISOString(),
    differenceMinutes: hotel.apz === undefined ? null : (hotel.apz - alarm) / 60_000, warnings: Object.freeze(warnings),
    schedulingState: 'not-programmed', eligible: hotel.apz !== undefined && warnings.length === 0 });
}

/** Pure scheduling proposal. No IO; #951 is not mounted and integration defaults off. */
export function planStayAlarm({ enabled = false, scope, stay, hotelApz, now, choice, defaultLeadMinutes, leadMinutes,
  automaticConfigured = false, devicePermission = 'unknown', channelConfigured = false,
  manualScheduleRequested = false, jobs = [] } = {}) {
  if (enabled !== true) return none('integration-disabled');
  const hotel = manualHotelApz(hotelApz, stay, scope);
  if (hotel.apz === undefined) return hotel;
  if (manualScheduleRequested !== true) return none('manual-confirmation-required', { dataState: 'manual' });
  const calculated = calculateStayWakeup({ scope, stay, hotelApz, now, choice, defaultLeadMinutes: defaultLeadMinutes ?? leadMinutes });
  if (calculated.action !== 'calculated') return calculated;
  if (!calculated.eligible) return none(calculated.warnings.includes('alarm-past') ? 'trigger-expired' : 'absolute-time-incompatible', { calculated });
  if (automaticConfigured !== true || channelConfigured !== true) return none('capability-not-configured', { calculated });
  if (devicePermission !== 'granted') return none('device-permission-unconfirmed', { calculated });
  // Mode/revision/time/lead are absent: a pending job retains the same identity.
  const jobKey = `stay-hotel-apz:${encodeURIComponent(scope.accountId)}:${encodeURIComponent(scope.rosterId)}:${encodeURIComponent(stay.eventId)}`;
  if (jobKey.length > 220) return none('identity-too-long');
  const matches = jobs.filter(job => job.jobKey === jobKey);
  if (matches.length > 1) return none('duplicate-jobs-require-review');
  const existing = matches[0];
  if (existing && !scopeEqual(existing, scope)) return none('obsolete-job-requires-cancellation');
  if (existing?.status === 'cancelled') return none('cancellation-preserved');
  if (existing && existing.status !== 'pending') return none('terminal-or-inflight-job');
  const scheduledAt = calculated.scheduledAt;
  if (existing && stayInstant(existing.scheduledAt) === stayInstant(scheduledAt)) return none('already-pending', { jobKey, calculated });
  return Object.freeze({ action: existing ? 'update-pending' : 'prepare', reason: 'manual-hotel-apz-confirmed',
    targetKind: 'hotel-apz', jobKey, scheduledAt, hotelReportAt: calculated.hotelReportAt, calculated });
}
