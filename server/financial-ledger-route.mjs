import { appendFinancialRecord, readFinancialLedger, FinancialLedgerError, ledgerOwner } from './financial-ledger.mjs';
import { createFinancialSqlStore } from './financial-ledger-sql.mjs';
import { queryUpcomingFinancialForecast } from '../shared/financialUpcoming.mjs';
import { canonicalCaptureRequest } from './financial-canonical-capture.mjs';
export const FINANCIAL_LEDGER_PATH = '/api/platform/finance/history';
export const FINANCIAL_UPCOMING_PATH = '/api/platform/finance/upcoming';
export const FINANCIAL_CAPTURE_PATH = '/api/platform/finance/capture';
const send = (res, status, value) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(value)); };
async function readInput(req, limit = 16384) {
  const parts = []; let size = 0;
  for await (const part of req) { const bytes = Buffer.from(part); size += bytes.length; if (size > limit) throw new FinancialLedgerError('FINANCIAL_INPUT_TOO_LARGE', 413); parts.push(bytes); }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts))); }
  catch { throw new FinancialLedgerError('FINANCIAL_INVALID_JSON'); }
}
// Default off. Enabling is a separate operational step after the reviewed
// additive migration; neither this handler nor startup applies migrations.
export function createFinancialLedgerHandler({ enabled = () => false, identityProvider, poolProvider, allowedOrigin = () => '', storeFactory = createFinancialSqlStore, now = () => new Date() } = {}) {
  return async (req, res, url) => {
    if (![FINANCIAL_LEDGER_PATH, FINANCIAL_UPCOMING_PATH, FINANCIAL_CAPTURE_PATH].includes(url.pathname)) return false;
    const capture = url.pathname === FINANCIAL_CAPTURE_PATH;
    if (capture && req.method !== 'POST') { res.setHeader('Allow','POST'); send(res,405,{ok:false,code:'METHOD_NOT_ALLOWED'}); return true; }
    const upcoming = url.pathname === FINANCIAL_UPCOMING_PATH;
    if (upcoming && req.method !== 'GET') { res.setHeader('Allow', 'GET'); send(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' }); return true; }
    if (!['GET', 'POST'].includes(req.method)) { res.setHeader('Allow', 'GET, POST'); send(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' }); return true; }
    try {
      const identity = await identityProvider(req); ledgerOwner(identity);
      if (!enabled()) { send(res, 503, { ok: false, state: 'unavailable', code: 'FINANCIAL_LEDGER_NOT_ENABLED' }); return true; }
      if (upcoming) {
        const query = [...url.searchParams];
        if (query.length > 1 || query.some(([key, value]) => key !== 'category' || !['allowance', 'advance', 'payroll', 'vacation'].includes(value))) throw new FinancialLedgerError('FINANCIAL_INVALID_QUERY');
        const db = await poolProvider();
        if (!db) throw new FinancialLedgerError('FINANCIAL_HISTORY_UNAVAILABLE', 503);
        const records = await storeFactory(db).list(ledgerOwner(identity));
        send(res, 200, { ok: true, ...queryUpcomingFinancialForecast({ identity, records, now: now(), category: url.searchParams.get('category') ?? undefined }) });
        return true;
      }
      const keys = [...url.searchParams.keys()];
      if (keys.some(key => !['periodStart', 'periodEnd', 'aggregationLevel'].includes(key)) || new Set(keys).size !== keys.length || (req.method === 'POST' && keys.length)) throw new FinancialLedgerError('FINANCIAL_INVALID_QUERY');
      if (req.method === 'POST') {
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new FinancialLedgerError('FINANCIAL_JSON_REQUIRED', 415);
        const origin = req.headers.origin;
        const bearer = /^Bearer\s+\S+$/i.test(req.headers.authorization || '');
        if ((origin && (!allowedOrigin() || origin !== allowedOrigin())) || (!origin && !bearer)) throw new FinancialLedgerError('FINANCIAL_ORIGIN_REQUIRED', 403);
      }
      const db = await poolProvider();
      if (!db) throw new FinancialLedgerError('FINANCIAL_HISTORY_UNAVAILABLE', 503);
      const store = storeFactory(db);
      if (capture) { send(res,200,{ok:true,...await canonicalCaptureRequest({identity,input:await readInput(req,262144),store})}); return true; }
      if (req.method === 'GET') {
        const result = await readFinancialLedger({ store, identity, periodStart: url.searchParams.get('periodStart'), periodEnd: url.searchParams.get('periodEnd'), aggregationLevel: url.searchParams.get('aggregationLevel') || 'item' });
        send(res, 200, { ok: true, ...result });
      } else {
        const receipt = await appendFinancialRecord({ store, identity, input: await readInput(req) });
        send(res, receipt.replayed ? 200 : 201, { ok: true, receipt });
      }
    } catch (error) {
      const known = error instanceof FinancialLedgerError;
      const schema = error?.code === 'ER_NO_SUCH_TABLE' || error?.code === 'ER_BAD_FIELD_ERROR';
      const status = known ? error.status : 503;
      send(res, status, { ok: false, ...(status === 503 ? { state: 'unavailable' } : {}), code: known ? error.code : schema ? 'FINANCIAL_MIGRATION_REQUIRED' : 'FINANCIAL_HISTORY_UNAVAILABLE' });
    }
    return true;
  };
}
