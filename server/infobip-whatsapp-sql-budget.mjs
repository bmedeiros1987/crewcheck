// mysql2 promises do not cancel SQL when Promise.race wins. Destroy the owned
// connection on deadline, reject late operations and release late acquisitions.
// No pool construction, session settings, retries or production registration.
export function createInfobipSqlBudget(db, {transactionMs = 8_000, queryMs = 2_000} = {}) {
  if (!db?.getConnection || !Number.isInteger(transactionMs) || transactionMs < 1 || transactionMs > 8_000 ||
      !Number.isInteger(queryMs) || queryMs < 1 || queryMs > 2_000) throw Error('INFOBIP_SQL_BUDGET');
  return async run => {
    let raw, stopped = false, totalTimer;
    const startedAt = performance.now(), controller = new AbortController();
    const fail = () => Error('INFOBIP_STATE_UNAVAILABLE');
    const stop = () => { if (stopped) return; stopped = true; controller.abort(); try { raw?.destroy(); } catch {} };
    const deadline = new Promise((_, reject) => { totalTimer = setTimeout(() => {stop(); reject(fail());}, transactionMs); });
    const work = async () => {
      raw = await db.getConnection();
      if (stopped) { try { raw.release(); } catch {} throw fail(); }
      if (typeof raw.destroy !== 'function') throw fail();
      const call = async (method, args = []) => {
        if (stopped) throw fail();
        let timer;
        try { return await Promise.race([
          Promise.resolve().then(() => {if (stopped) throw fail(); return raw[method](...args);}),
          new Promise((_, reject) => {timer = setTimeout(() => {stop(); reject(fail());}, queryMs);}),
        ]); } finally {clearTimeout(timer);}
      };
      const c = {query: (...args) => call('query', args), signal: controller.signal,
        remainingMs: () => Math.max(0, transactionMs - (performance.now() - startedAt))};
      try {
        await call('beginTransaction');
        const result = await run(c);
        await call('commit');
        return result;
      } catch { if (!stopped) {try {await call('rollback');} catch {stop();}} throw fail(); }
    };
    try {return await Promise.race([work(), deadline]);}
    catch {throw fail();}
    finally {clearTimeout(totalTimer); if (raw && !stopped) {try {raw.release();} catch {stop();}}}
  };
}
