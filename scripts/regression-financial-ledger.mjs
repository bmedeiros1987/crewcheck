import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { appendFinancialRecord, readFinancialLedger } from '../server/financial-ledger.mjs';
import { createFinancialSqlStore } from '../server/financial-ledger-sql.mjs';
import { createFinancialLedgerHandler, FINANCIAL_LEDGER_PATH } from '../server/financial-ledger-route.mjs';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { financialLedgerErasureStatements } from '../server/financial-ledger-erasure.mjs';

// Offline transactional SQL protocol double: no credentials, sockets or real DB.
// Real MySQL DDL/concurrency still require a disposable-schema integration gate.
function database() {
  let state = { heads: {}, revisions: [] }, releaseLock, tail = Promise.resolve();
  const calls = [];
  const execute = async (sql, p = [], tx) => {
    calls.push({ sql, p }); const s = tx?.state || state, key = JSON.stringify(p.slice(0, 2));
    if (sql.startsWith('SELECT email FROM crewcheck_platform_profiles')) return { rows: db.deletedOwners?.has(p[0]) ? [] : [{email:p[0]}] };
    if (sql.startsWith('INSERT INTO crewcheck_financial_heads')) { s.heads[key] ??= 0; return { rows: [], rowCount: 1 }; }
    if (sql.startsWith('SELECT latest_revision')) return { rows: [{ latest_revision: s.heads[key] }] };
    if (sql.startsWith('SELECT request_hash')) return { rows: s.revisions.filter(x => x.owner_id === p[0] && x.idempotency_key === p[1]).map(x => ({ request_hash: x.request_hash, receipt: x.receipt })) };
    if (sql.startsWith('SELECT snapshot')) return { rows: s.revisions.filter(x => x.owner_id === p[0] && (p.length === 1 || (x.entry_id === p[1] && x.revision === p[2]))).slice(0, 10001).map(x => ({ snapshot: x.snapshot })) };
    if (sql.startsWith('INSERT INTO crewcheck_financial_revisions')) {
      if (s.revisions.some(x => x.owner_id === p[0] && (x.idempotency_key === p[3] || (x.entry_id === p[1] && x.revision === p[2])))) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      if (db.failInsert) throw new Error('synthetic disk failure');
      s.revisions.push(Object.fromEntries(['owner_id','entry_id','revision','idempotency_key','request_hash','snapshot','receipt'].map((k, i) => [k, p[i]]))); return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('UPDATE crewcheck_financial_heads')) { if (s.heads[key] !== p[3]) return { rowCount: 0 }; s.heads[key] = p[2]; return { rowCount: 1 }; }
    throw new Error('Unexpected SQL: ' + sql);
  };
  const db = { calls, get state() { return state; }, query: (sql, p) => execute(sql, p), async connect() {
    const before = tail; tail = new Promise(resolve => { releaseLock = resolve; }); const unlock = releaseLock; await before;
    const tx = { state: structuredClone(state) };
    return { async query(sql, p) {
      if (sql === 'BEGIN') return { rows: [] };
      if (sql === 'COMMIT') { state = tx.state; return { rows: [] }; }
      if (sql === 'ROLLBACK') return { rows: [] };
      return execute(sql, p, tx);
    }, release() { unlock(); } };
  } }; return db;
}
const A = { authenticated: true, role: 'owner', ownerId: 'synthetic-a@example.invalid' };
const B = { ...A, ownerId: 'synthetic-b@example.invalid' };
const input = (changes = {}) => ({ expectedRevision: 0, idempotencyKey: 'capture-1', sourceFingerprint: 'a'.repeat(64), action: 'capture_forecast', provenance: { kind: 'roster_snapshot', reference: 'roster-revision-1' }, record: { periodStart: '2032-04-07', periodEnd: '2032-04-13', currency: 'BRL', timezone: 'America/Sao_Paulo', amountMinor: 82500, category: 'allowance', aggregationLevel: 'week', status: 'forecast', sourceId: 'allowance:2032-04-07', ruleVersion: 'synthetic-v1' }, ...changes });
const db = database(), store = createFinancialSqlStore(db);
const write = (value, identity = A) => appendFinancialRecord({ store, identity, input: value });
const read = (identity = A) => readFinancialLedger({ store, identity, periodStart: '2032-04-01', periodEnd: '2032-04-30', aggregationLevel: 'week' });
const first = await write(input()); assert.equal(first.revision, 1);
assert.equal((await write(input())).replayed, true); assert.equal(db.state.revisions.length, 1);
await assert.rejects(write(input({ record: { ...input().record, amountMinor: 1 } })), { code: 'FINANCIAL_IDEMPOTENCY_CONFLICT' });
await assert.rejects(write(input({ idempotencyKey: 'another-request' })), { code: 'FINANCIAL_REVISION_CONFLICT' });
assert.equal((await write(input(), B)).revision, 1); assert.equal((await read(B)).records.length, 1);
for (const identity of [null, { ...A, role: 'visitor' }, { ...A, authenticated: false }]) await assert.rejects(write(input(), identity), { code: 'FINANCIAL_OWNER_REQUIRED' });
for (const bad of [{ ownerId: B.ownerId }, { record: { ...input().record, ownerId: B.ownerId } }, { record: { ...input().record, paymentDate: '2032-04-20' } }, { record: { ...input().record, amountMinor: 1.5 } }, { sourceFingerprint: 'unknown' }]) await assert.rejects(write(input(bad)));
// Independent persisted snapshot survives both removal and replacement of source.
// Reconstruct storage (simulated process restart), with no roster repository.
assert.equal((await createFinancialSqlStore(db).list(A.ownerId))[0].amountMinor, 82500);
assert.equal((await read()).totals[0].amountMinor, 82500);
const review = input({ expectedRevision: 1, idempotencyKey: 'review-2', action: 'report_statement', provenance: { kind: 'statement', reference: 'document-reviewed-2' }, record: { ...input().record, status: 'statement_reported', amountMinor: 83000 } });
assert.equal((await write(review)).id, first.id);
let result = await read(); assert.equal(result.records.length, 1); assert.equal(result.history.length, 2); assert.equal(result.totals[0].amountMinor, 83000); assert.equal(result.records[0].status, 'statement_reported');
assert.equal(JSON.stringify(result).includes('document-reviewed'), false);
const settle = input({ expectedRevision: 2, idempotencyKey: 'settle-3', action: 'record_settlement', provenance: { kind: 'settlement', reference: 'owner-settlement-3' }, record: { ...review.record, status: 'payment_confirmed', paymentDate: '2032-04-20' } });
assert.equal((await write(settle)).revision, 3); result = await read(); assert.equal(result.records.length, 1); assert.equal(result.totals[0].amountMinor, 83000); assert.equal(result.history.length, 3);
assert.equal(JSON.stringify(result).includes('owner-settlement'), false);
await assert.rejects(write(input({ expectedRevision: 3, idempotencyKey: 'downgrade' })), { code: 'FINANCIAL_STATUS_DOWNGRADE' });
await assert.rejects(write(input({ action: 'record_settlement', provenance: { kind: 'settlement', reference: 'synthetic' }, record: settle.record })), { code: 'FINANCIAL_SETTLEMENT_REQUIRES_PRIOR_RECORD' });
// Concurrent identical retry commits once; competing revision loses explicitly.
const next = { ...settle, expectedRevision: 3, idempotencyKey: 'settle-4' };
const retries = await Promise.all([write(next), write(next)]); assert.equal(retries.filter(x => x.replayed).length, 1);
const competing = await Promise.allSettled([write({ ...next, expectedRevision: 4, idempotencyKey: 'compete-a' }), write({ ...next, expectedRevision: 4, idempotencyKey: 'compete-b' })]); assert.equal(competing.filter(x => x.status === 'fulfilled').length, 1);
const count = db.state.revisions.length; db.failInsert = true;
await assert.rejects(write(input({ idempotencyKey: 'failed', record: { ...input().record, sourceId: 'another-source' } })));
assert.equal(db.state.revisions.length, count); db.failInsert = false;
assert.equal(Object.values(db.state.heads).includes(0), false, 'failed new head rolled back');
const unknown = input({ idempotencyKey: 'unknown', record: { ...input().record, sourceId: 'unknown', amountMinor: null } }); await write(unknown); assert.equal((await read()).totals.find(x => x.status === 'forecast').amountMinor, null);
assert(db.calls.filter(x => /^(SELECT|UPDATE)/.test(x.sql)).every(x => /(?:owner_id|email)=\$1/.test(x.sql)), 'every data read/update is owner bound');
assert(!db.calls.some(x => /rosters|DELETE|ALTER|CREATE/.test(x.sql)), 'no roster dependency or runtime DDL/delete');
// Foreign allowance: original currency/amount is stable, flight-day timing is
// an explicit scoped owner assertion and never a settlement or an FX write.
const foreignRecord={...input().record,sourceId:'foreign-allowance',aggregationLevel:'item',periodStart:'2032-04-07',periodEnd:'2032-04-07',currency:'EUR',amountMinor:12345};
const schedule={airline:'SYN',policy:{ownerId:A.ownerId,id:'foreign-rule',timing:'foreign_allowance_flight_day',currencies:['EUR','USD','GBP'],airline:'SYN',effectiveFrom:'2032-01-01',effectiveTo:'2032-12-31',provenance:'owner_report',reportReference:'synthetic-report'},flightLink:{kind:'published_allowance_flight_link',allowanceSourceId:foreignRecord.sourceId,localDate:'2032-04-08',timezone:'Europe/Madrid',airport:'MAD',reference:'synthetic-flight-link'}};
const capture=input({record:foreignRecord,idempotencyKey:'foreign-1',schedule});await write(capture);
const itemQuery=()=>readFinancialLedger({store,identity:A,periodStart:'2032-04-01',periodEnd:'2032-04-30',aggregationLevel:'item'});
let foreignResult=await itemQuery();assert.equal(foreignResult.records[0].expectedPaymentDate,'2032-04-08');assert.equal(foreignResult.records[0].periodStart,'2032-04-07');assert.equal(foreignResult.records[0].amountMinor,12345);assert.equal(foreignResult.records[0].currency,'EUR');assert.equal(foreignResult.records[0].status,'forecast');
await assert.rejects(write({...capture,idempotencyKey:'foreign-duplicate-leg',schedule:{...schedule,flightLink:{...schedule.flightLink,reference:'another-leg'}}}),{code:'FINANCIAL_REVISION_CONFLICT'});
await write({...capture,expectedRevision:1,idempotencyKey:'foreign-2',schedule:undefined,action:'record_settlement',provenance:{kind:'settlement',reference:'synthetic-fx-unrelated-settlement'},record:{...foreignRecord,status:'payment_confirmed',paymentDate:'2032-04-09'}});
foreignResult=await itemQuery();assert.equal(foreignResult.records.length,1);assert.equal(foreignResult.history.length,2);assert.equal(foreignResult.records[0].expectedPaymentDate,'2032-04-08');assert.equal(foreignResult.records[0].paymentDate,'2032-04-09');assert.equal(foreignResult.records[0].amountMinor,12345);
await assert.rejects(write(input({record:{...foreignRecord,convertedBRL:1},idempotencyKey:'forbidden-conversion'})),{code:'FINANCIAL_INVALID_RECORD'});
db.deletedOwners = new Set([A.ownerId]);
await assert.rejects(read(), {code:'FINANCIAL_OWNER_REQUIRED'});
await assert.rejects(write(input()), {code:'FINANCIAL_OWNER_REQUIRED'});
db.deletedOwners.clear();
assert.deepEqual(financialLedgerErasureStatements(A.ownerId).map(x=>x[1]), [[A.ownerId],[A.ownerId]]);
assert(financialLedgerErasureStatements(A.ownerId).every(x=>/^DELETE FROM crewcheck_financial_/.test(x[0])));
const ddl = readFileSync(new URL('../migrations/20261017_020_financial_ledger_mysql.sql', import.meta.url), 'utf8');
assert.match(ddl, /UNIQUE KEY financial_owner_idempotency \(owner_id, idempotency_key\)/); assert(!/REFERENCES|CASCADE|INSERT INTO/i.test(ddl.replace(/^--.*$/gm, "")));

async function request(handler, { method = 'GET', query = '?periodStart=2032-04-01&periodEnd=2032-04-30&aggregationLevel=week', body, headers = {}, identity = A } = {}) {
  const req = Readable.from(body === undefined ? [] : [JSON.stringify(body)]); req.method = method; req.headers = headers; req.syntheticIdentity = identity;
  const res = { headers: {}, setHeader(k,v) { this.headers[k] = v; }, writeHead(s,h) { this.status = s; Object.assign(this.headers,h); }, end(s) { this.body = JSON.parse(s); } };
  assert.equal(await handler(req, res, new URL(FINANCIAL_LEDGER_PATH + query, 'https://crewcheck.example.invalid')), true); return res;
}
const options = { enabled: () => true, identityProvider: req => req.syntheticIdentity, poolProvider: async () => db, allowedOrigin: () => 'https://crewcheck.example.invalid' };
const handler = createFinancialLedgerHandler(options);
assert.equal((await request(handler)).body.source, 'persisted_financial_ledger');
assert.equal((await request(handler, { identity: { ...A, role: 'visitor' } })).status, 403);
assert.equal((await request(handler, { query: '?ownerId=synthetic-b' })).status, 400);
assert.equal((await request(handler, { method: 'DELETE' })).status, 405);
assert.equal((await request(createFinancialLedgerHandler({ ...options, enabled: () => false }))).body.state, 'unavailable');
const post = { method: 'POST', query: '', headers: { 'content-type': 'application/json', origin: 'https://crewcheck.example.invalid' }, body: input({ idempotencyKey: 'http-new', record: { ...input().record, sourceId: 'http-new' } }) };
assert.equal((await request(handler, post)).status, 201); assert.equal((await request(handler, post)).status, 200);
assert.equal((await request(handler, { ...post, headers: { ...post.headers, origin: 'https://attacker.example.invalid' } })).status, 403);
assert.equal((await request(handler, { ...post, headers: { 'content-type': 'application/json' } })).status, 403);
assert.equal((await request(handler, { ...post, headers: { origin: post.headers.origin } })).status, 415);
assert.equal((await request(createFinancialLedgerHandler({ ...options, poolProvider: async () => null }))).body.state, 'unavailable');
assert.equal((await request(createFinancialLedgerHandler({ ...options, storeFactory: () => ({ list() { throw Object.assign(new Error('private detail'), { code: 'ER_NO_SUCH_TABLE' }); } }) }))).body.code, 'FINANCIAL_MIGRATION_REQUIRED');
// Real platform composition, disabled, with synthetic signed claims only.
// No database URL is supplied or used; identity fallback must not authorize it.
process.env.CREWCHECK_AUTH_SECRET = 'synthetic-offline-ledger-test-only';
process.env.CREWCHECK_AUTH_REQUIRED = 'false';
process.env.CREWCHECK_FINANCIAL_LEDGER_ENABLED = 'false';
const { handlePlatformRoute } = await import('../server/platform.mjs');
const sign = claims => {
  const h = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const b = Buffer.from(JSON.stringify({...claims,exp:Math.floor(Date.now()/1000)+60})).toString('base64url');
  return h+'.'+b+'.'+createHmac('sha256',process.env.CREWCHECK_AUTH_SECRET).update(h+'.'+b).digest('base64url');
};
const composed = token => (req,res,url) => { req.headers = {...req.headers,'x-crewcheck-email':A.ownerId,...(token?{authorization:'Bearer '+token}:{})}; return handlePlatformRoute(req,res,url); };
assert.equal((await request(composed())).status,403,'development identity fallback forbidden');
assert.equal((await request(composed('invalid'))).status,403);
assert.equal((await request(composed(sign({email:A.ownerId,role:'visitor',aud:'crewcheck-visitor'})))).status,403);
assert.equal((await request(composed(sign({email:A.ownerId,role:'free'})))).body.code,'FINANCIAL_LEDGER_NOT_ENABLED');
const platform = readFileSync(new URL('../server/platform.mjs',import.meta.url),'utf8');
const rosterDelete = platform.slice(platform.indexOf('async function handleLegacyDatabase'),platform.indexOf('async function handleAccountDeletion'));
assert(!rosterDelete.includes('financialLedgerErasureStatements'), 'roster removal cannot erase financial history');
const accountDelete = platform.slice(platform.indexOf('async function handleAccountDeletion'),platform.indexOf('export function accountHealthDeletionStatements'));
assert(accountDelete.indexOf('SELECT email FROM crewcheck_platform_profiles') < accountDelete.indexOf('financialLedgerErasureStatements(context.identity.email)'));
console.log('PASS offline financial ledger: persisted snapshots independent of rosters, revisions/latest totals, explicit settlement, owner isolation, idempotency/concurrent retries, rollback, HTTP methods/origin, unavailable schema; no production DB');
