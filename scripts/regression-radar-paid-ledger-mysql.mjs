// Paid Radar ledger against a real, disposable InnoDB (socket only, no network):
// concurrency across independent pools (workers), rolling billing window, provider
// separation, persistence across pool restart and fail-closed corruption. Synthetic
// keys only; never a production database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import { createRadarSpendLedger, radarPaidPolicy, radarSpendKey, RADAR_PAID_WINDOW_DAYS } from '../server/radar-paid-sources.mjs';

const socketPath = process.env.RADAR_LEDGER_QA_SOCKET;
assert.equal(process.env.RADAR_LEDGER_QA, 'isolated-mysql', 'refuses to run outside the disposable QA database');
assert(/^\/tmp\/crewcheck-radar-sql-qa-[a-zA-Z0-9-]+\/mysqld\.sock$/.test(socketPath || ''), 'disposable socket only');
assert(fs.statSync(socketPath).isSocket());
const database = 'crewcheck_radar_qa', DAY = 86_400_000;
const open = () => mysql.createPool({ socketPath, user: 'root', password: '', database, connectionLimit: 10, waitForConnections: true });
const admin = open();
await admin.query(`CREATE TABLE IF NOT EXISTS crewcheck_telegram_state (
  state_key VARCHAR(255) PRIMARY KEY,
  payload JSON NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
const [[engine]] = await admin.query("SELECT ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME='crewcheck_telegram_state'", [database]);
assert.equal(engine.engine, 'InnoDB');
const reset = () => admin.query("DELETE FROM crewcheck_telegram_state WHERE state_key LIKE 'radar-paid-spend:%'");
const stored = async provider => { const [rows] = await admin.query('SELECT payload FROM crewcheck_telegram_state WHERE state_key=?', [radarSpendKey(provider)]);
  return rows.length ? (typeof rows[0].payload === 'string' ? JSON.parse(rows[0].payload) : rows[0].payload) : null; };
const policy = cost => radarPaidPolicy('flightaware', { FLIGHTAWARE_COST_PER_CALL_USD: cost });

try {
  // Concurrency: 120 attempts from three independent pools for a cap of 40 calls.
  await reset();
  const at = Date.parse('2032-10-20T10:05:00Z'), pools = [open(), open(), open()];
  const ledgers = pools.map(pool => createRadarSpendLedger({ pool, now: () => at }));
  const results = await Promise.all(Array.from({ length: 120 }, (_, i) => ledgers[i % 3].reserve('flightaware', policy('0.25'))));
  assert.equal(results.filter(r => r.ok).length, 40, 'US$ 10 at US$ 0.25: exactly 40 across workers');
  assert(results.filter(r => !r.ok).every(r => r.reason === 'budget-exhausted'), JSON.stringify(results.find(r => !r.ok && r.reason !== 'budget-exhausted')));
  let state = await stored('flightaware');
  assert.deepEqual(state.days, { '2032-10-20': 10_000_000 }); assert.equal(state.attempts, 40);
  await Promise.all(pools.map(pool => pool.end()));

  // Persistence: a fresh pool (process restart) sees the same spend.
  const restarted = open();
  assert.equal((await createRadarSpendLedger({ pool: restarted, now: () => at }).reserve('flightaware', policy('0.25'))).reason, 'budget-exhausted');
  // Provider separation.
  assert.equal((await createRadarSpendLedger({ pool: restarted, now: () => at }).reserve('cirium-flex', radarPaidPolicy('cirium-flex', { CIRIUM_FLEX_COST_PER_CALL_USD: '0.25' }))).ok, true);
  await restarted.end();

  // Billing cycle: calendar month boundaries (UTC or America/Sao_Paulo) never reset spend;
  // only days older than the 33-UTC-day window free budget.
  await reset();
  const filled = Date.parse('2032-10-31T23:30:00-03:00'), cycle = open(); let clock = filled;
  const ledger = createRadarSpendLedger({ pool: cycle, now: () => clock });
  for (let i = 0; i < 4; i++) assert.equal((await ledger.reserve('flightaware', policy('2.5'))).ok, true);
  for (const next of ['2032-11-01T00:30:00-03:00', '2032-11-01T00:00:00Z', '2032-11-30T12:00:00Z', '2032-12-01T12:00:00Z']) {
    clock = Date.parse(next);
    assert.equal((await ledger.reserve('flightaware', policy('2.5'))).reason, 'budget-exhausted', next);
  }
  clock = filled + (RADAR_PAID_WINDOW_DAYS - 1) * DAY;
  assert.equal((await ledger.reserve('flightaware', policy('2.5'))).reason, 'budget-exhausted', 'day 33 still inside the window');
  clock = Date.parse('2032-12-04T00:00:00Z'); // 2032-11-01 (UTC day of the spend) + 33 days
  assert.equal((await ledger.reserve('flightaware', policy('2.5'))).ok, true, 'spend leaves the window after 33 UTC days');
  state = await stored('flightaware');
  assert.deepEqual(state.days, { '2032-12-04': 2_500_000 }, 'expired days pruned in the stored row');
  // Any month in any zone lies inside 33 UTC days: spend counted in every such window stays <= cap.
  for (let i = 0; i < 3; i++) assert.equal((await ledger.reserve('flightaware', policy('2.5'))).ok, true);
  assert.equal((await ledger.reserve('flightaware', policy('2.5'))).reason, 'budget-exhausted');

  // Corrupt row: fail closed, row untouched.
  await admin.query('UPDATE crewcheck_telegram_state SET payload=? WHERE state_key=?', [JSON.stringify({ v: 2, kind: 'radar-paid-spend', provider: 'flightaware', days: { '2032-12-04': -5 }, attempts: 0 }), radarSpendKey('flightaware')]);
  assert.equal((await ledger.reserve('flightaware', policy('0.25'))).reason, 'ledger-unavailable');
  assert.deepEqual((await stored('flightaware')).days, { '2032-12-04': -5 });
  await cycle.end();
  await reset();
  console.log('PASS paid Radar ledger on real InnoDB: 120 concurrent attempts from 3 pools -> exactly 40 under US$ 10, persistence across pool restart, per-provider budgets, month boundaries never reset, 33-UTC-day window, corrupt row fails closed');
} finally {
  await admin.end();
}
