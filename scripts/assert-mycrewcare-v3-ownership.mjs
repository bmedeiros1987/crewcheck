import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { reconcileMyCrewCareLogistics, normalizeMyCrewCareStays } from '../shared/myCrewCareLogistics.mjs';
import { createMyCrewCarePersistentSession } from '../shared/myCrewCarePersistentSession.mjs';

const read = (path) => readFileSync(path, 'utf8');
const allowed = [
  'scripts/build-mycrewcare-observed-asset.mjs',
  'scripts/regression-mycrewcare-native-observation.mjs',
  'scripts/fixtures/mycrewcare-native/ObservedAcquisitionHarness.java',
  'shared/myCrewCareObservedCoordinator.mjs',
  'scripts/regression-mycrewcare-observed-coordinator.mjs',
  'shared/myCrewCareObservedContract.mjs',
  'scripts/regression-mycrewcare-observed.mjs',
  'docs/mycrewcare-observed-contract-off.md',
  'scripts/fixtures/mycrewcare-observed/README.md',
  'scripts/fixtures/mycrewcare-observed/SHA256SUMS',
  'scripts/fixtures/mycrewcare-observed/expectations.synthetic.json',
  'scripts/fixtures/mycrewcare-observed/mytravel.synthetic.html',
  'scripts/fixtures/mycrewcare-observed/profile.synthetic.html',
  'scripts/fixtures/mycrewcare-observed/reservation.synthetic.html',
  '.github/workflows/mycrewcare-v3-persistence.yml',
  'android-wrapper/app/build.gradle',
  'android-wrapper/app/src/main/assets/mycrewcare-transport-v3.js',
  'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCarePortalV3.java',
  'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCareProfile.java',
  'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCareRuntimeV3.java',
  'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckMyCrewCareSecureStore.java',
  'client/src/components/mycrewcare/MyCrewCareV3Panel.tsx',
  'client/src/hooks/useMyCrewCareV3.ts',
  'client/src/lib/myCrewCareV3.ts',
  'client/src/lib/myCrewCareV3Runtime.ts',
  'docs/mycrewcare-v3-persistent-session.md',
  'scripts/assert-mycrewcare-v3-ownership.mjs',
  'scripts/regression-mycrewcare-controller.mjs',
  'scripts/regression-mycrewcare-v3.mjs',
  'shared/myCrewCareController.d.mts',
  'shared/myCrewCareController.mjs',
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
assert.match(store, /stayFingerprint/);
assert.match(store, /exactInteger\(root, "schemaVersion", 2\)/);
assert.match(store, /HOTEL_FACT_KEYS/);
assert.match(store, /PICKUP_FACT_KEYS/);
assert.match(store, /onlyKeys\(fact, expected\)/);
assert.match(store, /object\.length\(\) != allowed\.size\(\)/);
assert.match(store, /exactInteger/);
assert.match(runtime, /Unwired Mobile Core facade/);
assert.match(runtime, /startMyCrewCareCleanupV3/);
assert.match(runtime, /myCrewCareCleanupResultV3/);
assert.doesNotMatch(runtime, /disconnectMyCrewCareV3/, 'cleanup must report its real asynchronous result');
assert.match(profile, /interface CleanupCallback/);
assert.doesNotMatch(profile, /catch \(RuntimeException ignored\)[\s\S]{0,120}\n\s*\}\s*\n\s*\}\);[\s\S]*clear/, 'profile cleanup must not swallow failures');
assert.match(adapter, /native-disconnect-timeout/);
assert.doesNotMatch(runtime, /@JavascriptInterface/);
assert.match(asset, /Generated from shared\/myCrewCareObservedContract\.mjs/);
assert.match(asset, /operationalImportAllowed: false/);
assert.match(asset, /explicitPickupDate: null/);
assert.doesNotMatch(asset, /status = 'published'/);
assert.match(portal, /ObservedAcquisition/);
assert.match(portal, /observed-timeout/);
assert.doesNotMatch(runtime, /@JavascriptInterface/);
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

// Interface wiring stays off and unmounted until a separately reviewed change.
const controllerSource = read('shared/myCrewCareController.mjs');
assert.match(controllerSource, /export const MYCREWCARE_UI_ENABLED = false;/);
assert.match(controllerSource, /nativeReady\(bridge\)/);
assert.doesNotMatch(controllerSource, /setTimeout|setInterval|WorkManager/);
const mountable = execFileSync('git', ['ls-files', 'client/src'], { encoding: 'utf8' }).trim().split('\n')
  .filter((path) => /\.(tsx?|jsx?)$/.test(path) && !/myCrewCare|MyCrewCare/.test(path));
for (const path of mountable) {
  assert.doesNotMatch(read(path), /MyCrewCareV3Panel|useMyCrewCareV3|myCrewCareV3Runtime|myCrewCareController/, `${path} must not mount the disabled MyCrewCare interface`);
}

// The privacy P0 gate forbids user-facing corporate portal references. Enforce the
// same list inside this slice so a violation cannot be discovered only in CI.
for (const path of [
  'client/src/components/mycrewcare/MyCrewCareV3Panel.tsx',
  'client/src/hooks/useMyCrewCareV3.ts',
  'client/src/lib/myCrewCareV3.ts',
  'client/src/lib/myCrewCareV3Runtime.ts',
  'docs/mycrewcare-v3-persistent-session.md',
]) {
  assert.doesNotMatch(read(path), /iFlight Admin|Calendar Sweep iFlight|conta corporativa|login corporativo/i,
    `${path} must not carry a forbidden user-facing portal reference`);
}

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
  schemaVersion: 2,
  stayFingerprint: createHash('sha256').update(JSON.stringify(normalizeMyCrewCareStays([stay], context))).digest('hex'),
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
// Prove the same schema/binding is accepted before testing the extra fact key.
const untampered = JSON.parse(tamperedPayload);
delete untampered.facts[0].unexpected;
const validSession = createMyCrewCarePersistentSession({
  storage: { read: () => JSON.stringify(untampered) }, now: () => Date.parse('2026-10-09T12:00:00Z'),
});
validSession.setContext(context, [stay]);
assert.equal(await validSession.restore(), true);

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
