// Separate pilot registry; never edits roster/account tables or the general TV registry.
const TABLE = 'crewcheck_tv_pilot_registry';
const safeCodes = new Set(['ER_CON_COUNT_ERROR','ER_USER_LIMIT_REACHED','ER_TOO_MANY_USER_CONNECTIONS','ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR','ER_ACCESS_DENIED_ERROR','ER_TABLEACCESS_DENIED_ERROR','ER_LOCK_WAIT_TIMEOUT','ER_LOCK_DEADLOCK','ECONNREFUSED','ETIMEDOUT','PROTOCOL_CONNECTION_LOST']);
const domainCodes = new Set(['database_unavailable','tv_pilot_migration_required','invalid_registry']);
let lastLog = '', lastLogAt = 0;
async function guarded(stage, operation) {
  try { return await operation(); }
  catch (error) {
    const code = safeCodes.has(error?.code) ? error.code : domainCodes.has(error?.message) ? error.message : 'registry_operation_failed';
    const key = stage + ':' + code;
    if (key !== lastLog || Date.now() - lastLogAt > 30000) {
      lastLog = key; lastLogAt = Date.now();
      console.warn('[tv:registry] ' + JSON.stringify({ stage, code }));
    }
    throw error;
  }
}
export function createPilotStore(getDatabase) {
  return {
    async initialize() {
      return guarded('initialize', async () => {
        const db = await getDatabase();
        if (!db) throw new Error('database_unavailable');
        await db.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (id TINYINT PRIMARY KEY, payload JSON NOT NULL)`);
        await db.query(`INSERT IGNORE INTO ${TABLE} (id,payload) VALUES (1,$1)`, [JSON.stringify({ pairings: {}, devices: {}, limits: {} })]);
      });
    },
    async check() {
      return guarded('check', async () => {
        const db = await getDatabase();
        if (!db) throw new Error('database_unavailable');
        const r = await db.query(`SELECT id FROM ${TABLE} WHERE id=1`);
        if (!r.rows?.length) throw new Error('tv_pilot_migration_required');
      });
    },
    async transaction(fn) {
      return guarded('transaction', async () => {
        const db = await getDatabase();
        if (!db) throw new Error('database_unavailable');
        const client = await db.connect();
        try {
          await client.query('START TRANSACTION');
          const result = await client.query(`SELECT payload FROM ${TABLE} WHERE id=1 FOR UPDATE`);
          if (!result.rows?.[0]) throw new Error('tv_pilot_migration_required');
          const raw = result.rows[0].payload;
          const state = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (!state || Array.isArray(state) || typeof state !== 'object') throw new Error('invalid_registry');
          const value = await fn(state);
          await client.query(`UPDATE ${TABLE} SET payload=$1 WHERE id=1`, [JSON.stringify(state)]);
          await client.query('COMMIT');
          return value;
        } catch (error) {
          try { await client.query('ROLLBACK'); } catch {}
          throw error;
        } finally { client.release(); }
      });
    },
  };
}
