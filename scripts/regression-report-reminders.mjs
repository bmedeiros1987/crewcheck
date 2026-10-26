// Report reminders: presentation instants match Home's eventClockDate (UTC-03 civil
// clock), duty legs collapse, lead/at-report jobs inside 7 days, invalid input never
// clears alarms, and the sync stays OFF. Synthetic events only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { planReportReminders, reportInstant, REPORT_REMINDER_LEADS } from '../shared/reportReminderPlan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const at = (iso) => Date.parse(iso);

// Parity with the production clock rule in Home.tsx (extracted, not copied).
{
  const home = fs.readFileSync(path.join(ROOT, 'client/src/pages/Home.tsx'), 'utf8');
  const source = home.match(/function eventClockDate\(event: ZeroLeg, clock: string\): Date \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, 'eventClockDate not found in Home.tsx');
  const js = ts.transpileModule(`type ZeroLeg = any;\nconst eventStartDateTime = (event: any) => new Date(event.startAt);\n${source}\nexport { eventClockDate };`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} }; new Function('module', 'exports', js)(module, module.exports);
  const cases = [
    { kind: 'flight', startAt: at('2030-03-10T12:00:00Z'), presentation: '08:00' },
    { kind: 'flight', startAt: at('2030-03-10T02:30:00Z'), presentation: '22:45' }, // departure 23:30 BRT, report same civil day
    { kind: 'flight', startAt: at('2030-03-10T03:30:00Z'), presentation: '23:15' }, // departure 00:30 BRT, report the day before
    { kind: 'duty', startAt: at('2030-03-10T10:00:00Z'), presentation: '06:00' },
    { kind: 'duty', startAt: at('2030-03-10T01:00:00Z'), presentation: '21:00' }, // 22:00 BRT on the 9th: civil date is BRT, not UTC
    { kind: 'duty', startAt: at('2030-03-10T10:00:00Z'), presentation: '9:05' },
    { kind: 'flight', startAt: at('2030-03-10T10:00:00Z'), presentation: '24:00' },
    { kind: 'flight', startAt: Number.NaN, presentation: '08:00' },
  ];
  for (const event of cases) {
    const expected = module.exports.eventClockDate({ ...event }, event.presentation).getTime();
    assert.equal(reportInstant(event), Number.isFinite(expected) ? expected : null, JSON.stringify(event));
  }
}

const now = at('2030-03-10T00:00:00Z');
const events = [
  { id: 'a1', kind: 'flight', startAt: at('2030-03-10T12:00:00Z'), presentation: '08:00' },
  { id: 'a2', kind: 'flight', startAt: '2030-03-10T15:00:00Z', presentation: '08:00' }, // second leg, same report
  { id: 'b', kind: 'duty', startAt: at('2030-03-12T10:00:00Z'), presentation: '06:00' },
  { id: 's', kind: 'stay', startAt: at('2030-03-11T10:00:00Z'), presentation: '06:00' },
  { id: 'far', kind: 'flight', startAt: at('2030-03-18T12:00:00Z'), presentation: '08:00' },
  { id: 'past', kind: 'flight', startAt: at('2030-03-09T12:00:00Z'), presentation: '08:00' },
  { id: 'bad', kind: 'flight', startAt: at('2030-03-11T12:00:00Z'), presentation: '' },
];
{
  const plan = planReportReminders(events, { leadMinutes: 90, atReport: true, channel: 'alarm' }, now);
  assert.equal(plan.ok, true);
  assert.equal(plan.group, 'report:next');
  assert.deepEqual(plan.jobs.map((job) => [job.id, new Date(job.at).toISOString(), job.channel]), [
    ['lead:20300310T1100', '2030-03-10T09:30:00.000Z', 'alarm'], ['report:20300310T1100', '2030-03-10T11:00:00.000Z', 'alarm'],
    ['lead:20300312T0900', '2030-03-12T07:30:00.000Z', 'alarm'], ['report:20300312T0900', '2030-03-12T09:00:00.000Z', 'alarm'],
  ]);
  assert.equal(plan.jobs[0].title, 'Apresentação em 90 min');
  assert.equal(plan.jobs[0].body, 'Apresentação às 08:00 (Brasília). Confira a escala no CrewCheck.');
  assert.ok(plan.jobs.every((job) => /^[A-Za-z0-9._:-]{1,160}$/.test(job.id) && job.title.length <= 120 && job.body.length <= 400), 'native limits');
  assert.ok(Object.isFrozen(plan.jobs) && Object.isFrozen(plan.jobs[0]));
}
// Lead only / report only / lead already elapsed / nothing chosen.
assert.deepEqual(planReportReminders(events, { leadMinutes: 60, atReport: false, channel: 'default' }, now).jobs.map((job) => job.id), ['lead:20300310T1100', 'lead:20300312T0900']);
assert.deepEqual(planReportReminders(events, { leadMinutes: null, atReport: true, channel: 'default' }, now).jobs.map((job) => job.id), ['report:20300310T1100', 'report:20300312T0900']);
assert.deepEqual(planReportReminders(events, { leadMinutes: 120, atReport: true, channel: 'default' }, at('2030-03-10T09:30:00Z')).jobs.map((job) => job.id),
  ['report:20300310T1100', 'lead:20300312T0900', 'report:20300312T0900']);
assert.deepEqual(planReportReminders(events, { leadMinutes: null, atReport: false, channel: 'default' }, now).jobs, []);
// A changed report time is a different job id, so a replace drops the old one.
assert.notDeepEqual(planReportReminders([{ ...events[0], presentation: '08:30' }], { leadMinutes: 60, atReport: false, channel: 'alarm' }, now).jobs[0].id, 'lead:20300310T1100');
// At most 16 jobs, soonest first.
{
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `d${i}`, kind: 'duty', startAt: now + (i + 1) * 12 * 3_600_000, presentation: `${String(6 + i).padStart(2, '0')}:00` }));
  const plan = planReportReminders(many, { leadMinutes: 30, atReport: true, channel: 'alarm' }, now);
  assert.equal(plan.jobs.length, 16, '12 distinct reports × 2 reminders capped at 16');
  assert.ok(plan.jobs.every((job, i) => i === 0 || job.at >= plan.jobs[i - 1].at));
}
// Rejections.
for (const [prefs, reason] of [[{ leadMinutes: 10, atReport: true, channel: 'alarm' }, 'invalid-lead'], [{ leadMinutes: 60, atReport: 'yes', channel: 'alarm' }, 'invalid-at-report'],
  [{ leadMinutes: 60, atReport: true, channel: 'vibrate' }, 'invalid-channel']]) assert.deepEqual(planReportReminders(events, prefs, now), { ok: false, reason });
assert.deepEqual(planReportReminders(null, { leadMinutes: 60, atReport: true, channel: 'alarm' }, now), { ok: false, reason: 'invalid-input' });
assert.deepEqual(planReportReminders(events, { leadMinutes: 60, atReport: true, channel: 'alarm' }, Number.NaN), { ok: false, reason: 'invalid-input' });
assert.ok(REPORT_REMINDER_LEADS.includes(90));

// OFF: sync returns null and nothing imports it yet.
{
  const source = fs.readFileSync(path.join(ROOT, 'client/src/lib/reportReminders.ts'), 'utf8');
  assert.match(source, /export const REPORT_REMINDERS_ENABLED = false;/);
  assert.match(source, /if \(!REPORT_REMINDERS_ENABLED\) return null;/);
  const importers = [];
  const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file); else if (/\.tsx?$/.test(entry.name) && !file.endsWith('reportReminders.ts') && /reportReminders['"]/.test(fs.readFileSync(file, 'utf8'))) importers.push(path.relative(ROOT, file)); } };
  walk(path.join(ROOT, 'client/src'));
  assert.deepEqual(importers, []);
}
console.log('PASS report reminders: Home eventClockDate parity (UTC-03, previous-day report), duty legs collapsed, lead/at-report jobs within 7 days, changed time → new id, 16-job cap, rejections, OFF and unwired');
