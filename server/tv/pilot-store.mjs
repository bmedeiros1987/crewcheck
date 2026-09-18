// Separate pilot registry; never edits roster/account tables or the general TV registry.
const TABLE = 'crewcheck_tv_pilot_registry';
export function createPilotStore(getDatabase) {
  return {
    async initialize() {
      const db = await getDatabase();
      if (!db) throw new Error('database_unavailable');
      await db.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (id TINYINT PRIMARY KEY, payload JSON NOT NULL)`);
      await db.query(`INSERT IGNORE INTO ${TABLE} (id,payload) VALUES (1,$1)`, [JSON.stringify({ pairings: {}, devices: {}, limits: {} })]);
    },
    async check() {
      const db = await getDatabase();
      if (!db) throw new Error('database_unavailable');
      const r = await db.query(`SELECT id FROM ${TABLE} WHERE id=1`);
      if (!r.rows?.length) throw new Error('tv_pilot_migration_required');
    },
    async transaction(fn) {
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
    },
  };
}
