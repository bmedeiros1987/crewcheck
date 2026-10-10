import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { reconcileMyCrewCareLogistics } from '../shared/myCrewCareLogistics.mjs';
import { createMyCrewCarePersistentSession } from '../shared/myCrewCarePersistentSession.mjs';

const read = (path) => readFileSync(path, 'utf8');
const allowed = [
  '.github/workflows/mycrewcare-v3-persistence.yml',
  'android-wrapper/app/build.gradle',
  'android-wrapper/app/src/main/assets/mycrewcare-transport-v3.js',
  'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCarePortalV3.java',
  'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCareProfile.java',
  'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCareRuntimeV3.java',
  'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCareSecureStore.java',
  'client/src/lib/myCrewCareV3.ts',
  'docs/mycrewcare-v3-persistent-session.md',
  'scripts/assert-mycrewcare-v3-ownership.mjs',
  'scripts/regression-mycrewcare-v3.mjs',
  'shared/myCrewCareLogistics.d.mts',
  'shared/myCrewCareLogistics.mjs',
  'shared/myCrewCareNativeAdapter.d.mts',
  'shared/myCrewCareNativeAdapter.mjs',
  'shared/myCrewCarePersistentSession.d.mts',
  'shared/myCrewCarePersistentSession.mjs',
  'shared/myCrewCareSyncPolicy.d.mts',
  'shared/myCrewCareSyncPolicy.mjs',
];

function changedFiles() {
  try {
    const base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return execFileSync('git', ['diff', '--name-only', `${base}..HEAD`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const changed = changedFiles();
if (changed.length > 0) {
  const unexpected = changed.filter((path) => !allowed.includes(path));
  assert.deepEqual(
    unexpected,
    [],
    `MyCrewCare v3 changed paths outside its isolated Mobile Core slice: ${unexpected.join(', ')}`,
  );
  for (const forbidden of [
    'client/src/pages/Home.tsx',
    'android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java',
    'scripts/v139/apply.mjs',
    'server.mjs',
    'server/platform.mjs',
  ]) assert.equal(changed.includes(forbidden), false, `Forbidden shared writer: ${forbidden}`);
}

const portal = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCarePortalV3.java');
const profile = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCareProfile.java');
const store = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCareSecureStore.java');
const runtime = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCareRuntimeV3.java');
const asset = read('android-wrapper/app/src/main/assets/mycrewcare-transport-v3.js');
const policy = read('shared/myCrewCareSyncPolicy.mjs');
const adapter = read('shared/myCrewCareNativeAdapter.mjs');
const logistics = read('shared/myCrewCareLogistics.mjs');
const sessionSource = read('shared/myCrewCarePersistentSession.mjs');
const build = read('android-wrapper/app/build.gradle');

assert.match(portal, /RELEASE_ENABLED = false/);
assert.match(portal, /Release-disabled boundary/);
assert.match(portal, /public boolean open[\s\S]*?return false/);
assert.doesNotMatch(portal, /addJavascriptInterface|CookieManager\.getInstance|loadUrl|evaluateJavascript/);
assert.match(profile, /setProfile\((?:name|profileName\(accountId\))\)/);
assert.match(profile, /restrictJavaScriptInterfaces\(\)/);
assert.match(profile, /profile\.getCookieManager\(\)/);
assert.doesNotMatch(profile, /CookieManager\.getInstance/);
assert.match(store, /AES\/GCM\/NoPadding/);
assert.match(store, /AndroidKeyStore/);
assert.match(store, /HOTEL_FACT_KEYS/);
assert.match(store, /PICKUP_FACT_KEYS/);
assert.match(store, /onlyKeys\(fact, expected\)/);
assert.match(store, /object\.length\(\) != allowed\.size\(\)/);
assert.match(store, /exactInteger/);
assert.match(runtime, /Unwired Mobile Core facade/);
assert.doesNotMatch(runtime, /@JavascriptInterface/);
assert.match(asset, /contract\.recordSelector/);
assert.match(asset, /data-crewcheck-value/);
assert.doesNotMatch(asset, /document\.body|innerHTML|localStorage|sessionStorage/);
assert.match(policy, /AUTHORIZED_HTTP/);
assert.match(policy, /defer-to-foreground/);
assert.doesNotMatch(policy, /WorkManager|setInterval/);
assert.match(adapter, /crewcheck:mycrewcare-v3/);
assert.doesNotMatch(adapter, /mycrewcare-v2|mycrewcare-v1/);
assert.match(logistics, /unmatched-provider-data/);
assert.match(sessionSource, /secure-random-unavailable/);
assert.doesNotMatch(sessionSource, /Math\.random/);
assert.match(sessionSource, /cleanup-error/);
assert.match(build, /androidx\.webkit:webkit:1\.17\.1/);

const context = {
  accountId: 'account-guard',
  rosterId: 'roster-guard',
  rosterRevision: 'revision-guard',
  providerSubject: 'subject-guard',
};
const stay = {
  id: 'stay-guard',
  rosterEventId: 'event-guard',
  rosterEventKind: 'stay',
  source: 'persisted-platform-stay',
  localOnly: false,
  ...context,
  airport: 'FOR',
  pairingId: 'PAIR-GUARD',
  hotelName: null,
  timeZone: 'America/Fortaleza',
  startAt: '2026-10-09T18:00:00Z',
  endAt: '2026-10-10T12:00:00Z',
};
const unmatched = reconcileMyCrewCareLogistics({
  context,
  stays: [stay],
  snapshot: {
    observedAt: '2026-10-09T12:00:00Z',
    records: [{
      direction: 'to_airport',
      date: '2026-10-10',
      time: '05:10',
      airport: 'GRU',
      pairingId: 'PAIR-GUARD',
      hotelName: 'Hotel não associado',
      status: 'published',
    }],
  },
  now: Date.parse('2026-10-09T12:00:00Z'),
});
assert.equal(unmatched.accepted, false);
assert.equal(unmatched.error, 'unmatched-provider-data');
assert.equal(unmatched.facts.length, 0);
assert.equal(unmatched.unmatched.length, 1);

const tamperedPayload = JSON.stringify({
  schemaVersion: 1,
  scope: context,
  syncedAt: '2026-10-09T12:00:00Z',
  emptyConfirmed: false,
  facts: [{
    schemaVersion: 1,
    accountId: context.accountId,
    rosterId: context.rosterId,
    rosterRevision: context.rosterRevision,
    observedAt: '2026-10-09T12:00:00Z',
    source: 'mycrewcare',
    status: 'published',
    providerRecordId: null,
    stayId: stay.id,
    rosterEventId: stay.rosterEventId,
    airport: stay.airport,
    pairingId: stay.pairingId,
    kind: 'pickup',
    hotelName: 'Hotel de teste',
    timeZone: stay.timeZone,
    pickupAt: '2026-10-10T08:10:00Z',
    pickupLocation: null,
    transportProvider: null,
    transportPhone: null,
    transitMinutes: null,
    contentFingerprint: '0123456789abcdef',
    unexpected: 'must-be-rejected',
  }],
});
let clearedTampered = false;
const tamperedSession = createMyCrewCarePersistentSession({
  adapter: {},
  storage: {
    read: () => tamperedPayload,
    clear: () => { clearedTampered = true; },
  },
  now: () => Date.parse('2026-10-09T12:00:00Z'),
});
tamperedSession.setContext(context, [stay]);
tamperedSession.setAutomatic(true);
assert.equal(await tamperedSession.restore(), false);
assert.equal(clearedTampered, true);
assert.equal(tamperedSession.state().hasCachedData, false);

const cleanupSession = createMyCrewCarePersistentSession({
  adapter: { disconnect: async () => { throw new Error('profile cleanup failed'); } },
  storage: { clear: async () => { throw new Error('cache cleanup failed'); } },
});
cleanupSession.setContext(context, [stay]);
cleanupSession.setAutomatic(true);
await assert.rejects(cleanupSession.logout(), /profile-disconnect-failed|cache-clear-failed/);
assert.equal(cleanupSession.state().status, 'cleanup-error');
assert.equal(cleanupSession.state().automatic, false);
assert.equal(cleanupSession.state().hasCachedData, false);

console.log(JSON.stringify({
  status: 'PASS',
  scope: 'MyCrewCare v3 isolated ownership, strict cache schema and fail-closed lifecycle',
  changed,
}));
