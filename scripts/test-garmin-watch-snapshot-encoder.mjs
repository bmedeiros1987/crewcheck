import assert from 'node:assert/strict';
import {
  CAPABILITY_BITS,
  MAX_WIRE_BYTES,
  encodeWatchSnapshotV1ForGarmin,
  encodeWatchSnapshotV1ForGarminJson,
} from '../peripherals/garmin/bridge/encodeWatchSnapshotV1.mjs';

const base = {
  schemaVersion: 1,
  contextId: 'flight-LA3149-2026-09-24',
  generatedAtEpochMs: 1790290800000,
  validUntilEpochMs: 1790296200000,
  state: 'REPORTING',
  headline: 'APRESENTAÇÃO',
  primaryTime: '12:45',
  presentationTime: '12:45',
  presentationPlace: 'BSB',
  currentFlight: 'LA3149',
  currentRoute: 'BSB → GRU',
  gate: '24',
  overnight: '',
  nextFlight: 'LA3301',
  nextDetail: 'GRU → POA',
  source: 'canonical-roster',
  premiumAccess: false,
  schedule: [
    { id: '1', kind: 'flight', time: '12:45', title: 'LA3149', route: 'BSB→GRU', presentation: '12:45', gate: '24', detail: '' },
    { id: '2', kind: 'flight', time: '16:20', title: 'LA3301', route: 'GRU→POA', presentation: '', gate: '', detail: '' },
  ],
};

const free = encodeWatchSnapshotV1ForGarmin({
  ...base,
  trafficDetail: '42 min · pedágio R$ 9,80',
  hotelPickup: 'Van 05:10',
  changed: true,
  remoteStand: true,
  boardingTime: '13:15',
  eta: '14:55',
  connection: '01:20',
  futureOptionalField: 'ignored safely',
});

assert.equal(free.v, 1);
assert.equal(free.c, CAPABILITY_BITS.basicRoster, 'Free must keep basic roster and no Premium bits');
assert.equal(free.g, 1790290800);
assert.equal(free.u, 1790296200);
assert.equal(free.q.length, 2);
assert.equal(free.k, '24');
for (const forbidden of ['trafficDetail', 'hotelPickup', 'changed', 'remoteStand', 'boardingTime', 'eta', 'connection', 'futureOptionalField']) {
  assert.equal(Object.hasOwn(free, forbidden), false, `compact payload must not serialize ${forbidden}`);
}
assert.ok(Buffer.byteLength(JSON.stringify(free), 'utf8') <= MAX_WIRE_BYTES);

const premium = encodeWatchSnapshotV1ForGarmin({
  ...base,
  state: 'LEAVE_SOON',
  headline: 'SAIR EM 35 MIN',
  primaryTime: '11:40',
  premiumAccess: true,
});
assert.equal(premium.c, 63, 'current Premium model enables all advanced capability bits');
assert.ok(Buffer.byteLength(encodeWatchSnapshotV1ForGarminJson({ ...base, premiumAccess: true }), 'utf8') <= MAX_WIRE_BYTES);

// Old v1 peer: only the three required fields are present. Optional fields must use defaults.
const legacy = encodeWatchSnapshotV1ForGarmin({
  schemaVersion: 1,
  generatedAtEpochMs: base.generatedAtEpochMs,
  validUntilEpochMs: base.validUntilEpochMs,
});
assert.equal(legacy.s, 'UNKNOWN');
assert.equal(legacy.i, '');
assert.equal(legacy.h, '');
assert.equal(legacy.c, CAPABILITY_BITS.basicRoster, 'missing premiumAccess defaults to Free');
assert.deepEqual(legacy.q, [], 'missing schedule defaults to empty');

// Premium -> Free downgrade must only drop Premium bits; basic roster stays enabled.
const downgraded = encodeWatchSnapshotV1ForGarmin({ ...base, premiumAccess: false });
assert.equal(downgraded.c & CAPABILITY_BITS.basicRoster, CAPABILITY_BITS.basicRoster);
assert.equal(downgraded.c, 1);
assert.equal(downgraded.f, base.currentFlight);

assert.throws(() => encodeWatchSnapshotV1ForGarmin({ ...base, source: 'pdf-parser' }), /canonical-roster/);
assert.throws(() => encodeWatchSnapshotV1ForGarmin({ ...base, validUntilEpochMs: base.generatedAtEpochMs - 1 }), /validity window/);
assert.throws(() => encodeWatchSnapshotV1ForGarmin({ ...base, state: 'NOT_A_REAL_STATE' }), /invalid watchSnapshotV1 state/);
assert.throws(() => encodeWatchSnapshotV1ForGarmin({ ...base, contextId: 3149 }), /contextId must be a string/);
assert.throws(() => encodeWatchSnapshotV1ForGarmin({ ...base, gate: 24 }), /gate must be a string/);
assert.throws(() => encodeWatchSnapshotV1ForGarmin({ ...base, premiumAccess: 'true' }), /premiumAccess must be boolean/);
assert.throws(() => encodeWatchSnapshotV1ForGarmin({ ...base, schedule: 'not-array' }), /schedule must be an array/);
assert.throws(() => encodeWatchSnapshotV1ForGarmin({
  ...base,
  schedule: [{ ...base.schedule[0], kind: 'pdf-derived' }],
}), /schedule\[0\]\.kind is invalid/);
assert.throws(() => encodeWatchSnapshotV1ForGarmin({
  ...base,
  schedule: [{ ...base.schedule[0], gate: 24 }],
}), /schedule\[0\]\.gate must be a string/);

const optionalScheduleFields = encodeWatchSnapshotV1ForGarmin({
  ...base,
  schedule: [{ title: 'RESERVA' }],
});
assert.deepEqual(optionalScheduleFields.q[0], ['', 'RESERVA', '', '']);

const longSchedule = Array.from({ length: 12 }, (_, index) => ({
  id: `leg-${index}`,
  kind: 'flight',
  time: '10:00',
  title: `LEG-${index}`,
  route: 'AAA→BBB',
  presentation: '',
  gate: '',
  detail: '',
}));
const capped = encodeWatchSnapshotV1ForGarmin({ ...base, schedule: longSchedule });
assert.equal(capped.q.length, 8);

console.log('[Garmin encoder] PASS — stable v1 defaults, old-peer compatibility, Free roster downgrade and compact <=1 KiB wire payload guarded.');
