// Pilot store uses a single locked JSON row. Bounded device/session cardinality;
// replace with normalized tables before scaling. No in-memory auth in production.
export function createMysqlTvStore(getDatabase) {
  return {
    async transaction(fn) {
      const db = await getDatabase();
      if (!db) throw new Error("database_unavailable");
      const connection = await db.connect();
      try {
        await connection.query("START TRANSACTION");
        const result = await connection.query(
          "SELECT payload FROM crewcheck_tv_registry WHERE id=1 FOR UPDATE",
        );
        if (!result.rows[0]) throw new Error("tv_migration_required");
        const payload = result.rows[0].payload;
        const state =
          typeof payload === "string" ? JSON.parse(payload) : payload;
        const value = await fn(state);
        await connection.query(
          "UPDATE crewcheck_tv_registry SET payload=$1 WHERE id=1",
          [JSON.stringify(state)],
        );
        await connection.query("COMMIT");
        return value;
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      } finally {
        connection.release();
      }
    },
  };
}
