import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const read = (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

const [planSource, apiSource, cardSource] = await Promise.all([
  read('client/src/lib/conciergeStayNotificationPlan.ts'),
  read('client/src/lib/conciergeStayNotifications.ts'),
  read('client/src/components/v1391/ConciergeStayContextCard.tsx'),
]);

const compiled = ts.transpileModule(planSource, {
  fileName: 'conciergeStayNotificationPlan.ts',
  reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const errors = (compiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, 'conciergeStayNotificationPlan.ts must transpile without syntax errors');
const plan = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputText).toString('base64'));

const at = (year, month, day, hour, minute = 0) => new Date(year, month - 1, day, hour, minute, 0, 0);
const now = at(2026, 9, 24, 6);

const first = plan.buildConciergeStayReminderPlan({
  stayDate: '2026-09-24',
  presentationTime: '10:00',
  presentationAt: at(2026, 9, 24, 10),
  wakeAt: at(2026, 9, 24, 8, 30),
  isPast: false,
}, now);
assert.equal(first.length, 2, 'wake + presentation-soon reminders should be planned when both are future and distinct');
assert.equal(first[0].kind, 'wake');
assert.equal(first[0].scheduledAt.getHours(), 8);
assert.equal(first[0].scheduledAt.getMinutes(), 30);
assert.equal(first[1].kind, 'presentation');
assert.equal(first[1].scheduledAt.getHours(), 9);
assert.equal(first[1].scheduledAt.getMinutes(), 40);
assert.equal(first[0].jobKey, 'concierge:stay:2026-09-24:wake:v1');
assert.equal(first[1].jobKey, 'concierge:stay:2026-09-24:presentation:v1');

const changedTime = plan.buildConciergeStayReminderPlan({
  stayDate: '2026-09-24',
  presentationTime: '11:00',
  presentationAt: at(2026, 9, 24, 11),
  wakeAt: at(2026, 9, 24, 9, 30),
  isPast: false,
}, now);
assert.deepEqual(changedTime.map((item) => item.jobKey), first.map((item) => item.jobKey), 'editing a stay must reuse stable job keys so pending server jobs are replaced instead of duplicated');
assert.equal(changedTime[0].scheduledAt.getHours(), 9);
assert.equal(changedTime[0].scheduledAt.getMinutes(), 30);

const collision = plan.buildConciergeStayReminderPlan({
  stayDate: '2026-09-24',
  presentationTime: '10:00',
  presentationAt: at(2026, 9, 24, 10),
  wakeAt: at(2026, 9, 24, 9, 45),
  isPast: false,
}, now);
assert.equal(collision.length, 1, 'near-identical wake/presentation reminders should collapse instead of spamming the user');
assert.equal(collision[0].kind, 'wake');

assert.deepEqual(plan.buildConciergeStayReminderPlan({
  stayDate: '2026-09-24',
  presentationAt: null,
  wakeAt: at(2026, 9, 24, 8, 30),
}, now), [], 'missing presentation must fail closed');

assert.deepEqual(plan.buildConciergeStayReminderPlan({
  stayDate: '2026-09-24',
  presentationAt: at(2026, 9, 24, 10),
  wakeAt: at(2026, 9, 24, 8, 30),
  isPast: true,
}, now), [], 'completed stays must not create reminders');

assert.equal(plan.normalizeConciergeReminderChannel('both'), 'telegram+phone-call');
assert.equal(plan.normalizeConciergeReminderChannel('ligacao'), 'phone-call');
assert.equal(plan.normalizeConciergeReminderChannel('not-a-channel'), 'telegram', 'invalid stored channel must fail safe to existing Telegram default');

const activeFirst = first.map((item) => ({
  jobKey: item.jobKey,
  scheduledAt: item.scheduledAt.toISOString(),
  channel: 'telegram',
  status: 'pending',
}));
const unchanged = plan.buildConciergeStayReminderReconciliation('2026-09-24', first, activeFirst, 'telegram');
assert.equal(unchanged.enabled, true, 'active reminders preserve the opt-in state for reconciliation');
assert.equal(unchanged.reason, 'active-reminders');
assert.deepEqual(unchanged.schedule, []);
assert.deepEqual(unchanged.cancelJobKeys, []);
assert.deepEqual(unchanged.unchangedJobKeys.sort(), first.map((item) => item.jobKey).sort(), 'identical active reminders must not be rewritten');

const moved = plan.buildConciergeStayReminderReconciliation('2026-09-24', changedTime, activeFirst, 'telegram');
assert.equal(moved.schedule.length, 2, 'a proven presentation/wake change should replace pending jobs with the stable keys');
assert.deepEqual(moved.cancelJobKeys, []);
assert.deepEqual(moved.deferredJobKeys, []);

const stalePresentation = plan.buildConciergeStayReminderReconciliation('2026-09-24', collision, activeFirst, 'telegram');
assert.deepEqual(stalePresentation.cancelJobKeys, ['concierge:stay:2026-09-24:presentation:v1'], 'a reminder no longer justified by the current plan must be cancelled');
assert.equal(stalePresentation.schedule.length, 1, 'the remaining wake reminder may be updated independently');

const cancelledJobs = activeFirst.map((job) => ({ ...job, status: 'cancelled' }));
const disabled = plan.buildConciergeStayReminderReconciliation('2026-09-24', changedTime, cancelledJobs, 'telegram');
assert.equal(disabled.enabled, false, 'cancelled reminders must not be silently re-enabled by reconciliation');
assert.equal(disabled.reason, 'no-active-reminders');
assert.deepEqual(disabled.schedule, []);
assert.deepEqual(disabled.cancelJobKeys, []);

const partiallyActive = plan.buildConciergeStayReminderReconciliation('2026-09-24', first, [activeFirst[1]], 'telegram');
assert.equal(partiallyActive.enabled, true);
assert.deepEqual(partiallyActive.schedule.map((item) => item.kind), ['wake'], 'an opted-in stay may restore a missing sibling reminder when the plan requires it');
assert.deepEqual(partiallyActive.unchangedJobKeys, [first[1].jobKey]);

const processingWake = plan.buildConciergeStayReminderReconciliation('2026-09-24', changedTime, [
  { ...activeFirst[0], status: 'processing' },
  { ...activeFirst[1], scheduledAt: changedTime[1].scheduledAt.toISOString(), status: 'pending' },
], 'telegram');
assert.deepEqual(processingWake.deferredJobKeys, [first[0].jobKey], 'a processing reminder must not be rewritten while delivery may already be in flight');
assert.deepEqual(processingWake.unchangedJobKeys, [first[1].jobKey]);

const channelChange = plan.buildConciergeStayReminderReconciliation('2026-09-24', first, activeFirst, 'phone-call');
assert.equal(channelChange.schedule.length, 2, 'an active opt-in should follow the current alarm delivery channel without creating duplicate keys');

const invalidStay = plan.buildConciergeStayReminderReconciliation('not-a-date', first, activeFirst, 'telegram');
assert.equal(invalidStay.enabled, false);
assert.equal(invalidStay.reason, 'invalid-stay');

assert.match(apiSource, /\/api\/alarm\/scheduled/);
assert.match(apiSource, /\/api\/alarm\/schedule/);
assert.match(apiSource, /\/api\/alarm\/cancel/);
assert.match(apiSource, /conciergeStayReminderJobKeys/);
assert.match(apiSource, /buildConciergeStayReminderReconciliation/);
assert.match(apiSource, /reconcileConciergeStayReminders/);
assert.match(apiSource, /crewcheck_wakeup_channel/);
assert.match(apiSource, /crewcheck_wakeup_phone/);
assert.match(apiSource, /crewcheck_telegram_username/);
assert.match(apiSource, /jobKey: item\.jobKey/);
assert.doesNotMatch(planSource, /hotelName|\broom\b/, 'reminder plan must not carry private hotel/room data into notification messages');
assert.doesNotMatch(planSource, /canonicalRoster|journeyId|\bAPZ\b/, 'reminder plan must stay isolated from the canonical roster core');
assert.doesNotMatch(apiSource, /android-wrapper|watchSnapshotV1|Data Layer|watch face|\bTV\b/, 'Concierge reminder service must not cross into Mobile Core or Peripherals ownership');

assert.match(cardSource, /Ativar lembretes/);
assert.match(cardSource, /Atualizar lembretes/);
assert.match(cardSource, /Desativar/);
assert.match(cardSource, /scheduleConciergeStayReminders/);
assert.match(cardSource, /cancelConciergeStayReminders/);
assert.match(cardSource, /não possui um horário confiável de chegada ao hotel e não inventa esse marco/);
assert.match(cardSource, /só agenda após sua ação/);
assert.match(cardSource, /scheduler persistente do CrewCheck/);

console.log('CrewCheck Concierge contextual stay notifications regression OK');
