// CrewWatch account binding (reviews of #1283, P1): every roster and credential that reaches the
// watch, by Bluetooth message, Data Layer item, Sincronizar re-import or cloud, goes through the
// account-epoch rule; the phone assigns the epoch, changes it only on an explicit transition
// (another account or logout) and stamps it on every roster and credential. The behaviour runs
// in WatchAccountBindingTest (Robolectric, real routing); this keeps the wiring from drifting
// away from it. Source reads only.
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
assert.match(guard, /synchronized \(WatchCloudCredentialStore\.LOCK\) \{\s*if \(!admit\(app, snapshot\.account, epoch\)\) return null;\s*SecureSnapshotStore store = new SecureSnapshotStore\(app\);\s*WatchContextSnapshot current = store\.load\(\);\s*if \(current != null && snapshot\.generatedAtEpochMs <= current\.generatedAtEpochMs\) \{\s*return snapshot\.generatedAtEpochMs == current\.generatedAtEpochMs \? current : null;\s*\}\s*WatchContextSnapshot saved = store\.save\(rawJson\);/,
  'intake: account rule, then same-epoch freshness (older refused, same instant kept), then the save, under the cloud lock');
const cloud = strip(read(wear + 'WatchCloudClient.java'));
assert(cloud.indexOf('WatchAccountGuard.isCurrent(app, pairing.owner)') > 0
  && cloud.indexOf('WatchAccountGuard.isCurrent(app, pairing.owner)') < cloud.indexOf('store.save(json)'), 'cloud: account rule before the save');
assert.match(cloud, /!snapshot\.optString\("account", ""\)\.equals\(pairing\.owner\)/, 'cloud roster must name the pairing owner');
assert.match(cloud, /if \(!WatchAccountGuard\.admit\(app, match\.group\(1\), accountEpoch\)\) return false;/, 'a credential passes the epoch rule before it is saved');
assert.match(cloud, /\|\| !WatchAccountGuard\.isCurrent\(app, pairing\.owner\)\) return Result\.REJECTED;/, 'cloud roster only for the current account');
assert.match(guard, /if \(epoch < known\) return false;/, 'an older epoch never comes back');
const admitBody = guard.match(/static boolean admit\(Context context, String account, long epoch\) \{[\s\S]*?\n {4}\}/)?.[0] || '';
assert(admitBody && !/generatedAt/.test(admitBody), 'snapshot time is never account authority (only freshness after admission)');

// 2. Bluetooth entry points.
const service = strip(read(wear + 'CrewCheckDataLayerService.java'));
assert.equal((service.match(/WatchAccountGuard\.intake\(context, /g) || []).length, 2, 'Data Layer item and message both use intake');
assert.match(service, /WatchContract\.ACCOUNT_PATH\.equals\(path\)\) \{\s*WatchAccountGuard\.bind\(/, 'account state items handled');
assert.match(service, /WatchCloudClient\.acceptCredential\(context, dataMap\.getString\(WatchContract\.DATA_KEY_CLOUD_CREDENTIAL\),\s*dataMap\.getLong\(WatchContract\.DATA_KEY_ACCOUNT_EPOCH, 0L\)\);/);
const deleted = service.match(/static void itemDeleted\(Context context, String path\) \{[\s\S]*?\n {4}\}/)?.[0] || '';
assert(deleted && !/forgetPairing|CLOUD_PATH/.test(deleted), 'a late credential delete never ends a pairing (it carries no epoch)');
const sync = strip(read(wear + 'WatchSyncClient.java'));
assert.equal((sync.match(/WatchAccountGuard\.intake\((?:appContext|context), json, false\)/g) || []).length, 2, 'Sincronizar re-import and poll use intake without notifying');
const stateAt = sync.indexOf('WatchAccountGuard.bind('), credentialAt = sync.indexOf('WatchCloudClient.acceptCredential('), rosterAt = sync.indexOf('WatchAccountGuard.intake(appContext');
assert(stateAt > 0 && stateAt < credentialAt && credentialAt < rosterAt, 'account state, then credential, then roster');
assert.match(sync, /acceptCredential\(appContext, credential, item\.map\.getLong\(WatchContract\.DATA_KEY_ACCOUNT_EPOCH, 0L\)\)/);

// 3. Phone: one contract with the watch, the account marked and allow-listed, the epoch changed
//    only by an explicit transition and stamped on rosters and credentials, logout a new epoch
//    even with cloud sync OFF or without e-mail, and the watch's republish never a transition.
const contract = read(wear + 'WatchContract.java');
const phone = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckWatchPublisher.java');
const constant = (source, name) => source.match(new RegExp(`${name} = "([^"]+)"`))?.[1];
assert.equal(constant(phone, 'ACCOUNT_PATH'), constant(contract, 'ACCOUNT_PATH'));
assert.equal(constant(phone, 'ACCOUNT_PATH'), '/crewcheck/watch/account/v1');
assert.match(phone, /copyString\(source, out, "account", 32\);/);
const phoneCode = strip(phone);
const method = name => phoneCode.match(new RegExp(`(?:public|private) static \\w+ ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n {4}\\}`))?.[0] || '';
const clear = method('clearCloudCredential');
assert.match(clear, /remove\(LAST_SNAPSHOT\)/, 'republish never resends the former account');
assert.match(clear, /bind\(app, "", true\);/, 'logout is always a new epoch, with or without e-mail');
assert.match(clear, /path\(CLOUD_PATH\)/);
assert.match(clear, /path\(SNAPSHOT_PATH\)/, "the former account's Data Layer roster is deleted");
const bind = method('bind');
assert.match(bind, /if \(!force && \(account\.isEmpty\(\) \|\| \(epoch > 0L && account\.equals\(prefs\.getString\(KEY_BOUND_ACCOUNT, ""\)\)\)\)\) return epoch;/,
  'only another account or an explicit logout moves the epoch; an unmarked roster (expiry) never does');
assert.match(bind, /long next = Math\.max\(epoch \+ 1L, System\.currentTimeMillis\(\)\);/, 'monotonic, also after reinstall');
assert.match(bind, /PutDataMapRequest\.create\(ACCOUNT_PATH\)/);
assert.match(bind, /putString\(DATA_KEY_ACCOUNT, account\)/); assert.match(bind, /putLong\(DATA_KEY_ACCOUNT_EPOCH, next\)/); assert.match(bind, /setUrgent\(\)/);
assert.match(method('publish'), /long epoch = bind\(app, account, false\);\s*if \(epoch > 0L\) out\.put\(DATA_KEY_ACCOUNT_EPOCH, epoch\);/, 'every roster carries the epoch');
assert.match(method('publishCloudCredential'), /credential\.substring\(4, 36\)\.equals\(prefs\.getString\(KEY_BOUND_ACCOUNT, ""\)\)/, 'only the bound account pairs');
assert.match(method('publishCloudCredential'), /putLong\(DATA_KEY_ACCOUNT_EPOCH, epoch\)/);
const republish = method('republishLast');
assert.match(republish, /optLong\(DATA_KEY_ACCOUNT_EPOCH, 0L\) != prefs\.getLong\(KEY_ACCOUNT_EPOCH, -1L\)\) return;/, 'republish only within the current epoch');
assert.doesNotMatch(republish, /\bbind\(|\bpublish\(/, 'republish never moves the epoch');
for (const key of ['DATA_KEY_ACCOUNT', 'DATA_KEY_ACCOUNT_EPOCH']) assert.equal(constant(phone, key), constant(contract, key), key);
assert.match(read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java'),
  /public boolean clearWatchCloudCredential\(\) \{\s*CrewCheckWatchPublisher\.clearCloudCredential\(MainActivity\.this\);/);
assert.match(read('android-wrapper/wear/src/main/AndroidManifest.xml'), /android:pathPrefix="\/crewcheck\/watch\/"/, 'retirement items reach the listener');

console.log('PASS watch account binding wiring: every roster/credential path through the account-epoch rule, phone epoch moves only on explicit transitions, no late delete or time-based authority, contract aligned');
