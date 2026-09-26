import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = await readFile(new URL('../client/src/lib/conciergeStayNotificationPlan.ts', import.meta.url), 'utf8');

const compiled = ts.transpileModule(source, {
  fileName: 'conciergeStayNotificationPlan.ts',
  reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const errors = (compiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, 'conciergeStayNotificationPlan.ts must transpile');

const plan = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputText).toString('base64'));
const at = (hour, minute = 0) => new Date(2026, 8, 24, hour, minute, 0, 0);
const now = at(6);

function reminderPlan(stayId, presentationHour) {
  return plan.buildConciergeStayReminderPlan({
    stayDate: '2026-09-24',
    stayId,
    presentationTime: String(presentationHour).padStart(2, '0') + ':00',
    presentationAt: at(presentationHour),
    wakeAt: at(presentationHour - 1, 30),
    isPast: false,
  }, now);
}

const firstStay = reminderPlan('stay-gru-a', 10);
const firstStayMoved = reminderPlan('stay-gru-a', 11);
const secondStay = reminderPlan('stay-gru-b', 15);

assert.equal(firstStay.length, 2);
assert.equal(secondStay.length, 2);
assert.deepEqual(
  firstStay.map((item) => item.jobKey),
  firstStayMoved.map((item) => item.jobKey),
  'the same stay identity must keep stable keys when its presentation changes',
);
assert.equal(
  firstStay.some((item) => secondStay.some((other) => other.jobKey === item.jobKey)),
  false,
  'two stays on the same day must never share reminder job keys',
);
assert.ok(firstStay.every((item) => item.jobKey.includes(':v2')), 'scoped stay keys must use the v2 namespace');

const legacy = plan.conciergeStayReminderJobKeys('2026-09-24');
assert.equal(legacy.wake, 'concierge:stay:2026-09-24:wake:v1', 'legacy day-only callers remain backward compatible');

const activeFirst = firstStay.map((item) => ({
  jobKey: item.jobKey,
  scheduledAt: item.scheduledAt.toISOString(),
  channel: 'telegram',
  status: 'pending',
}));
const activeSecond = secondStay.map((item) => ({
  jobKey: item.jobKey,
  scheduledAt: item.scheduledAt.toISOString(),
  channel: 'telegram',
  status: 'pending',
}));

const reconciliation = plan.buildConciergeStayReminderReconciliation(
  '2026-09-24',
  firstStay,
  [...activeFirst, ...activeSecond],
  'telegram',
  'stay-gru-a',
);
assert.equal(reconciliation.enabled, true);
assert.deepEqual(
  reconciliation.unchangedJobKeys.sort(),
  firstStay.map((item) => item.jobKey).sort(),
  'reconciliation must only consider jobs belonging to the selected stay identity',
);
assert.deepEqual(reconciliation.cancelJobKeys, []);
assert.deepEqual(reconciliation.schedule, []);

console.log('CrewCheck Concierge same-day reminder identity regression OK');
