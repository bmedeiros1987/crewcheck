// Client side of local alarms: bridge answers are re-validated, a disabled or missing
// host never reads as armed, plan → job mapping, device-local instants (including a
// skipped DST wall time) and the in-flight rest view staying OFF. Fake hosts only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClientModules } from './lib/ts-module-harness.mjs';
import { planInflightRest } from '../shared/inflightRestPlan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { load, cleanup } = loadClientModules({ files: ['client/src/lib/localAlarms.ts', 'client/src/lib/inflightRestAlarm.ts'], prefix: 'crewcheck-local-alarm-client-' });
try {
  const alarms = load('localAlarms');
  const rest = load('inflightRestAlarm');
  const P = alarms.LOCAL_ALARM_PROTOCOL;
  const job = { id: 'own-turn-end:2', at: Date.parse('2030-01-01T07:55:00Z'), channel: 'alarm', title: 'Fim do seu descanso', body: 'x' };

  // Capabilities: missing bridge, disabled build, foreign protocol, throwing bridge.
  assert.deepEqual(alarms.localAlarmCapabilities(undefined), { available: false, enabled: false, permitted: false, exact: false });
  assert.deepEqual(alarms.localAlarmCapabilities({ localAlarmCapabilities: () => JSON.stringify({ protocol: P, enabled: false, permitted: true, exact: true }) }),
    { available: true, enabled: false, permitted: false, exact: false });
  assert.equal(alarms.localAlarmCapabilities({ localAlarmCapabilities: () => JSON.stringify({ protocol: 'other', enabled: true }) }).available, false);
  assert.equal(alarms.localAlarmCapabilities({ localAlarmCapabilities: () => { throw new Error('bridge'); } }).available, false);
  assert.deepEqual(alarms.localAlarmCapabilities({ localAlarmCapabilities: () => JSON.stringify({ protocol: P, enabled: true, permitted: true, exact: false }) }),
    { available: true, enabled: true, permitted: true, exact: false });

  // Replace: the request carries protocol/group/jobs; only an exact confirmation is success.
  let sent = null;
  const host = (answer) => ({ replaceLocalAlarms: (payload) => { sent = JSON.parse(payload); return typeof answer === 'function' ? answer() : JSON.stringify(answer); } });
  const ok = alarms.replaceLocalAlarms('inflight-rest:manual', [job], host({ protocol: P, ok: true, reason: 'scheduled', exact: true, armed: [{ id: job.id, at: job.at, channel: 'alarm' }] }));
  assert.deepEqual(sent, { protocol: P, group: 'inflight-rest:manual', jobs: [job] });
  assert.deepEqual(ok, { ok: true, reason: 'scheduled', armed: [{ id: job.id, at: job.at, channel: 'alarm' }], exact: true });
  const untrusted = [
    [{ protocol: P, ok: false, reason: 'disabled' }, 'disabled'],
    [{ protocol: P, ok: true, reason: 'scheduled', armed: [] }, 'unconfirmed-response'],
    [{ protocol: P, ok: true, reason: 'scheduled', armed: [{ id: job.id, at: job.at + 60000, channel: 'alarm' }] }, 'unconfirmed-response'],
    [{ protocol: P, ok: true, reason: 'scheduled', armed: [{ id: job.id, at: job.at, channel: 'vibrate' }] }, 'unconfirmed-response'],
    [{ protocol: P, ok: true, reason: 'scheduled', armed: [{ id: job.id, at: job.at, channel: 'alarm' }, { id: 'extra', at: job.at, channel: 'alarm' }] }, 'unconfirmed-response'],
    [{ protocol: P, ok: true, reason: 'scheduled', armed: 'all' }, 'unconfirmed-response'],
    [{ protocol: 'other', ok: true, reason: 'scheduled', armed: [] }, 'invalid-response'],
    [{ protocol: P, ok: 'yes', reason: 'scheduled' }, 'invalid-response'],
  ];
  for (const [answer, reason] of untrusted) {
    const result = alarms.replaceLocalAlarms('inflight-rest:manual', [job], host(answer));
    assert.equal(result.ok, false, JSON.stringify(answer));
    assert.equal(result.reason, reason, JSON.stringify(answer));
    assert.deepEqual(result.armed, []);
  }
  assert.equal(alarms.replaceLocalAlarms('g', [job], host(() => 'not json')).reason, 'invalid-response');
  assert.equal(alarms.replaceLocalAlarms('g', [job], host(() => { throw new Error('x'); })).reason, 'bridge-error');
  assert.equal(alarms.replaceLocalAlarms('g', [job], undefined).reason, 'unavailable');

  // Cancel succeeds only with an empty confirmation; group read returns null when unknown.
  assert.equal(alarms.cancelLocalAlarms('g', { cancelLocalAlarms: () => JSON.stringify({ protocol: P, ok: true, reason: 'cleared', armed: [] }) }).ok, true);
  assert.equal(alarms.cancelLocalAlarms('g', { cancelLocalAlarms: () => JSON.stringify({ protocol: P, ok: true, reason: 'cleared', armed: [{ id: 'a', at: 1, channel: 'alarm' }] }) }).ok, false);
  assert.deepEqual(alarms.readLocalAlarmGroup('g', { localAlarmGroup: () => JSON.stringify({ protocol: P, ok: true, jobs: [{ id: 'a', at: 5, channel: 'vibrate' }] }) }), [{ id: 'a', at: 5, channel: 'vibrate' }]);
  assert.equal(alarms.readLocalAlarmGroup('g', { localAlarmGroup: () => JSON.stringify({ protocol: P, ok: false, reason: 'disabled', jobs: [] }) }), null);
  assert.equal(alarms.readLocalAlarmGroup('g', undefined), null);

  // Plan → jobs: ids local to the group, copy per kind, last handover worded as the end.
  const plan = planInflightRest({ flightId: 'manual', startAt: '2030-01-01T01:00:00-03:00', endAt: '2030-01-01T07:00:00-03:00', turns: 3, handoverMinutes: 15, myTurn: 2, alertEveryHandover: true, mode: 'vibrate' }, Date.parse('2030-01-01T00:00:00-03:00'));
  const jobs = rest.inflightRestJobs(plan);
  assert.deepEqual(jobs.map((item) => [item.id, item.channel, item.title]), [
    ['handover:1', 'vibrate', 'Troca de descanso'], ['own-turn-end:2', 'vibrate', 'Fim do seu descanso'], ['handover:3', 'vibrate', 'Fim do período de descanso']]);
  assert.deepEqual(jobs.map((item) => item.at), plan.alarms.map((alarm) => alarm.epochMs));
  assert.match(jobs[0].body, /turno 1 terminou; começa o turno 2/);
  assert.ok(jobs.every((item) => item.title.length <= 120 && item.body.length <= 400), 'native length limits');

  // Device-local instants carry this device's offset; malformed and skipped wall times are refused.
  process.env.TZ = 'America/Sao_Paulo';
  assert.equal(rest.deviceLocalInstant('2030-01-01T01:00'), '2030-01-01T01:00:00-03:00');
  for (const bad of ['', '2030-01-01', '2030-01-01T1:00', '2030-02-30T01:00', '2030-01-01T24:00', null]) assert.equal(rest.deviceLocalInstant(bad), null, String(bad));
  process.env.TZ = 'America/New_York';
  assert.equal(rest.deviceLocalInstant('2030-07-01T08:00'), '2030-07-01T08:00:00-04:00');
  assert.equal(rest.deviceLocalInstant('2030-03-10T02:30'), null, 'skipped by the DST jump');
  process.env.TZ = 'Asia/Kolkata';
  assert.equal(rest.deviceLocalInstant('2030-01-01T01:00'), '2030-01-01T01:00:00+05:30');
  delete process.env.TZ;

  // Every planner/native failure reason shown to the user has its own sentence.
  for (const reason of ['window-too-short', 'disabled', 'unavailable', 'signed-out', 'notifications-not-permitted', 'arm-failed', 'account-changed', 'unconfirmed-response'])
    assert.notEqual(rest.inflightRestReason(reason), rest.inflightRestReason('unknown'), reason);

  // OFF: the flag is a false constant, the view returns before any hook, and no screen mounts it.
  assert.equal(rest.INFLIGHT_REST_ALARM_ENABLED, false);
  const view = fs.readFileSync(path.join(ROOT, 'client/src/components/inflight-rest/InflightRestAlarmView.tsx'), 'utf8');
  assert.match(view, /if\(!INFLIGHT_REST_ALARM_ENABLED\)return null;/);
  const native = fs.readFileSync(path.join(ROOT, 'android-wrapper/app/src/main/java/com/crewcheck/app/LocalAlarmAndroid.java'), 'utf8');
  assert.match(native, /static final boolean ENABLED = false;/);
  const importers = [];
  const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file); else if (/\.tsx?$/.test(entry.name) && !file.includes(`${path.sep}inflight-rest${path.sep}`) && /InflightRestAlarmView/.test(fs.readFileSync(file, 'utf8'))) importers.push(path.relative(ROOT, file)); } };
  walk(path.join(ROOT, 'client/src'));
  assert.deepEqual(importers, [], 'the OFF view is not mounted anywhere yet');
} finally { cleanup(); }
console.log('PASS local alarm client: capabilities/replace/cancel/group answers re-validated (missing, disabled, foreign, partial, extra or mismatched confirmations never read as armed), plan→jobs copy, device-local instants with DST gap refusal, OFF view unmounted');
