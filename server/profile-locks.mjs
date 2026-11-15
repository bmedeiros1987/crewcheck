// Narrow reuse of PR #891 ddcdddd46842cd48361cdabff84818ab042f9c63 platform-sharing.mjs.
// Future sharing composition must import/re-export this single helper, not copy it.
// No transport/irreversible effects inside action: only a confirmed action rollback
// may be retried. Commit/connection/cleanup uncertainty requires physical discard.
const transactionClients=new WeakSet();
export function assertTransactionClient(client){
  if(!client||!transactionClients.has(client))throw Object.assign(new Error('PROFILE_TX_CLIENT_REQUIRED'),{code:'PROFILE_TX_CLIENT_REQUIRED',status:503});
}
const uncertain=code=>Object.assign(new Error(code),{code,status:503});
const connectionFailure=error=>error?.fatal===true||['PROTOCOL_CONNECTION_LOST','ECONNRESET','ETIMEDOUT','EPIPE','PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR','ER_SERVER_SHUTDOWN'].includes(error?.code);
export async function withTransaction(db, action, { repeatableRead = false } = {}) {
  for (let attempt = 0; ; attempt++) {
    const client = await db.connect();
    let phase='setup',discard=false;
    try {
      // SET TRANSACTION affects this transaction only, never pooled session/global defaults.
      if (repeatableRead) await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await client.query('BEGIN');
      phase='action';
      let result;transactionClients.add(client);
      try { result = await action(client); } finally { transactionClients.delete(client); }
      phase='commit';
      await client.query('COMMIT');
      phase='done';
      return result;
    } catch (error) {
      let rolledBack=false;
      try { await client.query('ROLLBACK');rolledBack=true; } catch { discard=true; }
      if(phase==='commit'||connectionFailure(error))discard=true;
      if(discard||!rolledBack)throw uncertain('PROFILE_TX_OUTCOME_UNCERTAIN');
      if (phase==='action' && error.code === 'ER_LOCK_DEADLOCK' && attempt < 1) continue;
      throw error;
    } finally {
      if(discard){
        // Never return an uncertain connection to a pool, even if a driver lacks
        // a discard hook or destroying the connection itself fails.
        if(typeof client.discard!=='function')throw uncertain('PROFILE_TX_DISCARD_REQUIRED');
        try { await client.discard(); } catch { throw uncertain('PROFILE_TX_DISCARD_UNCERTAIN'); }
      } else client.release();
    }
  }
}

// Profile-bound callers retain the same lock order and transaction client.
export async function withProfileLocks(db, emails, action, options = {}) {
  return withTransaction(db, async client => {
    for (const email of [...new Set(emails)].sort()) {
      const found = await client.query('SELECT email FROM crewcheck_platform_profiles WHERE email=$1 FOR UPDATE', [email]);
      if (!found.rows.length) throw Object.assign(new Error('Usuário não localizado.'), { status: 404 });
    }
    return action(client);
  }, options);
}
