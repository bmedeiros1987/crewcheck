import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hotelSchemaMetadata, hotelEngineMetadata } from './fixtures/hotel-schema.mjs';
import { mysqlAdapter } from '../server/mysql-platform-adapter.mjs';
import { associateHotel, patchHotel, hotelProjection, reconcileHotels } from '../server/hotel-stay-model.mjs';
import { hotelReadiness, runHotelTransaction } from '../server/hotel-stay-repository.mjs';

const legacy = (extra = {}) => ({ id: 'synthetic-stay', owner_email: 'owner-A', roster_key: '2030-01',
  stay_date: '2030-01-01', airport: 'AAA', hotel_name: 'Source A', hotel_key: 'source-a',
  room_cipher: 'synthetic-ciphertext', share_same_hotel: true, share_with_visitors: false,
  presentation_time: '07:00', lead_minutes: 90, row_version: '0', binding_id: null,
  binding_evidence: null, manual_hotel_override: null, hotel_source_snapshot: null, ...extra });
const association = { action: 'associate', id: 'synthetic-stay', owner: 'owner-A', rosterKey: '2030-01', expectedVersion: '0',
  confirmation: 'associate-this-existing-stay', occurrenceRef: 'official-occurrence-1', source: 'verified-test-source', at: '2030-01-01T00:00:00Z' };
const patch = (version, hotelName = 'Manual B') => ({ action: 'patch', id: 'synthetic-stay', owner: 'owner-A', rosterKey: '2030-01',
  bindingId: 'synthetic-stay', expectedVersion: version, hotelName, at: '2030-01-01T01:00:00Z' });
const observation = (extra = {}) => ({ occurrenceRef: 'official-occurrence-1', source: 'verified-test-source',
  hotelName: 'Source C', revision: 'source-v1', expectedSourceRevision: null, ...extra });
const sync = observations => ({ action: 'sync', owner: 'owner-A', rosterKey: '2030-01', observations });
const options = { hotelKey: value => value.toLowerCase().replaceAll(' ', '-') };
// Real placeholder/result adapter over a synthetic, transactional native query API.
// Serial owner-lock queue is a test model, not an InnoDB integration test.
function database(initial = [legacy()], { ready = true, unique = true, fail = null, profileExists = true, schemaPatch = null, enginePatch = null, indexPrefix = null } = {}) {
  let rows = structuredClone(initial), tail = Promise.resolve(); const log = [];
  const native = { async getConnection() {
    let unlock, backup;
    return { release() {}, async query(sql, p) {
      log.push({ sql, p });
      if (sql.includes('information_schema.COLUMNS')) return [ready ? hotelSchemaMetadata().map(row => row.column_name === schemaPatch?.column_name ? { ...row, ...schemaPatch } : row) : []];
      if (sql.includes('information_schema.TABLES')) return [hotelEngineMetadata().map(row => row.table_name === enginePatch?.table_name ? { ...row, ...enginePatch } : row)];
      if (sql.includes('information_schema.STATISTICS')) return [unique ? ['owner_email', 'binding_id'].map((column_name, i) => ({ index_name: 'binding', column_name, seq_in_index: i + 1, sub_part: indexPrefix, index_type: 'BTREE' })) : []];
      if (sql === 'BEGIN') return [{}];
      if (sql.startsWith('SELECT email')) {
        const previous = tail; tail = new Promise(resolve => { unlock = resolve; }); await previous;
        backup = structuredClone(rows); return [profileExists ? [{ email: p[0] }] : []];
      }
      if (sql === 'COMMIT') { unlock?.(); return [{}]; }
      if (sql === 'ROLLBACK') { if (backup) rows = backup; unlock?.(); return [{}]; }
      if (sql.startsWith('SELECT id FROM crewcheck_platform_rosters')) return [[{ id: 'synthetic-roster' }]];
      if (sql.startsWith('SELECT *')) return [structuredClone(rows.filter(row => row.owner_email === p[0] && (row.roster_key === p[1] || row.id === p[2])))];
      if (sql.startsWith('UPDATE crewcheck_platform_stays')) {
        if (fail === 'deadlock') throw Object.assign(new Error('synthetic deadlock'), { code: 'ER_LOCK_DEADLOCK' });
        if (fail === 'constraint') throw Object.assign(new Error('synthetic legacy constraint'), { code: 'ER_DUP_ENTRY' });
        // mysqlStatement expands placeholders by occurrence, so the extra $11
        // roster assignment is the eighth positional value before the WHERE.
        const row = rows.find(row => row.id === p[8] && row.owner_email === p[9] && String(row.row_version) === p[10]);
        if (!row || fail === 'cas') return [{ affectedRows: 0 }];
        Object.assign(row, { binding_id: p[0], binding_evidence: p[1], manual_hotel_override: p[2],
          hotel_source_snapshot: p[3], hotel_name: p[4], hotel_key: p[5], row_version: p[6], roster_key: p[7] });
        return [{ affectedRows: 1 }];
      }
      throw new Error('Unexpected SQL: ' + sql);
    } };
  } };
  return { db: mysqlAdapter(native), get rows() { return structuredClone(rows); }, log };
}
test('schema and unique binding index absent: PATCH fails closed; sync only reports pending', async () => {
  for (const state of [{ ready: false }, { unique: false }]) {
    const d = database(undefined, state);
    assert.equal(await hotelReadiness(await d.db.connect()), false);
    await assert.rejects(runHotelTransaction(d.db, association, options), { code: 'HOTEL_SCHEMA_NOT_READY' });
    assert.equal((await runHotelTransaction(d.db, sync([observation()]), options)).status, 'review-required');
    assert.equal(d.log.some(q => /^(BEGIN|UPDATE|INSERT|DELETE|ALTER)/.test(q.sql)), false);
  }
});
test('incompatible types, nullability, defaults, engines and prefix uniqueness fail closed', async () => {
  const cases = [
    { schemaPatch: { column_name: 'binding_id', character_maximum_length: 32 } },
    { schemaPatch: { column_name: 'binding_id', is_nullable: 'NO' } },
    { schemaPatch: { column_name: 'manual_hotel_override', data_type: 'text', column_type: 'text' } },
    { schemaPatch: { column_name: 'binding_evidence', column_default: '{}' } },
    { schemaPatch: { column_name: 'row_version', column_type: 'bigint' } },
    { schemaPatch: { column_name: 'row_version', is_nullable: 'YES' } },
    { schemaPatch: { column_name: 'row_version', column_default: '1' } },
    ...['crewcheck_platform_profiles','crewcheck_platform_rosters','crewcheck_platform_stays'].map(table_name => ({ enginePatch: { table_name, engine: 'MyISAM' } })),
    { indexPrefix: 16 },
  ];
  for (const metadata of cases) {
    const d = database(undefined, metadata);
    assert.equal(await hotelReadiness(await d.db.connect()), false);
    await assert.rejects(runHotelTransaction(d.db, association, options), { code: 'HOTEL_SCHEMA_NOT_READY' });
    assert.equal(d.log.some(item => /^(BEGIN|UPDATE|INSERT|DELETE|ALTER)/.test(item.sql)), false);
  }
});
test('NULL legacy and date/airport/name match never prove manual provenance or binding', () => {
  for (const roster_key of [null, '2030-01']) {
    const row = legacy({ roster_key });
    assert.equal(hotelProjection(row).manualOverride, false);
    assert.equal(hotelProjection(row).state, 'legacy-unbound');
    assert.throws(() => patchHotel(row, patch('0')), { code: 'HOTEL_BINDING_REVIEW_REQUIRED' });
    const result = reconcileHotels([row], [observation()], { owner: 'owner-A', rosterKey: '2030-01' });
    assert.equal(result.updates.length, 0); assert.equal(result.status, 'review-required');
  }
});
test('explicit association -> PATCH -> repeated sync preserves ID, room, grants, APZ and manual hotel', async () => {
  const d = database();
  await runHotelTransaction(d.db, association, options);
  await runHotelTransaction(d.db, patch('1'), options);
  const first = await runHotelTransaction(d.db, sync([observation()]), options);
  assert.equal(first.updates.length, 1);
  const before = d.rows;
  const second = await runHotelTransaction(d.db, sync([observation()]), options);
  assert.equal(second.updates.length, 0); assert.deepEqual(d.rows, before);
  const row = d.rows[0];
  assert.equal(row.hotel_name, 'Manual B'); assert.equal(row.id, 'synthetic-stay');
  for (const key of ['room_cipher', 'share_same_hotel', 'share_with_visitors', 'presentation_time', 'lead_minutes']) assert.equal(row[key], legacy()[key]);
  assert.equal(JSON.parse(row.hotel_source_snapshot).hotelName, 'Source C');
  assert.equal(hotelProjection(row).manualOverride, true);
  assert.equal(d.log.some(q => /^(DELETE|INSERT)/.test(q.sql)), false);
});
test('manual -> unreferenced source sync does not duplicate, delete or overwrite; absence is not cancellation', async () => {
  const d = database(); await runHotelTransaction(d.db, association, options); await runHotelTransaction(d.db, patch('1'), options);
  const before = d.rows;
  const result = await runHotelTransaction(d.db, sync([{ hotelName: 'Source A', stayDate: '2030-01-01', airport: 'AAA' }]), options);
  assert.equal(result.status, 'review-required'); assert.deepEqual(d.rows, before);
  await runHotelTransaction(d.db, sync([]), options); assert.deepEqual(d.rows, before);
});
test('explicitly selected legacy NULL roster row is linked in place; NULL alone does not mark it manual', async () => {
  const d = database([legacy({ roster_key: null })]);
  assert.equal(hotelProjection(d.rows[0]).manualOverride, false);
  await runHotelTransaction(d.db, association, options);
  assert.equal(d.rows[0].roster_key, '2030-01'); assert.equal(d.rows[0].id, 'synthetic-stay');
  assert.equal(hotelProjection(d.rows[0]).manualOverride, false);
  await runHotelTransaction(d.db, patch('1'), options);
  await runHotelTransaction(d.db, sync([observation()]), options);
  assert.equal(d.rows.length, 1); assert.equal(d.rows[0].hotel_name, 'Manual B');
});
test('another device / ABA / values beyond JS safe integer cannot reuse old draft version', () => {
  let row = associateHotel(legacy({ row_version: '9007199254740992' }), { ...association, expectedVersion: '9007199254740992' });
  const baseline = row.row_version;
  row = patchHotel(row, patch(baseline, 'A')); row = patchHotel(row, patch(row.row_version, 'B')); row = patchHotel(row, patch(row.row_version, 'A'));
  assert.equal(row.row_version, '9007199254740996');
  assert.throws(() => patchHotel(row, patch(baseline, 'stale')), { code: 'HOTEL_VERSION_CONFLICT' });
});
test('concurrent devices: one CAS winner; loser rolls back, stale lost-response retry is conflict', async () => {
  const d = database(); await runHotelTransaction(d.db, association, options);
  const results = await Promise.allSettled(['A', 'B'].map(name => runHotelTransaction(d.db, patch('1', name), options)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'HOTEL_VERSION_CONFLICT');
  assert.equal(d.rows[0].row_version, '2');
  await assert.rejects(runHotelTransaction(d.db, patch('1', d.rows[0].hotel_name), options), { code: 'HOTEL_VERSION_CONFLICT' });
});
test('PATCH racing sync and concurrent sync retain manual override without duplicate source writes', async () => {
  const d = database(); await runHotelTransaction(d.db, association, options);
  const results = await Promise.allSettled([runHotelTransaction(d.db, patch('1'), options), runHotelTransaction(d.db, sync([observation()]), options)]);
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'fulfilled');
  assert.equal(d.rows[0].hotel_name, 'Manual B');
  await Promise.all([runHotelTransaction(d.db, sync([observation()]), options), runHotelTransaction(d.db, sync([observation()]), options)]);
  assert.equal(d.rows[0].row_version, '3'); assert.equal(d.rows.length, 1);
});
test('foreign account/binding and same-day second stay cannot redirect explicit row', async () => {
  const d = database([legacy(), legacy({ id: 'second' }), legacy({ id: 'foreign', owner_email: 'owner-B' })]);
  await runHotelTransaction(d.db, association, options);
  await assert.rejects(runHotelTransaction(d.db, { ...patch('1'), bindingId: 'second' }, options), { code: 'HOTEL_BINDING_REVIEW_REQUIRED' });
  await assert.rejects(runHotelTransaction(d.db, { ...patch('1'), id: 'foreign' }, options), { code: 'HOTEL_NOT_FOUND' });
  assert.equal(d.rows.length, 3);
});
test('source reordering, repeated revision with changed contents, and invalid override all require review', () => {
  let row = associateHotel(legacy(), association);
  row = reconcileHotels([row], [observation()], { owner: 'owner-A', rosterKey: '2030-01' }).updates[0].row;
  for (const obs of [observation({ revision: 'older' }), observation({ hotelName: 'changed' })]) {
    const result = reconcileHotels([row], [obs], { owner: 'owner-A', rosterKey: '2030-01' });
    assert.equal(result.updates.length, 0); assert.equal(result.status, 'review-required');
  }
  const corrupt = { ...row, manual_hotel_override: '{invalid' };
  assert.equal(reconcileHotels([corrupt], [observation({ revision: 'v2', expectedSourceRevision: 'source-v1' })], { owner: 'owner-A', rosterKey: '2030-01' }).updates.length, 0);
});
test('duplicate source occurrence and duplicate bindings never choose the first match', () => {
  const row = associateHotel(legacy(), association);
  for (const [rows, observations] of [[[row], [observation(), observation({ hotelName: 'different' })]],
    [[row, { ...row, id: 'duplicate', binding_evidence: { ...row.binding_evidence, stayId: 'duplicate' } }], [observation()]]]) {
    const result = reconcileHotels(rows, observations, { owner: 'owner-A', rosterKey: '2030-01' });
    assert.equal(result.updates.length, 0); assert.equal(result.status, 'review-required');
  }
  assert.equal(reconcileHotels([row], [], { owner: 'owner-A', rosterKey: '2030-01' }).status, 'review-required');
});
test('sync winning before PATCH makes the original device baseline stale', async () => {
  const d = database(); await runHotelTransaction(d.db, association, options);
  const results = await Promise.allSettled([runHotelTransaction(d.db, sync([observation()]), options), runHotelTransaction(d.db, patch('1'), options)]);
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].reason.code, 'HOTEL_VERSION_CONFLICT');
  assert.equal(d.rows[0].hotel_name, 'Source C');
});
test('constraint, deadlock and rowCount=0 roll back without deletion/merge or automatic retry', async () => {
  for (const fail of ['constraint', 'deadlock', 'cas']) {
    const d = database(undefined, { fail }); const before = d.rows;
    await assert.rejects(runHotelTransaction(d.db, association, options));
    assert.deepEqual(d.rows, before); assert.equal(d.log.filter(q => q.sql === 'ROLLBACK').length, 1);
    assert.equal(d.log.filter(q => q.sql.startsWith('UPDATE')).length, 1);
  }
});
test('account already deleted cannot PATCH or recreate hotel data', async () => {
  const d = database(undefined, { profileExists: false }); const before = d.rows;
  await assert.rejects(runHotelTransaction(d.db, association, options), /HOTEL_OWNER_UNAVAILABLE/);
  assert.deepEqual(d.rows, before);
  assert.equal(d.log.some(q => /^(UPDATE|INSERT|DELETE)/.test(q.sql)), false);
});
test('explicit clear CAS uses linked source snapshot and increments version', () => {
  let row = associateHotel(legacy(), association); row = patchHotel(row, patch('1'));
  assert.throws(() => patchHotel(row, { ...patch('2'), clearOverride: true }), { code: 'HOTEL_SOURCE_REVIEW_REQUIRED' });
  row = reconcileHotels([row], [observation()], { owner: 'owner-A', rosterKey: '2030-01' }).updates[0].row;
  row = patchHotel(row, { ...patch('3'), clearOverride: true });
  assert.equal(row.hotel_name, 'Source C'); assert.equal(row.manual_hotel_override, null); assert.equal(row.row_version, '4');
});
test('candidate migration is additive, contains no backfill or destructive DDL, and route integration uses candidate repository', () => {
  const sql = readFileSync(new URL('../migrations/20261019_001_hotel_binding_candidate.sql', import.meta.url), 'utf8');
  assert.match(sql, /NOT EXECUTED/); assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /\b(UPDATE|DELETE|DROP|INSERT)\b/i);
  const platform = readFileSync(new URL('../server/platform.mjs', import.meta.url), 'utf8');
  assert.match(platform, /import .*hotel-stay-repository/);
});
