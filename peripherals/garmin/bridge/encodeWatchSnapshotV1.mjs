const MAX_WIRE_BYTES = 1024;
const MAX_SCHEDULE_ITEMS = 8;

const CAPABILITY_BITS = Object.freeze({
  basicRoster: 1,
  crewLife: 2,
  concierge: 4,
  smartDeparture: 8,
  liveOps: 16,
  advancedIntegrations: 32,
});

const ALL_PREMIUM_BITS = Object.values(CAPABILITY_BITS).reduce((mask, bit) => mask | bit, 0);
const STATE_SET = new Set([
  'OFF_DUTY', 'LEAVE_SOON', 'REPORTING', 'BOARDING', 'IN_FLIGHT',
  'CONNECTION', 'OVERNIGHT', 'CHANGED', 'UNKNOWN',
]);
const SCHEDULE_KIND_SET = new Set(['flight', 'stay', 'duty']);

function cleanString(value, maxLength) {
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength ? normalized : normalized.slice(0, maxLength);
}

function contractString(value, field, maxLength, fallback = '') {
  if (value == null) return fallback;
  if (typeof value !== 'string') throw new TypeError(`watchSnapshotV1 ${field} must be a string`);
  return cleanString(value, maxLength);
}

function epochSeconds(epochMs) {
  if (!Number.isSafeInteger(epochMs) || epochMs <= 0) {
    throw new TypeError('watchSnapshotV1 timestamps must be positive safe integers in milliseconds');
  }
  return Math.floor(epochMs / 1000);
}

function premiumMask(value) {
  if (value == null) return CAPABILITY_BITS.basicRoster;
  if (typeof value !== 'boolean') throw new TypeError('watchSnapshotV1 premiumAccess must be boolean');
  return value ? ALL_PREMIUM_BITS : CAPABILITY_BITS.basicRoster;
}

function scheduleRows(schedule) {
  if (schedule == null) return [];
  if (!Array.isArray(schedule)) throw new TypeError('watchSnapshotV1 schedule must be an array');

  return schedule.slice(0, MAX_SCHEDULE_ITEMS).map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError(`watchSnapshotV1 schedule[${index}] must be an object`);
    }
    const kind = item.kind == null ? 'duty' : item.kind;
    if (typeof kind !== 'string' || !SCHEDULE_KIND_SET.has(kind)) {
      throw new TypeError(`watchSnapshotV1 schedule[${index}].kind is invalid`);
    }

    // Garmin transmits only a compact presentation subset. Missing optional v1 fields use
    // the portable defaults; wrong concrete types fail closed instead of being stringified.
    contractString(item.id, `schedule[${index}].id`, 96);
    const time = contractString(item.time, `schedule[${index}].time`, 16);
    const title = contractString(item.title, `schedule[${index}].title`, 40);
    const route = contractString(item.route, `schedule[${index}].route`, 64);
    contractString(item.presentation, `schedule[${index}].presentation`, 16);
    const gate = contractString(item.gate, `schedule[${index}].gate`, 24);
    contractString(item.detail, `schedule[${index}].detail`, 120);
    return [time, title, route, gate];
  });
}

/**
 * Encodes the stable platform-neutral watchSnapshotV1 into the compact Garmin wire payload.
 * It never parses PDFs or infers/recalculates APZ, journey, compliance, gates or overnight.
 */
export function encodeWatchSnapshotV1ForGarmin(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new TypeError('watchSnapshotV1 must be an object');
  }
  if (snapshot.schemaVersion !== 1) throw new TypeError('unsupported watchSnapshotV1 schemaVersion');
  if (snapshot.source != null && snapshot.source !== 'canonical-roster') {
    throw new TypeError('Garmin accepts canonical-roster projections only');
  }

  const state = snapshot.state == null ? 'UNKNOWN' : snapshot.state;
  if (typeof state !== 'string' || !STATE_SET.has(state)) {
    throw new TypeError('invalid watchSnapshotV1 state');
  }

  const generated = epochSeconds(snapshot.generatedAtEpochMs);
  const validUntil = epochSeconds(snapshot.validUntilEpochMs);
  if (validUntil < generated) throw new TypeError('watchSnapshotV1 validity window is invalid');

  const payload = {
    v: 1,
    i: contractString(snapshot.contextId, 'contextId', 96),
    g: generated,
    u: validUntil,
    s: state,
    h: contractString(snapshot.headline, 'headline', 80),
    t: contractString(snapshot.primaryTime, 'primaryTime', 16),
    f: contractString(snapshot.currentFlight, 'currentFlight', 24),
    r: contractString(snapshot.currentRoute, 'currentRoute', 64),
    p: contractString(snapshot.presentationTime, 'presentationTime', 16),
    a: contractString(snapshot.presentationPlace, 'presentationPlace', 42),
    k: contractString(snapshot.gate, 'gate', 24),
    o: contractString(snapshot.overnight, 'overnight', 120),
    n: contractString(snapshot.nextFlight, 'nextFlight', 24),
    d: contractString(snapshot.nextDetail, 'nextDetail', 120),
    c: premiumMask(snapshot.premiumAccess),
    q: scheduleRows(snapshot.schedule),
  };

  // Optional unknown v1 fields are ignored by design. Premium raw enrichment has no direct
  // Garmin wire key, so traffic/pickup/health/Live Ops payloads cannot leak through this adapter.
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes > MAX_WIRE_BYTES) throw new RangeError(`Garmin payload exceeds ${MAX_WIRE_BYTES} bytes (${bytes})`);
  return payload;
}

export function encodeWatchSnapshotV1ForGarminJson(snapshot) {
  return JSON.stringify(encodeWatchSnapshotV1ForGarmin(snapshot));
}

export { CAPABILITY_BITS, MAX_WIRE_BYTES };
