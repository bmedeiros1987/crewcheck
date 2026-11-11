// mysql2 promises do not cancel SQL when Promise.race wins. Destroy the owned
// connection on deadline, reject late operations and release late acquisitions.
// No pool construction, session-default settings, retries or registration.
// Only this owner can establish the active next-transaction RR capability.
const activeRepeatableRead = new WeakSet();
export const isOwnedInfobipRepeatableRead = c => activeRepeatableRead.has(c) && !c.signal.aborted;
export function createInfobipSqlBudget(db, {transactionMs = 8_000, queryMs = 2_000, repeatableRead = false} = {}) {
  if (!db?.getConnection || !Number.isInteger(transactionMs) || transactionMs < 1 || transactionMs > 8_000 ||
      !Number.isInteger(queryMs) || queryMs < 1 || queryMs > 2_000 || typeof repeatableRead !== 'boolean') throw Error('INFOBIP_SQL_BUDGET');
  return async run => {
    let raw, client, stopped = false, ended = false, totalTimer;
    const startedAt = performance.now(), controller = new AbortController();
    const fail = () => Error('INFOBIP_STATE_UNAVAILABLE');
    const stop = () => { if (stopped) return; stopped = true; if(client)activeRepeatableRead.delete(client); controller.abort(); try { raw?.destroy(); } catch {} };
    const deadline = new Promise((_, reject) => { totalTimer = setTimeout(() => {stop(); reject(fail());}, transactionMs); });
    const work = async () => {
      let acquisitionTimer;
      const acquisition=Promise.resolve().then(()=>{
        if(stopped||ended)throw fail();return db.getConnection();
      }).then(connection=>{
        // A late unused acquisition has no transaction or SET to unwind. It
        // must be released exactly once, never handed to the expired callback.
        if(stopped||ended){try{connection?.release();}catch{}throw fail();}
        raw=connection;return connection;
      });
      try {
        if(repeatableRead)await Promise.race([acquisition,new Promise((_,reject)=>{
          acquisitionTimer=setTimeout(()=>{stop();reject(fail());},queryMs);
        })]);
        else await acquisition; // Preserve the ordinary/v1 acquisition contract.
      } finally {clearTimeout(acquisitionTimer);}
      if (typeof raw.destroy !== 'function') throw fail();
      const call = async (method, args = []) => {
        if (stopped || ended) throw fail();
        let timer;
        try { return await Promise.race([
          Promise.resolve().then(() => {if (stopped || ended) throw fail(); return raw[method](...args);}),
          new Promise((_, reject) => {timer = setTimeout(() => {stop(); reject(fail());}, queryMs);}),
        ]); } finally {clearTimeout(timer);}
      };
      const c = {query: (...args) => call('query', args), signal: controller.signal,
        remainingMs: () => Math.max(0, transactionMs - (performance.now() - startedAt))};
      client=c;let began=false;
      try {
        if(repeatableRead){await call('query',['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ']);}
        await call('beginTransaction');
        began=true;if(repeatableRead)activeRepeatableRead.add(c);
        const result = await run(c);
        activeRepeatableRead.delete(c);
        await call('commit');
        return result;
      } catch {
        activeRepeatableRead.delete(c);
        // Do not leak an unconsumed next-transaction setting into the pool.
        if(repeatableRead&&!began)stop();
        if (!stopped) {try {await call('rollback');} catch {stop();}} throw fail();
      }
    };
    try {return await Promise.race([work(), deadline]);}
    catch {throw fail();}
    finally {ended=true;if(client)activeRepeatableRead.delete(client);clearTimeout(totalTimer); if (raw && !stopped) {try {raw.release();} catch {stop();}}}
  };
}
