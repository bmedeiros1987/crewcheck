// CrewLocker validity alarms: informed milestones become one local alarm per civil day,
// with the same eligibility as the in-app notices, no document data in the text, the
// soonest 16 days only, and nothing armed while OFF. Synthetic records only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClientModules } from './lib/ts-module-harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.TZ = 'America/Sao_Paulo';
const { load, cleanup } = loadClientModules({ files: ['client/src/lib/crewlockerValidity.ts', 'client/src/lib/localAlarms.ts', 'client/src/lib/crewlockerValidityAlarms.ts'], prefix: 'crewcheck-validity-alarms-' });
try {
  const alarms = load('crewlockerValidityAlarms');
  const entry = (patch = {}) => ({ id: 'e1', revision: 1, category: 'medical', label: 'CMA 1ª classe', expiry: { kind: 'exact', value: '2030-12-31' }, confirmed: true,
    origin: 'manual', sourceCheck: 'pending', signatureCheck: 'unknown', fitnessCheck: 'not_assessed', ...patch });
  const now = new Date(2030, 8, 1, 12, 0); // 2030-09-01 12:00 local
  const days = (jobs) => jobs.map((job) => job.id.slice(4));

  // Exact date: each informed threshold is one alarm at 09:00 local; past milestones are skipped.
  {
    const jobs = alarms.validityAlarmJobs([{ validities: [entry()], alertDays: [150, 120, 90, 30, 7, 0] }], now);
    // 150 days before is 2030-08-03, already past on 2030-09-01.
    assert.deepEqual(days(jobs), ['2030-09-02', '2030-10-02', '2030-12-01', '2030-12-24', '2030-12-31']);
    assert.equal(jobs[0].at, new Date(2030, 8, 2, 9, 0).getTime());
    assert.ok(jobs.every((job) => job.channel === 'default' && job.title === 'CrewLocker'));
    // No label, class, date or identifier in the notification text.
    assert.ok(jobs.every((job) => job.body === 'Há uma validade para revisar no CrewLocker. Abra o aplicativo.'), 'fixed generic wording');
    for (const job of jobs) for (const secret of ['CMA', 'classe', '2030', '31/12', 'e1']) assert.ok(!job.body.includes(secret) && !job.title.includes(secret), secret);
  }
  // Today's milestone before 09:00 still rings today; after 09:00 the in-app notice covers it.
  {
    const records = [{ validities: [entry({ expiry: { kind: 'exact', value: '2030-09-08' } })], alertDays: [7, 0] }];
    assert.deepEqual(days(alarms.validityAlarmJobs(records, new Date(2030, 8, 1, 8, 59))), ['2030-09-01', '2030-09-08']);
    assert.deepEqual(days(alarms.validityAlarmJobs(records, new Date(2030, 8, 1, 9, 0))), ['2030-09-08']);
  }
  // Month-only: conservative milestones from the first day of the month.
  assert.deepEqual(days(alarms.validityAlarmJobs([{ validities: [entry({ expiry: { kind: 'month', value: '2030-11' } })], alertDays: [30, 0] }], now)), ['2030-10-02', '2030-11-01']);
  // Same eligibility as in-app notices: superseded, unconfirmed, invalid source/signature, unknown/permanent never ring.
  for (const patch of [{ supersededBy: 'e2' }, { confirmed: false }, { sourceCheck: 'invalid' }, { signatureCheck: 'invalid' }, { expiry: { kind: 'unknown' } },
    { category: 'license', expiry: { kind: 'permanent' } }, { expiry: { kind: 'exact', value: '2030-02-30' } }])
    assert.deepEqual(alarms.validityAlarmJobs([{ validities: [entry(patch)], alertDays: [30] }], now), [], JSON.stringify(patch));
  // Invalid alert days skip the record instead of guessing; missing ones use the default milestones.
  assert.deepEqual(alarms.validityAlarmJobs([{ validities: [entry()], alertDays: [-1] }], now), []);
  assert.deepEqual(days(alarms.validityAlarmJobs([{ validities: [entry()] }], now)), ['2030-10-02', '2030-11-01', '2030-12-01', '2030-12-24', '2030-12-31']);
  // Same civil day from several records collapses; only the soonest 16 days are kept, in order.
  {
    const a = entry({ id: 'a', expiry: { kind: 'exact', value: '2030-10-31' } }), b = entry({ id: 'b', expiry: { kind: 'exact', value: '2030-10-31' } });
    assert.deepEqual(days(alarms.validityAlarmJobs([{ validities: [a], alertDays: [0] }, { validities: [b], alertDays: [0] }], now)), ['2030-10-31']);
    // Records listed out of order still produce the soonest days first.
    const late = entry({ id: 'late', expiry: { kind: 'exact', value: '2031-06-30' } }), soon = entry({ id: 'soon', expiry: { kind: 'exact', value: '2030-10-15' } });
    assert.deepEqual(days(alarms.validityAlarmJobs([{ validities: [late], alertDays: [0] }, { validities: [soon], alertDays: [0] }], now)), ['2030-10-15', '2031-06-30']);
    const many = Array.from({ length: 30 }, (_, i) => entry({ id: `m${i}`, expiry: { kind: 'exact', value: new Date(Date.UTC(2031, 0, 1 + i)).toISOString().slice(0, 10) } }));
    const jobs = alarms.validityAlarmJobs([{ validities: many, alertDays: [0] }], now);
    assert.equal(jobs.length, alarms.VALIDITY_ALARM_WINDOW);
    assert.deepEqual(days(jobs).slice(0, 2), ['2031-01-01', '2031-01-02']);
    assert.ok(jobs.every((job, i) => i === 0 || job.at > jobs[i - 1].at));
  }
  // OFF: sync is a no-op, the constant is false and the locker only calls it from the unlocked refresh.
  assert.equal(alarms.VALIDITY_ALARMS_ENABLED, false);
  assert.equal(alarms.syncValidityAlarms([{ validities: [entry()] }], now), null);
  const view = fs.readFileSync(path.join(ROOT, 'client/src/components/v1435/CrewLockerView.tsx'), 'utf8');
  assert.equal(view.match(/syncValidityAlarms\(/g)?.length, 1);
  assert.match(view, /setDocuments\(latest\); setStorage\(estimate\); setToday\(civilToday\(\)\);\n\s+\/\/ OFF[^\n]*\n\s+if \(VALIDITY_ALARMS_ENABLED\) syncValidityAlarms\(latest\);/);
} finally { cleanup(); }
console.log('PASS validity local alarms: informed milestones → one generic 09:00 alarm per civil day, month-only conservative, in-app eligibility, soonest 16, no document data, OFF and called only from the unlocked refresh');
