// CrewWatch account binding (review of #1283, P1 residual): every roster that reaches the watch,
// by Bluetooth message, Data Layer item, Sincronizar re-import or cloud, goes through the
// account rule, and the phone retires the account that leaves (logout/account change) on its
// own channel, one item per account. The behaviour itself runs in WatchAccountBindingTest
// (Robolectric); this keeps the wiring from drifting away from it. Source reads only.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const wear = 'android-wrapper/wear/src/main/java/com/crewcheck/watch/';
const read = file => fs.readFileSync(file, 'utf8');
const strip = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// 1. Only the guard and the cloud client (after the guard admits) save a roster; the debug demo
//    is the single local exception.
for (const file of fs.readdirSync(wear).filter(name => name.endsWith('.java'))) {
  const code = strip(read(wear + file));
  const saves = code.match(/\b(?:new SecureSnapshotStore\([^)]*\)|store)\.save\(/g) || [];
  if (file === 'WatchAccountGuard.java' || file === 'WatchCloudClient.java') assert.equal(saves.length, 1, `${file}: one roster save`);
  else if (file === 'MainActivity.java') assert.match(code, /if \(BuildConfig\.DEBUG\) \{[\s\S]*store\.save\(WatchContextSnapshot\.demo\(/, 'demo save is debug-only');
  else assert.equal(saves.length, 0, `${file} must route rosters through WatchAccountGuard.intake`);
}
const guard = strip(read(wear + 'WatchAccountGuard.java'));
assert.match(guard, /synchronized \(WatchCloudCredentialStore\.LOCK\) \{\s*if \(!admit\(app, snapshot\.account, snapshot\.generatedAtEpochMs\)\) return null;\s*WatchContextSnapshot saved = new SecureSnapshotStore\(app\)\.save\(rawJson\);/,
  'intake: account rule before the save, under the cloud lock');
const cloud = strip(read(wear + 'WatchCloudClient.java'));
assert(cloud.indexOf('WatchAccountGuard.admit(app, pairing.owner, generatedAt)') > 0
  && cloud.indexOf('WatchAccountGuard.admit(app, pairing.owner, generatedAt)') < cloud.indexOf('store.save(json)'), 'cloud: account rule before the save');
assert.match(cloud, /!snapshot\.optString\("account", ""\)\.equals\(pairing\.owner\)/, 'cloud roster must name the pairing owner');
assert.match(cloud, /WatchAccountGuard\.credentialFor\(app, match\.group\(1\)\);/, 'a credential of another account switches first');

// 2. Bluetooth entry points.
const service = strip(read(wear + 'CrewCheckDataLayerService.java'));
assert.equal((service.match(/WatchAccountGuard\.intake\(this, /g) || []).length, 2, 'Data Layer item and message both use intake');
assert.match(service, /path\.startsWith\(WatchContract\.ACCOUNT_PATH \+ "\/"\)\) \{\s*WatchAccountGuard\.retire\(/, 'retirement items handled');
const sync = strip(read(wear + 'WatchSyncClient.java'));
assert.equal((sync.match(/WatchAccountGuard\.intake\((?:appContext|context), json, false\)/g) || []).length, 2, 'Sincronizar re-import and poll use intake without notifying');
const retireAt = sync.indexOf('WatchAccountGuard.retire('), credentialAt = sync.indexOf('WatchCloudClient.acceptCredential('), rosterAt = sync.indexOf('WatchAccountGuard.intake(appContext');
assert(retireAt > 0 && retireAt < credentialAt && credentialAt < rosterAt, 'retirements, then credential, then roster');

// 3. Phone: one contract with the watch, the account marked and allow-listed, and logout/account
//    change retiring that account even with cloud sync OFF.
const contract = read(wear + 'WatchContract.java');
const phone = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckWatchPublisher.java');
const constant = (source, name) => source.match(new RegExp(`${name} = "([^"]+)"`))?.[1];
assert.equal(constant(phone, 'ACCOUNT_PATH'), constant(contract, 'ACCOUNT_PATH'));
assert.equal(constant(phone, 'ACCOUNT_PATH'), '/crewcheck/watch/account/v1');
assert.match(phone, /copyString\(source, out, "account", 32\);/);
const clear = strip(phone).match(/public static void clearCloudCredential\(Context context, String account\) \{[\s\S]*?\n {4}\}/)?.[0] || '';
assert.match(clear, /remove\(LAST_SNAPSHOT\)/, 'republish never resends the former account');
assert.match(clear, /path\(CLOUD_PATH\)/);
assert.match(clear, /path\(SNAPSHOT_PATH\)/, "the former account's Data Layer roster is deleted");
assert.match(clear, /PutDataMapRequest\.create\(ACCOUNT_PATH \+ "\/" \+ account\)/, 'one retirement item per account');
assert.match(clear, /putString\("retiredAccount", account\)/);
assert.match(clear, /putLong\("retiredAtEpochMs", System\.currentTimeMillis\(\)\)/);
assert.match(clear, /setUrgent\(\)/);
assert.equal(constant(contract, 'DATA_KEY_RETIRED_ACCOUNT'), 'retiredAccount');
assert.equal(constant(contract, 'DATA_KEY_RETIRED_AT'), 'retiredAtEpochMs');
assert.match(read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java'),
  /public boolean clearWatchCloudCredential\(final String account\) \{\s*CrewCheckWatchPublisher\.clearCloudCredential\(MainActivity\.this, account\);/);
assert.match(read('android-wrapper/wear/src/main/AndroidManifest.xml'), /android:pathPrefix="\/crewcheck\/watch\/"/, 'retirement items reach the listener');

console.log('PASS watch account binding wiring: every roster path through WatchAccountGuard, retirement per account on logout/account change, phone/watch contract aligned');
