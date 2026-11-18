// Narrow reuse of PR #891 ddcdddd46842cd48361cdabff84818ab042f9c63 platform-sharing.mjs.
// Future sharing composition must import/re-export this single helper, not copy it.
// Lock existing profile rows in a fixed order; no migration, advisory lock or new table.
export async function withProfileLocks(db, emails, action, { repeatableRead = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    const client = await db.connect();
    try {
      // SET TRANSACTION affects this transaction only, never pooled session/global defaults.
      if (repeatableRead) await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await client.query('BEGIN');
      for (const email of [...new Set(emails)].sort()) {
        const found = await client.query('SELECT email FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE', [email]);
        if (!found.rows.length) throw Object.assign(new Error('Usuário não localizado.'), { status: 404 });
      }
      const result = await action(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error.code === 'ER_LOCK_DEADLOCK' && attempt < 1) continue;
      throw error;
    } finally { client.release(); }
  }
}
