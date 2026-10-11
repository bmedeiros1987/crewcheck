/**
 * Provider-neutral, source-aware logistics facts for MyCrewCare.
 *
 * This module never mutates roster, APZ, presentation, duty/rest or alarms. It
 * validates provider observations against an authenticated persisted-stay registry.
 */
export const MYCREWCARE_LOGISTICS_SCHEMA = 1;
export const MYCREWCARE_SOURCE = 'mycrewcare';
export const MYCREWCARE_MAX_RECORDS = 50;
export const MYCREWCARE_MAX_STAYS = 120;
export const MYCREWCARE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

const TEXT_LIMIT = 240;
const text = (value, max = TEXT_LIMIT) => (
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max
    ? value.trim()
    : ''
);
const opaque = (value, max = TEXT_LIMIT) => {
  const result = text(value, max);
  return result && !/[\u0000-\u001f\u007f]/.test(result) ? result : '';
};
const normalizedKey = (value) => text(value)
  .normalize('NFKC')
  .toLocaleLowerCase('pt-BR')
  .replace(/[\s\u00a0]+/g, ' ')
  .trim();

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Deterministic non-secret fingerprint used only for change detection. */
export function myCrewCareFingerprint(value) {
  const input = stableStringify(value);
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    left ^= code;
    left = Math.imul(left, 0x01000193) >>> 0;
    right ^= (code + index) & 0xffff;
    right = Math.imul(right, 0x85ebca6b) >>> 0;
  }
  return `${left.toString(16).padStart(8, '0')}${right.toString(16).padStart(8, '0')}`;
}

export function normalizeMyCrewCareContext(value) {
  const accountId = opaque(value?.accountId);
  const rosterId = opaque(value?.rosterId);
  const rosterRevision = opaque(value?.rosterRevision);
  const providerSubject = opaque(value?.providerSubject);
  return accountId && rosterId && rosterRevision && providerSubject
    ? Object.freeze({ accountId, rosterId, rosterRevision, providerSubject })
    : null;
}

export function isMyCrewCareTravelUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'api2.apicrewcare.com'
      && !url.username
      && !url.password
      && (!url.port || url.port === '443')
      && url.pathname.toLocaleLowerCase('en-US') === '/latam/mytravel.aspx';
  } catch {
    return false;
  }
}

function validDay(value) {
  const day = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const year = Number(day.slice(0, 4));
  if (year < 2020 || year > 2100) return '';
  const epoch = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(epoch) && new Date(epoch).toISOString().slice(0, 10) === day ? day : '';
}

export function myCrewCareInstant(value) {
  const raw = text(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return NaN;
  if (!validDay(raw.slice(0, 10))) return NaN;
  return Date.parse(raw);
}

function formatter(timeZone) {
  try {
    if (!text(timeZone, 80)) return null;
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    return null;
  }
}

function partsAt(format, epoch) {
  return Object.fromEntries(
    format.formatToParts(new Date(epoch))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

/** Reject nonexistent and repeated DST wall-clock minutes. */
export function myCrewCareLocalInstant(date, time, timeZone) {
  const day = validDay(date);
  const clock = text(time, 5);
  if (!day || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clock)) return null;
  const format = formatter(timeZone);
  if (!format) return null;
  const nominal = Date.parse(`${day}T${clock}:00Z`);
  const offsets = new Set();
  for (let hour = -48; hour <= 48; hour += 6) {
    const epoch = nominal + hour * 3_600_000;
    const parts = partsAt(format, epoch);
    offsets.add(Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`) - epoch);
  }
  const matches = [...offsets]
    .map((offset) => nominal - offset)
    .filter((epoch) => {
      const parts = partsAt(format, epoch);
      return `${parts.year}-${parts.month}-${parts.day}` === day
        && `${parts.hour}:${parts.minute}` === clock;
    });
  return matches.length === 1 ? matches[0] : null;
}

function optionalText(value, max = TEXT_LIMIT) {
  return value == null || value === '' ? null : (text(value, max) || null);
}

export function normalizeMyCrewCareStays(values, contextValue) {
  const context = normalizeMyCrewCareContext(contextValue);
  if (!context || !Array.isArray(values) || values.length > MYCREWCARE_MAX_STAYS) return [];
  const stays = [];
  const stayIds = new Set();
  const eventIds = new Set();
  for (const value of values) {
    const id = opaque(value?.id);
    const rosterEventId = opaque(value?.rosterEventId);
    const airport = text(value?.airport, 3).toUpperCase();
    const pairingId = opaque(value?.pairingId);
    const hotelName = optionalText(value?.hotelName);
    const timeZone = text(value?.timeZone, 80);
    const start = myCrewCareInstant(value?.startAt);
    const end = myCrewCareInstant(value?.endAt);
    const valid = id
      && !stayIds.has(id)
      && rosterEventId
      && !eventIds.has(rosterEventId)
      && value?.rosterEventKind === 'stay'
      && value?.source === 'persisted-platform-stay'
      && value?.localOnly !== true
      && value?.accountId === context.accountId
      && value?.rosterId === context.rosterId
      && value?.rosterRevision === context.rosterRevision
      && /^[A-Z]{3}$/.test(airport)
      && pairingId
      && formatter(timeZone)
      && Number.isFinite(start)
      && Number.isFinite(end)
      && end > start
      && end - start <= 7 * 86_400_000;
    if (!valid) return [];
    stayIds.add(id);
    eventIds.add(rosterEventId);
    stays.push(Object.freeze({
      id,
      rosterEventId,
      rosterEventKind: 'stay',
      source: 'persisted-platform-stay',
      localOnly: false,
      accountId: context.accountId,
      rosterId: context.rosterId,
      rosterRevision: context.rosterRevision,
      airport,
      pairingId,
      hotelName,
      timeZone,
      startAt: new Date(start).toISOString(),
      endAt: new Date(end).toISOString(),
      start,
      end,
    }));
  }
  return Object.freeze(stays.sort((left, right) => left.id.localeCompare(right.id)));
}

export function normalizeMyCrewCareRecord(value) {
  if (!value || value.direction !== 'to_airport') return null;
  const date = validDay(value.date);
  const time = text(value.time, 5);
  const airport = text(value.airport, 3).toUpperCase();
  const pairingId = opaque(value.pairingId);
  const hotelName = text(value.hotelName ?? value.hotel);
  const providerRecordId = optionalText(value.providerRecordId, 180);
  const hotelAddress = optionalText(value.hotelAddress, 320);
  const hotelPhone = optionalText(value.hotelPhone, 80);
  const reservationStart = value.reservationStartAt == null || value.reservationStartAt === ''
    ? null
    : myCrewCareInstant(value.reservationStartAt);
  const reservationEnd = value.reservationEndAt == null || value.reservationEndAt === ''
    ? null
    : myCrewCareInstant(value.reservationEndAt);
  const pickupLocation = optionalText(value.pickupLocation, 240);
  const transportProvider = optionalText(value.transportProvider, 180);
  const transportPhone = optionalText(value.transportPhone, 80);
  const status = value.status == null || value.status === ''
    ? 'published'
    : text(value.status, 40).toLocaleLowerCase('en-US');
  const transitMinutes = Number.isInteger(value.transitMinutes)
    && value.transitMinutes >= 0
    && value.transitMinutes <= 360
    ? value.transitMinutes
    : null;
  if (!date
    || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
    || !/^[A-Z]{3}$/.test(airport)
    || !pairingId
    || !hotelName
    || (reservationStart !== null && !Number.isFinite(reservationStart))
    || (reservationEnd !== null && !Number.isFinite(reservationEnd))
    || (reservationStart !== null && reservationEnd !== null && reservationEnd <= reservationStart)
    || !new Set(['published', 'changed', 'cancelled']).has(status)) return null;
  return Object.freeze({
    direction: 'to_airport',
    date,
    time,
    airport,
    pairingId,
    hotelName,
    providerRecordId,
    hotelAddress,
    hotelPhone,
    reservationStartAt: reservationStart === null ? null : new Date(reservationStart).toISOString(),
    reservationEndAt: reservationEnd === null ? null : new Date(reservationEnd).toISOString(),
    pickupLocation,
    transportProvider,
    transportPhone,
    transitMinutes,
    status,
  });
}

function factIdentity(fact) {
  return `${fact.accountId}:${fact.rosterId}:${fact.rosterRevision}:${fact.stayId}:${fact.kind}`;
}

function createFacts(context, stay, record, observedAt, pickupEpoch) {
  const common = {
    source: MYCREWCARE_SOURCE,
    status: record.status,
    providerRecordId: record.providerRecordId,
    stayId: stay.id,
    rosterEventId: stay.rosterEventId,
    airport: stay.airport,
    pairingId: stay.pairingId,
  };
  const materials = [{
    ...common,
    kind: 'hotel',
    hotelName: record.hotelName,
    hotelAddress: record.hotelAddress,
    hotelPhone: record.hotelPhone,
    reservationStartAt: record.reservationStartAt,
    reservationEndAt: record.reservationEndAt,
  }, {
    ...common,
    kind: 'pickup',
    hotelName: record.hotelName,
    timeZone: stay.timeZone,
    pickupAt: new Date(pickupEpoch).toISOString(),
    pickupLocation: record.pickupLocation,
    transportProvider: record.transportProvider,
    transportPhone: record.transportPhone,
    transitMinutes: record.transitMinutes,
  }];
  return Object.freeze(materials.map((material) => Object.freeze({
    schemaVersion: MYCREWCARE_LOGISTICS_SCHEMA,
    accountId: context.accountId,
    rosterId: context.rosterId,
    rosterRevision: context.rosterRevision,
    observedAt: new Date(observedAt).toISOString(),
    ...material,
    contentFingerprint: myCrewCareFingerprint(material),
  })));
}

/** Any invalid, conflicting, ambiguous or unmatched provider record fails closed. */
export function reconcileMyCrewCareLogistics({ context: contextValue, stays: stayValues, snapshot, now = Date.now() } = {}) {
  const context = normalizeMyCrewCareContext(contextValue);
  const stays = normalizeMyCrewCareStays(stayValues, context);
  const observedAt = myCrewCareInstant(snapshot?.observedAt ?? snapshot?.syncedAt);
  const recordsValue = snapshot?.records;
  const base = {
    accepted: false,
    facts: Object.freeze([]),
    unmatched: Object.freeze([]),
    conflicts: Object.freeze([]),
    error: null,
  };
  if (!context || stays.length !== (Array.isArray(stayValues) ? stayValues.length : -1)) {
    return Object.freeze({ ...base, error: 'invalid-scope' });
  }
  if (!Number.isFinite(now)
    || !Number.isFinite(observedAt)
    || observedAt > now + 30_000
    || now - observedAt > MYCREWCARE_CACHE_MAX_AGE_MS
    || !Array.isArray(recordsValue)
    || recordsValue.length > MYCREWCARE_MAX_RECORDS
    || (recordsValue.length === 0 && snapshot?.emptyConfirmed !== true)) {
    return Object.freeze({ ...base, error: 'invalid-snapshot' });
  }
  const records = recordsValue.map(normalizeMyCrewCareRecord);
  if (records.some((record) => record === null)) return Object.freeze({ ...base, error: 'invalid-record' });

  const unmatched = [];
  const conflicts = [];
  const factsByIdentity = new Map();
  for (const record of records) {
    const owners = stays.flatMap((stay) => {
      if (record.airport !== stay.airport
        || record.pairingId !== stay.pairingId
        || (stay.hotelName && normalizedKey(record.hotelName) !== normalizedKey(stay.hotelName))) return [];
      const pickupEpoch = myCrewCareLocalInstant(record.date, record.time, stay.timeZone);
      return pickupEpoch !== null && pickupEpoch > stay.start && pickupEpoch <= stay.end
        ? [{ stay, pickupEpoch }]
        : [];
    });
    if (owners.length === 0) {
      unmatched.push(record);
      continue;
    }
    if (owners.length !== 1) {
      conflicts.push(Object.freeze({
        reason: 'ambiguous-stay',
        record,
        stayIds: owners.map(({ stay }) => stay.id).sort(),
      }));
      continue;
    }
    const recordFacts = createFacts(context, owners[0].stay, record, observedAt, owners[0].pickupEpoch);
    let conflicting = false;
    for (const fact of recordFacts) {
      const previous = factsByIdentity.get(factIdentity(fact));
      if (previous && previous.contentFingerprint !== fact.contentFingerprint) {
        conflicts.push(Object.freeze({
          reason: 'conflicting-records',
          record,
          stayIds: [fact.stayId],
          kind: fact.kind,
        }));
        conflicting = true;
      }
    }
    if (!conflicting) {
      for (const fact of recordFacts) factsByIdentity.set(factIdentity(fact), fact);
    }
  }
  if (conflicts.length > 0) {
    return Object.freeze({
      ...base,
      unmatched: Object.freeze(unmatched),
      conflicts: Object.freeze(conflicts),
      error: 'ambiguous-provider-data',
    });
  }
  if (unmatched.length > 0) {
    return Object.freeze({
      ...base,
      unmatched: Object.freeze(unmatched),
      error: 'unmatched-provider-data',
    });
  }
  const facts = [...factsByIdentity.values()]
    .sort((left, right) => left.stayId.localeCompare(right.stayId) || left.kind.localeCompare(right.kind));
  return Object.freeze({
    accepted: true,
    facts: Object.freeze(facts),
    unmatched: Object.freeze([]),
    conflicts: Object.freeze([]),
    error: null,
  });
}

export function diffMyCrewCareFacts(previousValues, nextValues) {
  const previous = Array.isArray(previousValues) ? previousValues : [];
  const next = Array.isArray(nextValues) ? nextValues : [];
  const previousById = new Map(previous.map((fact) => [factIdentity(fact), fact]));
  const nextById = new Map(next.map((fact) => [factIdentity(fact), fact]));
  const added = [];
  const changed = [];
  const removed = [];
  for (const [identity, fact] of nextById) {
    const old = previousById.get(identity);
    if (!old) added.push(fact);
    else if (old.contentFingerprint !== fact.contentFingerprint) changed.push(Object.freeze({ before: old, after: fact }));
  }
  for (const [identity, fact] of previousById) {
    if (!nextById.has(identity)) removed.push(fact);
  }
  return Object.freeze({
    added: Object.freeze(added),
    changed: Object.freeze(changed),
    removed: Object.freeze(removed),
    hasChanges: added.length > 0 || changed.length > 0 || removed.length > 0,
  });
}

function selectFact(facts, stayId, kind, { now = Date.now(), freshForMs = 15 * 60_000, includeCancelled = false } = {}) {
  const id = opaque(stayId);
  if (!id || !Array.isArray(facts) || !Number.isFinite(now)) return null;
  const candidates = facts.filter((fact) => fact?.schemaVersion === MYCREWCARE_LOGISTICS_SCHEMA
    && fact?.source === MYCREWCARE_SOURCE
    && fact?.kind === kind
    && fact?.stayId === id);
  if (candidates.length !== 1) return null;
  const fact = candidates[0];
  if (fact.status === 'cancelled' && includeCancelled !== true) return null;
  const observedAt = myCrewCareInstant(fact.observedAt);
  if (!Number.isFinite(observedAt)
    || observedAt > now + 30_000
    || now - observedAt > MYCREWCARE_CACHE_MAX_AGE_MS) return null;
  return Object.freeze({
    ...fact,
    dataState: Math.max(0, now - observedAt) <= freshForMs ? 'fresh' : 'cached',
  });
}

export function selectMyCrewCareHotel(facts, stayId, options = {}) {
  return selectFact(facts, stayId, 'hotel', options);
}

export function selectMyCrewCarePickup(facts, stayId, options = {}) {
  return selectFact(facts, stayId, 'pickup', options);
}
