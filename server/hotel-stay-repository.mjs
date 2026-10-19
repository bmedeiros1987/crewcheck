import { hotelSchemaReady, associateHotel, patchHotel, reconcileHotels } from './hotel-stay-model.mjs';

const unavailable = () => Object.assign(new Error('HOTEL_SCHEMA_NOT_READY'), { code: 'HOTEL_SCHEMA_NOT_READY', status: 503 });
// Metadata probe is read-only, not a migration or a global feature flag.
export async function hotelReadiness(db) {
  try {
    const result = await db.query(`SELECT COLUMN_NAME AS column_name,DATA_TYPE AS data_type,
      COLUMN_TYPE AS column_type,IS_NULLABLE AS is_nullable,COLUMN_DEFAULT AS column_default,
      CHARACTER_MAXIMUM_LENGTH AS character_maximum_length,EXTRA AS extra,GENERATION_EXPRESSION AS generation_expression FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crewcheck_platform_stays'`);
    const engines = await db.query(`SELECT TABLE_NAME AS table_name,ENGINE AS engine FROM information_schema.TABLES
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('crewcheck_platform_profiles','crewcheck_platform_rosters','crewcheck_platform_stays')`);
    if (!['crewcheck_platform_profiles','crewcheck_platform_rosters','crewcheck_platform_stays'].every(name =>
      engines.rows.some(row => row.table_name === name && String(row.engine).toLowerCase() === 'innodb'))) return false;
    if (!hotelSchemaReady(result.rows.map(row => row.column_name))) return false;
    const columns = new Map(result.rows.map(row => [row.column_name, row]));
    for (const name of ['binding_id','binding_evidence','manual_hotel_override','hotel_source_snapshot','row_version']) {
      const column = columns.get(name);
      if (column.generation_expression !== '' || /GENERATED/i.test(column.extra || '')) return false;
    }
    const binding = columns.get('binding_id'), version = columns.get('row_version');
    if (binding.data_type !== 'varchar' || Number(binding.character_maximum_length) !== 64
      || binding.is_nullable !== 'YES' || binding.column_default !== null) return false;
    for (const name of ['binding_evidence','manual_hotel_override','hotel_source_snapshot']) {
      const column = columns.get(name);
      if (column.data_type !== 'json' || column.is_nullable !== 'YES' || column.column_default !== null) return false;
    }
    if (version.data_type !== 'bigint' || !/^bigint(?:\(\d+\))? unsigned$/i.test(version.column_type || '')
      || version.is_nullable !== 'NO' || String(version.column_default) !== '0') return false;
    const index = await db.query(`SELECT INDEX_NAME AS index_name,COLUMN_NAME AS column_name,SEQ_IN_INDEX AS seq_in_index,
      SUB_PART AS sub_part,INDEX_TYPE AS index_type FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='crewcheck_platform_stays'
      AND NON_UNIQUE=0 ORDER BY INDEX_NAME,SEQ_IN_INDEX`);
    const groups = new Map();
    for (const row of index.rows) { const list = groups.get(row.index_name) || []; list.push(row); groups.set(row.index_name, list); }
    return [...groups.values()].some(columns => columns.length === 2
      && columns[0].column_name === 'owner_email' && columns[1].column_name === 'binding_id'
      && columns.every((column, i) => Number(column.seq_in_index) === i + 1 && column.sub_part === null && column.index_type === 'BTREE'));
  } catch { return false; }
}
async function persist(client, before, after, owner, hotelKey) {
  const encode = value => value == null ? null : typeof value === 'string' ? value : JSON.stringify(value);
  // Only explicit hotel metadata/projection columns. No room, grants or APZ writes.
  const result = await client.query(`UPDATE crewcheck_platform_stays SET binding_id=$1,binding_evidence=$2,
    manual_hotel_override=$3,hotel_source_snapshot=$4,hotel_name=$5,hotel_key=$6,row_version=$7,roster_key=$11,updated_at=CURRENT_TIMESTAMP(3)
    WHERE id=$8 AND owner_email=$9 AND row_version=$10`,
  [after.binding_id, encode(after.binding_evidence), encode(after.manual_hotel_override),
    encode(after.hotel_source_snapshot), after.hotel_name,
    hotelKey(after.hotel_name), after.row_version, before.id, owner, String(before.row_version), after.roster_key]);
  if (result.rowCount !== 1) throw Object.assign(new Error('HOTEL_VERSION_CONFLICT'), { code: 'HOTEL_VERSION_CONFLICT', status: 409 });
}
// Caller owns a transaction and profile -> roster locks, including the roster writer.
export async function reconcileHotelRoster(client, request, { hotelKey }) {
  if (!await hotelReadiness(client)) return { status: 'review-required', reason: 'schema-not-ready', updates: [] };
  const result = await client.query('SELECT *,CAST(row_version AS CHAR) AS row_version FROM crewcheck_platform_stays WHERE owner_email=$1 AND roster_key=$2 ORDER BY id FOR UPDATE', [request.owner, request.rosterKey]);
  const outcome = reconcileHotels(result.rows, request.observations, request);
  for (const update of outcome.updates) await persist(client, result.rows.find(row => row.id === update.row.id), update.row, request.owner, hotelKey);
  return outcome;
}
// All candidate paths acquire the same owner -> roster -> stable row order.
// No automatic retries: caller must reread after deadlock/CAS/constraint conflict.
export async function runHotelTransaction(db, request, { hotelKey }) {
  const client = await db.connect();
  let began = false;
  try {
    if (!await hotelReadiness(client)) {
      if (request.action === 'sync') return { status: 'review-required', reason: 'schema-not-ready', updates: [] };
      throw unavailable();
    }
    await client.query('BEGIN'); began = true;
    const profile = await client.query('SELECT email FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE', [request.owner]);
    if (profile.rows.length !== 1) throw Object.assign(new Error('HOTEL_OWNER_UNAVAILABLE'), { status: 409 });
    const roster = await client.query('SELECT id FROM crewcheck_platform_rosters WHERE owner_email=$1 AND roster_key=$2 FOR UPDATE', [request.owner, request.rosterKey]);
    if (roster.rows.length !== 1) throw Object.assign(new Error('HOTEL_ROSTER_UNAVAILABLE'), { status: 409 });
    // mysql2 may decode BIGINT as Number. Cast before transport to avoid precision loss.
    let outcome;
    if (request.action === 'sync') {
      outcome = await reconcileHotelRoster(client, request, { hotelKey });
    } else {
      const result = await client.query('SELECT *,CAST(row_version AS CHAR) AS row_version FROM crewcheck_platform_stays WHERE owner_email=$1 AND (roster_key=$2 OR id=$3) ORDER BY id FOR UPDATE', [request.owner, request.rosterKey, request.action === 'associate' ? request.id : null]);
      const before = result.rows.find(row => row.id === request.id);
      const after = request.action === 'associate' ? associateHotel(before, request)
        : request.action === 'patch' ? patchHotel(before, request)
          : (() => { throw new Error('INVALID_HOTEL_ACTION'); })();
      await persist(client, before, after, request.owner, hotelKey);
      outcome = { status: 'persisted', id: after.id, rowVersion: after.row_version };
    }
    await client.query('COMMIT'); began = false;
    return outcome;
  } catch (error) {
    if (began) await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
