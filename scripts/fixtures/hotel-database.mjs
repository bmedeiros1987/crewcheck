import { mysqlAdapter } from '../../server/mysql-platform-adapter.mjs';
import { HOTEL_SCHEMA_COLUMNS } from '../../server/hotel-stay-model.mjs';
export const syntheticHotel = (extra = {}) => ({ id: 'stay-A', owner_email: 'owner-A', roster_key: '2030-01',
  stay_date: '2030-01-01', airport: 'AAA', hotel_name: 'Source A', hotel_key: 'source-a', room_cipher: 'synthetic-room',
  presentation_time: '07:00', lead_minutes: 90, share_same_hotel: true, share_with_visitors: true,
  binding_id: null, binding_evidence: null, manual_hotel_override: null, hotel_source_snapshot: null, row_version: '0', ...extra });
// Synthetic native driver exercised through the real mysqlAdapter. No connections,
// credentials or native database process. Locks model account serialization only.
export function hotelDatabase(initial = [syntheticHotel()], { ready = true, fail = null, profileExists = true } = {}) {
  let rows = structuredClone(initial), rosters = [{ id: 'roster-A', owner_email: 'owner-A', roster_key: '2030-01', active: true }], tail = Promise.resolve();
  const log = [];
  function connection() {
    let unlock, backup;
    return { release() {}, async query(sql, p = []) {
      log.push({ sql, p }); const q = sql.trim();
      if (q.includes('information_schema.COLUMNS')) return [(ready ? HOTEL_SCHEMA_COLUMNS : []).map(column_name => ({ column_name }))];
      if (q.includes('information_schema.STATISTICS')) return [[{ index_name: 'binding', column_name: 'owner_email', seq_in_index: 1 }, { index_name: 'binding', column_name: 'binding_id', seq_in_index: 2 }]];
      if (q === 'BEGIN') return [{}];
      if (q.startsWith('SELECT email')) { const previous = tail; tail = new Promise(resolve => { unlock = resolve; }); await previous;
        backup = { rows: structuredClone(rows), rosters: structuredClone(rosters) }; return [profileExists ? [{ email: p[0] }] : []]; }
      if (q === 'COMMIT') { unlock?.(); return [{}]; }
      if (q === 'ROLLBACK') { if (backup) { rows = backup.rows; rosters = backup.rosters; } unlock?.(); return [{}]; }
      if (q.startsWith('UPDATE crewcheck_platform_rosters')) { for (const row of rosters.filter(row => row.owner_email === p[0])) row.active = false; return [{ affectedRows: 1 }]; }
      if (q.startsWith('INSERT INTO crewcheck_platform_rosters')) {
        let row = rosters.find(row => row.owner_email === p[1] && row.roster_key === p[2]);
        if (!row) { row = { id: p[0], owner_email: p[1], roster_key: p[2] }; rosters.push(row); }
        Object.assign(row, { roster: p[3], compliance: p[4], gym: p[5], source_name: p[6], fingerprint: p[7], active: true });
        return [{ affectedRows: 1 }];
      }
      if (q.includes('FROM crewcheck_platform_rosters')) return [structuredClone(rosters.filter(row => row.owner_email === p[0] && (p.length < 2 ? row.active : row.roster_key === p[1])))];
      if (q.startsWith('SELECT s.*')) return [structuredClone(rows.filter(row => row.owner_email === p[0]))];
      if (q.startsWith('SELECT *')) return [structuredClone(rows.filter(row => row.owner_email === p[0] && (row.roster_key === p[1] || (p[2] != null && row.id === p[2]))))];
      if (q.startsWith('UPDATE crewcheck_platform_stays')) {
        if (fail) throw Object.assign(new Error('Synthetic write failure'), { code: fail });
        const row = rows.find(row => row.id === p[8] && row.owner_email === p[9] && String(row.row_version) === p[10]);
        if (!row) return [{ affectedRows: 0 }];
        Object.assign(row, { binding_id: p[0], binding_evidence: p[1], manual_hotel_override: p[2], hotel_source_snapshot: p[3], hotel_name: p[4], hotel_key: p[5], row_version: p[6], roster_key: p[7] });
        return [{ affectedRows: 1 }];
      }
      throw new Error('Unexpected synthetic SQL: ' + q);
    } };
  }
  const native = { query: (sql, p) => connection().query(sql, p), getConnection: async () => connection() };
  return { db: mysqlAdapter(native), log, get rows() { return structuredClone(rows); }, get rosters() { return structuredClone(rosters); } };
}
