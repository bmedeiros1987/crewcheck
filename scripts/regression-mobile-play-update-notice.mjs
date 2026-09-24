import assert from 'node:assert/strict';
import fs from 'node:fs';

const gradle = fs.readFileSync('android-wrapper/app/build.gradle', 'utf8');
const activity = fs.readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', 'utf8');
const coordinatorPath = 'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckPlayUpdateCoordinator.java';
assert.ok(fs.existsSync(coordinatorPath), 'phone app must own a Play update availability coordinator');
const coordinator = fs.readFileSync(coordinatorPath, 'utf8');

assert.match(gradle, /implementation ['"]com\.google\.android\.play:app-update:2\.1\.0['"]/, 'use the official Play In-App Update library pinned by Android Developers');
assert.match(coordinator, /AppUpdateManagerFactory\.create\(/, 'coordinator must query Google Play through AppUpdateManager');
assert.match(coordinator, /UpdateAvailability\.UPDATE_AVAILABLE/, 'coordinator must distinguish a real Play update from transient failures');
assert.match(coordinator, /availableVersionCode\(\)/, 'notice must be keyed to the Play version code');
assert.match(coordinator, /crewcheck_play_update_notice/, 'notice throttling must be persisted locally');
assert.match(coordinator, /24L \* 60L \* 60L \* 1000L/, 'the same available version must not nag on every resume');
assert.match(coordinator, /crewcheck:native-update-status/, 'web shell must receive a backward-compatible phone-side update status event');

assert.doesNotMatch(coordinator, /AppUpdateType\.IMMEDIATE/, 'an update availability check must never force an immediate update');
assert.doesNotMatch(coordinator, /startUpdateFlowForResult/, 'this slice must not interrupt an operational session with a Play consent flow');
assert.doesNotMatch(coordinator, /completeUpdate\s*\(/, 'this slice must never restart the app to install an update');
assert.doesNotMatch(coordinator, /clearData|clearCache|deleteDatabase|CookieManager|localStorage|sessionStorage/, 'update notice must not clear session, roster or cache state');

assert.match(activity, /private CrewCheckPlayUpdateCoordinator playUpdateCoordinator;/, 'MainActivity must own the phone-side coordinator lifecycle');
assert.match(activity, /playUpdateCoordinator = new CrewCheckPlayUpdateCoordinator\(this, webView\);/, 'coordinator must bind only after the canonical WebView exists');
assert.match(activity, /if \(playUpdateCoordinator != null\) playUpdateCoordinator\.checkForUpdate\(\);/, 'each foreground entry may re-check Play safely');
assert.match(activity, /if \(playUpdateCoordinator != null\) playUpdateCoordinator\.destroy\(\);/, 'coordinator resources must be released with the Activity');

console.log('[mobile-play-update] OK — Play availability is surfaced without forced install/reload or operational-state clearing.');
