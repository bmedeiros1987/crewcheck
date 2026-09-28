import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = fileURLToPath(new URL('../', import.meta.url));

// Execute the actual Concierge modules. Only transport/auth are stubbed: no live alarms.
function loader(mocks = {}) {
  const cache = new Map();
  function load(path) {
    const fullPath = resolve(root, path);
    if (cache.has(fullPath)) return cache.get(fullPath).exports;
    const source = readFileSync(fullPath, 'utf8');
    const compiled = ts.transpileModule(source, {
      fileName: fullPath,
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    });
    assert.equal((compiled.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error).length, 0);
    const module = { exports: {} };
    cache.set(fullPath, module);
    new Function('require', 'module', 'exports', compiled.outputText)((specifier) => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      assert.ok(specifier.startsWith('./'), `Unexpected dependency: ${specifier}`);
      return load(resolve(dirname(fullPath), specifier + '.ts'));
    }, module, module.exports);
    return module.exports;
  }
  return load;
}

const day = '2026-09-24';
const idA = 'stay-gru-a';
const idB = 'stay-gru-b';
const lib = (name) => `client/src/lib/${name}.ts`;
const at = (hour) => new Date(2026, 8, 24, hour, 0, 0, 0);

function transportFixture() {
  let jobs = [];
  const writes = [];
  const load = loader({ './authClient': {
    getStoredUser: () => null,
    authFetch: async (url, options = {}) => {
      if (url === '/api/alarm/scheduled') return { jobs };
      const body = JSON.parse(options.body);
      writes.push({ url, ...body });
      if (url === '/api/alarm/cancel') return { cancelled: 1 };
      assert.equal(url, '/api/alarm/schedule');
      return { ok: true };
    },
  } });
  const plan = load(lib('conciergeStayNotificationPlan'));
  const service = load(lib('conciergeStayNotifications'));
  const makePlan = (stayId, hour = 12) => plan.buildConciergeStayReminderPlan({
    stayDate: day, stayId, presentationAt: at(hour), wakeAt: at(hour - 2), isPast: false,
  }, at(6));
  const active = (items, status = 'pending') => items.map((item) => ({
    job_key: item.jobKey, scheduled_at: item.scheduledAt.toISOString(), status, channel: 'telegram',
  }));
  return { plan, service, makePlan, active, writes, setJobs: (value) => { jobs = value; } };
}

test('transport list isolates v2 stay identity from same-day siblings and v1', async () => {
  const f = transportFixture();
  const a = f.active(f.makePlan(idA));
  const b = f.active(f.makePlan(idB));
  const legacy = f.active(f.makePlan(undefined));
  f.setJobs([...a, ...b, ...legacy]);
  assert.deepEqual(await f.service.listConciergeStayReminderJobs(day, idA), a);
  assert.deepEqual(await f.service.listConciergeStayReminderJobs(day), legacy);
  assert.deepEqual(f.writes, []);
});

test('transport cancel touches only the explicit stay; legacy remains compatible', async () => {
  const f = transportFixture();
  await f.service.cancelConciergeStayReminders(day, idA);
  assert.deepEqual(f.writes.map((item) => item.jobKey).sort(), f.makePlan(idA).map((item) => item.jobKey).sort());
  f.writes.length = 0;
  await f.service.cancelConciergeStayReminders(day);
  assert.deepEqual(f.writes.map((item) => item.jobKey).sort(), f.makePlan(undefined).map((item) => item.jobKey).sort());
});

test('transport reconciliation scopes opt-in, replacement and cancellation to the same stay', async () => {
  const f = transportFixture();
  const a = f.makePlan(idA);
  const b = f.makePlan(idB);
  f.setJobs([...f.active(a), ...f.active(b), ...f.active(f.makePlan(undefined))]);
  const moved = await f.service.reconcileConciergeStayReminders(day, f.makePlan(idA, 14), idA);
  assert.equal(moved.enabled, true);
  assert.equal(moved.scheduled, 2);
  assert.deepEqual(f.writes.map((item) => item.jobKey).sort(), a.map((item) => item.jobKey).sort());
  f.writes.length = 0;
  const ended = await f.service.reconcileConciergeStayReminders(day, [], idA);
  assert.equal(ended.cancelled, 2);
  assert.ok(f.writes.every((item) => item.url === '/api/alarm/cancel' && a.some((aItem) => aItem.jobKey === item.jobKey)));
  f.writes.length = 0;
  f.setJobs([...f.active(b), ...f.active(f.makePlan(undefined))]);
  assert.equal((await f.service.reconcileConciergeStayReminders(day, a, idA)).enabled, false);
  assert.deepEqual(f.writes, [], 'sibling/legacy opt-in must not enable this stay');
});

test('removal of an in-flight reminder is deferred, not cancelled or rescheduled', async () => {
  const f = transportFixture();
  const a = f.makePlan(idA);
  f.setJobs(f.active(a, 'processing'));
  const result = await f.service.reconcileConciergeStayReminders(day, [], idA);
  assert.equal(result.enabled, true);
  assert.equal(result.deferred, 2);
  assert.deepEqual(f.writes, []);
});

const hotel = 'Hotel São José';
const stays = [
  { id: idA, stayDate: day, hotelName: hotel, room: 'Quarto 0812' },
  { id: idB, stayDate: day, hotelName: hotel, room: '812' },
  { id: idB, stayDate: day, hotelName: hotel, room: 'room 812' },
  { id: 'older', stayDate: '2026-09-20', hotelName: hotel, room: '417' },
  { id: 'other-hotel', stayDate: day, hotelName: 'Outro Hotel', room: '812' },
];

test('room memory counts separate IDs on the same day and excludes only current identity', () => {
  const h = loader()(lib('conciergeRoomHistory'));
  const all = h.buildConciergeRoomMemory(stays, hotel, '812');
  assert.equal(all.hotelVisits, 3);
  assert.equal(all.roomVisits, 2);
  assert.deepEqual(all.roomStayDates, [day], 'display dates stay unique; they are not visit counts');
  const current = h.buildConciergeRoomMemory(stays, hotel, '812', day, idA);
  assert.equal(current.hotelVisits, 2);
  assert.equal(current.roomVisits, 1, 'same-day sibling remains history');
});

test('Room Intelligence counts visits and room coverage by identity, not dates', () => {
  const i = loader()(lib('conciergeRoomIntelligence'));
  const all = i.buildConciergeRoomIntelligence(stays, hotel);
  assert.equal(all.hotelVisits, 3);
  assert.equal(all.staysWithKnownRoom, 3);
  assert.equal(all.mostFrequentRoom.visits, 2);
  const current = i.buildConciergeRoomIntelligence(stays, hotel, day, idA);
  assert.equal(current.hotelVisits, 2);
  assert.equal(current.staysWithKnownRoom, 2);
  assert.equal(current.knownRooms.find((item) => item.room === '812').visits, 1);
});

test('repeated snapshots of an ID use the newest update without inventing another visit', () => {
  const load = loader();
  const h = load(lib('conciergeRoomHistory'));
  const records = [
    { ...stays[0], room: '812', updatedAt: '2026-09-24T08:00:00Z' },
    { ...stays[0], room: '417', updatedAt: '2026-09-24T09:00:00Z' },
  ];
  for (const input of [records, [...records].reverse()]) {
    assert.equal(h.buildConciergeRoomMemory(input, hotel, '812').roomVisits, 0);
    assert.equal(h.buildConciergeRoomMemory(input, hotel, '417').roomVisits, 1);
  }
});

test('legacy no-ID records retain date fallback and do not inflate identified history', () => {
  const load = loader();
  const h = load(lib('conciergeRoomHistory'));
  const i = load(lib('conciergeRoomIntelligence'));
  const records = [
    { stayDate: '2026-09-20', hotelName: hotel, room: '812' },
    { stayDate: '2026-09-20T18:00:00Z', hotelName: hotel, room: 'Quarto 0812' },
    { stayDate: day, hotelName: hotel, room: '999' },
  ];
  assert.equal(h.buildConciergeRoomMemory(records, hotel, '812', day).hotelVisits, 1);
  assert.equal(i.buildConciergeRoomIntelligence(records, hotel, day).staysWithKnownRoom, 1);
  assert.equal(h.buildConciergeRoomMemory([...stays, { ...stays[0], id: undefined }], hotel, '812').hotelVisits, 3);
  assert.equal(h.buildConciergeRoomMemory([...stays, { ...stays[0], id: undefined }], hotel, '812', day, idA).roomVisits, 1);
});

test('saved-stay selector requires exact ID, or one unambiguous legacy date candidate', () => {
  const { selectConciergeSavedStay: select } = loader()(lib('conciergeStayIdentity'));
  const records = [stays[0], stays[1]];
  assert.equal(select(records, day, idA), records[0]);
  assert.equal(select(records, day, idB), records[1]);
  assert.equal(select(records, day), null);
  assert.equal(select(records, day, 'missing'), null, 'never fall back from an unmatched explicit ID');
  assert.equal(select([records[0]], day), records[0]);
  assert.equal(select([records[0]], '2026-09-25', idA), null);
  assert.equal(select([records[0], { ...records[0] }], day, idA), null, 'conflicting snapshots are not guessed');
  assert.equal(select(null, day, idA), null);
});

test('Concierge-owned card forwards identity through selection, list, plan and cancel', () => {
  const source = readFileSync(resolve(root, 'client/src/components/v1391/ConciergeStayContextCard.tsx'), 'utf8');
  assert.match(source, /stayId\?: string/);
  assert.match(source, /selectConciergeSavedStay/);
  assert.doesNotMatch(source, /\.find\(/, 'first same-day record must not be selected arbitrarily');
  assert.match(source, /listConciergeStayReminderJobs\(stayDate, stayId\)/);
  assert.match(source, /cancelConciergeStayReminders\(stayDate, stayId\)/);
  assert.match(source, /buildConciergeStayReminderPlan\(\{ \.\.\.context, stayId \}, now\)/);
  assert.match(source, /\[stayDate, stayId\]/);
  assert.match(source, /allowedReminderKeys\.has\(reminderJobKey\(job\)\)/, 'stale sibling jobs are not displayed during a prop change');
});
