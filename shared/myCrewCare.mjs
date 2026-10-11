/**
 * MyCrewCare v2 safety boundary, reconciled from PR #872 without its Wake port.
 * Pure/in-memory: no credentials, cookies, storage, network or alarm side effects.
 * A persisted stay registry and a verified provider identity are mandatory inputs.
 */
export const MYCREWCARE_PROTOCOL = 2;
export const MYCREWCARE_MAX_AGE_MS = 15 * 60_000;
export const MYCREWCARE_FUTURE_SKEW_MS = 30_000;
const MAX_RECORDS = 20;
const MAX_STAYS = 100;
const text = (value, max = 160) => typeof value === 'string' && value.trim().length <= max ? value.trim() : '';
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const hotelKey = (value) => text(value).normalize('NFKC').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
const opaque = (value) => { const result = text(value); return result && !/[\u0000-\u001f\u007f]/.test(result) ? result : ''; };

export function isMyCrewCareTravelUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'api2.apicrewcare.com'
      && !url.username && !url.password && (!url.port || url.port === '443')
      && url.pathname.toLowerCase() === '/latam/mytravel.aspx';
  } catch { return false; }
}

export function normalizeMyCrewCareContext(value) {
  const result = Object.fromEntries(['accountId', 'rosterId', 'rosterRevision', 'providerSubject'].map((key) => [key, opaque(value?.[key])]));
  return Object.values(result).every(Boolean) ? Object.freeze(result) : null;
}

function validDay(value) {
  const day = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || +day.slice(0, 4) < 2020 || +day.slice(0, 4) > 2100) return '';
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : '';
}

function instant(value) {
  const raw = text(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw) || !validDay(raw.slice(0, 10))) return NaN;
  return Date.parse(raw);
}

function formatter(timeZone) {
  try {
    if (!text(timeZone, 80)) return null;
    return new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch { return null; }
}

function partsAt(format, epoch) {
  return Object.fromEntries(format.formatToParts(new Date(epoch)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

/** Reject missing, invalid, nonexistent and repeated DST wall-clock minutes. */
export function myCrewCareLocalInstant(date, time, timeZone) {
  date = validDay(date);
  time = text(time, 5);
  if (!date || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const format = formatter(timeZone);
  if (!format) return null;
  const nominal = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set();
  for (let hour = -48; hour <= 48; hour += 6) {
    const epoch = nominal + hour * 3_600_000;
    const p = partsAt(format, epoch);
    offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - epoch);
  }
  const matches = [...offsets].map((offset) => nominal - offset).filter((epoch) => {
    const p = partsAt(format, epoch);
    return `${p.year}-${p.month}-${p.day}` === date && `${p.hour}:${p.minute}` === time;
  });
  return matches.length === 1 ? matches[0] : null;
}

function normalizeRecord(value) {
  if (!value || value.direction !== 'to_airport') return null;
  const date = validDay(value.date);
  const time = text(value.time, 5);
  const airport = text(value.airport, 3).toUpperCase();
  const pairingId = opaque(value.pairingId);
  const hotel = text(value.hotel);
  if (!date || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) || !/^[A-Z]{3}$/.test(airport) || !pairingId || !hotel) return null;
  const transitMinutes = Number.isInteger(value.transitMinutes) && value.transitMinutes >= 0 && value.transitMinutes <= 360 ? value.transitMinutes : null;
  return Object.freeze({ direction: 'to_airport', date, time, airport, pairingId, hotel, transitMinutes });
}

/** This input must come from an authenticated, non-localOnly platform stay read.
 * Never pass ZeroLeg.id as id. rosterEventId is an explicit separately verified link.
 */
export function normalizeMyCrewCareStays(values, context) {
  if (!context || !Array.isArray(values) || values.length > MAX_STAYS) return [];
  const stays = [];
  const ids = new Set();
  const eventIds = new Set();
  for (const value of values) {
    const id = opaque(value?.id);
    const rosterEventId = opaque(value?.rosterEventId);
    const airport = text(value?.airport, 3).toUpperCase();
    const pairingId = opaque(value?.pairingId);
    const hotel = text(value?.hotelName);
    const timeZone = text(value?.timeZone, 80);
    const start = instant(value?.startAt);
    const end = instant(value?.endAt);
    if (!id || ids.has(id) || !rosterEventId || eventIds.has(rosterEventId) || value.rosterEventKind !== 'stay' || value?.source !== 'persisted-platform-stay' || value.localOnly === true
      || value.accountId !== context.accountId || value.rosterId !== context.rosterId || value.rosterRevision !== context.rosterRevision
      || !/^[A-Z]{3}$/.test(airport) || !pairingId || !hotel || !formatter(timeZone)
      || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 7 * 86_400_000) return [];
    ids.add(id);
    eventIds.add(rosterEventId);
    stays.push(Object.freeze({ id, rosterEventId, airport, pairingId, hotel, timeZone, start, end }));
  }
  return stays.sort((a, b) => a.id.localeCompare(b.id));
}

function snapshotIsFresh(snapshot, now) {
  return snapshot && Number.isFinite(now) && snapshot.syncedAt <= now + MYCREWCARE_FUTURE_SKEW_MS
    && now - snapshot.syncedAt <= MYCREWCARE_MAX_AGE_MS;
}

/** Resolve across the entire registry: one record -> one stay and one stay -> one pickup. */
function resolvePickup(stayId, stays, snapshot, now) {
  if (!snapshotIsFresh(snapshot, now)) return null;
  const selected = stays.find((stay) => stay.id === stayId);
  if (!selected) return null;
  const matches = [];
  for (const record of snapshot.records) {
    const owners = stays.flatMap((stay) => {
      if (record.airport !== stay.airport || record.pairingId !== stay.pairingId || hotelKey(record.hotel) !== hotelKey(stay.hotel)) return [];
      const at = myCrewCareLocalInstant(record.date, record.time, stay.timeZone);
      return at !== null && at > stay.start && at <= stay.end ? [{ stay, at }] : [];
    });
    if (owners.some(({ stay }) => stay.id === stayId)) {
      if (owners.length !== 1) return null;
      matches.push({ stayId, rosterEventId: selected.rosterEventId, source: 'mycrewcare', pickupAt: new Date(owners[0].at).toISOString(), ...record });
    }
  }
  // Identical nested DOM cards may repeat; conflicting times/metadata may not.
  const unique = [...new Map(matches.map((match) => [JSON.stringify(match), match])).values()];
  return unique.length === 1 ? Object.freeze(unique[0]) : null;
}

/** Exported entrypoint for #872's replacement runtime. No global singleton/cache.
 * read must produce v2 proof from the isolated native adapter, never a status ping.
 */
export function createMyCrewCareSession({ adapter, now = Date.now, timeoutMs = 30_000 } = {}) {
  const sessionId = globalThis.crypto.randomUUID();
  let context = null;
  let stays = [];
  let automatic = false;
  let epoch = 0;
  let pending = null;
  let snapshot = null;
  let status = 'disconnected';
  function invalidate(reason = 'disconnected') {
    epoch += 1;
    pending?.abort();
    pending = null;
    snapshot = null;
    status = reason;
    try { adapter?.disconnect?.(); } catch {}
  }
  function expire() { if (snapshot && !snapshotIsFresh(snapshot, now())) invalidate('expired'); }
  return Object.freeze({
    setContext(value, persistedStays = []) {
      const next = normalizeMyCrewCareContext(value);
      const nextStays = normalizeMyCrewCareStays(persistedStays, next);
      if (same(context, next) && same(stays, nextStays)) return;
      invalidate();
      automatic = false;
      context = next;
      stays = nextStays;
    },
    setAutomatic(enabled) {
      const next = enabled === true && context !== null && stays.length > 0;
      if (automatic === next) return;
      automatic = next;
      invalidate(next ? 'disconnected' : 'off');
    },
    disconnect() { automatic = false; invalidate(); },
    logout() { automatic = false; context = null; stays = []; invalidate(); },
    state() { expire(); return Object.freeze({ status, connected: status === 'connected', automatic }); },
    pickup(stayId) { expire(); return automatic ? resolvePickup(stayId, stays, snapshot, now()) : null; },
    async sync() {
      if (!automatic || !context || !stays.length || typeof adapter?.read !== 'function') return false;
      invalidate('syncing');
      const generation = epoch;
      const capturedContext = context;
      const requestId = `${sessionId}:${generation}`;
      const abort = new AbortController();
      pending = abort;
      let timer;
      try {
        const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), Math.max(1, Math.min(30_000, timeoutMs))); });
        const cancelled = new Promise((_, reject) => abort.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
        const payload = await Promise.race([adapter.read({ requestId, context: { ...capturedContext } }, abort.signal), deadline, cancelled]);
        if (generation !== epoch || context !== capturedContext || !automatic) return false;
        if (payload?.schemaVersion !== MYCREWCARE_PROTOCOL || payload.requestId !== requestId
          || !same(normalizeMyCrewCareContext(payload.context), capturedContext)) throw new Error('scope-mismatch');
        if (payload.cancelled === true) { automatic = false; invalidate('off'); return false; }
        const syncedAt = instant(payload?.syncedAt);
        if (payload.authenticated !== true
          || payload.providerSubject !== capturedContext.providerSubject || !isMyCrewCareTravelUrl(payload.url)
          || payload.error || !Array.isArray(payload.records) || payload.records.length > MAX_RECORDS
          || (payload.records.length === 0 && payload.emptyConfirmed !== true)
          || !snapshotIsFresh({ syncedAt }, now())) throw new Error('unverified-session');
        const records = Array.from(payload.records, normalizeRecord);
        if (records.some((record) => record === null)) throw new Error('invalid-transport');
        snapshot = Object.freeze({ syncedAt, records: Object.freeze(records) });
        pending = null;
        status = 'connected';
        return true;
      } catch {
        if (generation === epoch) invalidate('session-error');
        return false;
      } finally { clearTimeout(timer); }
    },
  });
}
