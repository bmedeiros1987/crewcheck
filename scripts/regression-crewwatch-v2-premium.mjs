import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const manifest = read('android-wrapper/wear/src/main/AndroidManifest.xml');
const activity = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/MainActivity.java');
const faceInfo = read('android-wrapper/watchface/src/main/res/xml/watch_face_info.xml');
const face = read('android-wrapper/watchface/src/main/res/raw/watchface.xml');
const gradle = read('android-wrapper/wear/build.gradle');
const phoneGradle = read('android-wrapper/app/build.gradle');
const phoneManifest = read('android-wrapper/app/src/main/AndroidManifest.xml');
const phoneActivity = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const phonePublisher = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckWatchPublisher.java');
const home = read('client/src/pages/Home.tsx');
const watchContext = read('client/src/lib/watchContext.ts');

assert.match(manifest, /android\.permission\.WAKE_LOCK/, 'ambient support requires WAKE_LOCK');
assert.match(manifest, /android:screenOrientation="portrait"/, 'watch activity must not rotate with wrist sensors');
assert.match(manifest, /configChanges="orientation\|screenSize\|smallestScreenSize"/, 'orientation changes must not recreate the activity');

assert.match(activity, /AmbientModeSupport\.attach\(this\)/, 'activity must attach Wear ambient support');
assert.match(activity, /SCREEN_ORIENTATION_PORTRAIT/, 'runtime orientation guard is required');
assert.match(activity, /private Primary primaryFor\(/, 'v2 must derive a single primary action');
assert.match(activity, /if \(added >= 2\) break;/, 'supporting facts must be capped for glance-first density');
assert.doesNotMatch(activity, /text\(LocalTime\.now\(\)\.format\(clockFormatter\), 29/, 'large duplicate clock must not return');
assert.match(activity, /"HORA DE SAIR"/, 'leave-by state must be first-class');
assert.match(activity, /"APRESENTAÇÃO"/, 'reporting state must be first-class');
assert.match(activity, /"PERNOITE"/, 'overnight state must be first-class');
assert.match(activity, /isRoundScreen\(\) \? dp\(38\) : dp\(20\)/, 'Galaxy Watch round screen needs hardware-validated horizontal safe inset');
assert.match(activity, /int topSafe = isRoundScreen\(\) \? dp\(24\) : dp\(10\)/, 'round screen needs top arc safe inset');
assert.match(activity, /"Abra no celular"/, 'empty state must fit the round screen without awkward CrewCheck word wrapping');

assert.match(gradle, /androidx\.wear:wear:1\.4\.0/, 'stable Wear AndroidX ambient dependency must be pinned');
assert.match(faceInfo, /<MultipleInstancesAllowed value="false" \/>/, 'pilot face should use a single stable instance');
assert.match(face, /<Variant mode="AMBIENT"/, 'watch face must explicitly handle ambient mode');
assert.match(face, /<!\[CDATA\[AGORA\]\]>/, 'watch face should expose the next-action concept');

assert.match(phoneGradle, /play-services-wearable:20\.0\.1/, 'paired phone shell must include Wear Data Layer transport');
assert.match(phoneManifest, /CrewCheckWatchSyncService/, 'phone must answer watch resync requests in background');
assert.match(phoneActivity, /syncWatchSnapshot/, 'native phone bridge must accept canonical watch snapshots');
assert.match(phonePublisher, /\/crewcheck\/watch\/context\/v1/, 'phone and watch must use the same snapshot path');
assert.match(phonePublisher, /rejectSensitiveFields/, 'phone publisher must reject sensitive fields before Data Layer transport');
assert.match(home, /buildCrewCheckWatchSnapshot/, 'Home must consume the isolated watch projection');
assert.match(home, /crewcheck:watch-snapshot/, 'web runtime must publish live watch snapshots');
assert.match(watchContext, /export function buildCrewCheckWatchSnapshot/, 'watch projection must survive Home preparation patches as an isolated module');
assert.match(watchContext, /canonical\?\.startDateTime/, 'watch context must derive timing from canonical event timestamps');
assert.match(watchContext, /route: WatchRouteContext \| null = null/, 'leave-time support must accept only an explicit fresh route context');

console.log('PASS CrewWatch v2: hardware-safe round UI, live phone sync, portrait lock, ambient support, glance-first hierarchy and face contract');
