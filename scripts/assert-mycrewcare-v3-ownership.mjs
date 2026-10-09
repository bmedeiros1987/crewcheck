import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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
    const base = execFileSync('git', ['merge-base', 'HEAD', 'origin/main'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return execFileSync('git', ['diff', '--name-only', `${base}..HEAD`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const changed = changedFiles();
if (changed.length > 0) {
  const unexpected = changed.filter((path) => !allowed.includes(path));
  assert.deepEqual(unexpected, [], `MyCrewCare v3 changed paths outside its isolated Mobile Core slice: ${unexpected.join(', ')}`);
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
const build = read('android-wrapper/app/build.gradle');

assert.match(portal, /RELEASE_ENABLED = false/);
assert.match(portal, /Release-disabled boundary/);
assert.match(portal, /return false/);
assert.doesNotMatch(portal, /addJavascriptInterface|CookieManager\.getInstance|loadUrl|evaluateJavascript/);
assert.match(profile, /setProfile\((?:name|profileName\(accountId\))\)/);
assert.match(profile, /restrictJavaScriptInterfaces\(\)/);
assert.match(profile, /profile\.getCookieManager\(\)/);
assert.doesNotMatch(profile, /CookieManager\.getInstance/);
assert.match(store, /AES\/GCM\/NoPadding/);
assert.match(store, /AndroidKeyStore/);
assert.match(store, /static boolean valid/);
assert.match(store, /root\.length\(\) != 5|private static final Set<String> FACT/);
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
assert.match(build, /androidx\.webkit:webkit:1\.17\.1/);

console.log(JSON.stringify({ status: 'PASS', scope: 'MyCrewCare v3 isolated ownership and security fences', changed }));
