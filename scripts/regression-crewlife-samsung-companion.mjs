import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');

const settings = read('android-wrapper/settings.gradle');
const companionGradle = read('android-wrapper/lifecompanion/build.gradle');
const companionManifest = read('android-wrapper/lifecompanion/src/main/AndroidManifest.xml');
const runtime = read('android-wrapper/lifecompanion/src/main/java/com/crewcheck/life/SamsungHealthRuntime.java');
const provider = read('android-wrapper/lifecompanion/src/main/java/com/crewcheck/life/LifeSummaryProvider.java');
const store = read('android-wrapper/lifecompanion/src/main/java/com/crewcheck/life/LifeSummaryStore.java');
const mobileManifest = read('android-wrapper/app/src/main/AndroidManifest.xml');
const mobile = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const life = read('client/src/components/v1434/CrewCheckLifeView.tsx');

assert.match(settings, /include ':lifecompanion'/);
assert.match(companionGradle, /applicationId 'com\.crewcheck\.life'/);
assert.match(companionGradle, /samsung-health-data-api\.aar/);
assert.match(companionGradle, /SAMSUNG_HEALTH_SDK_INCLUDED/);
assert.match(companionGradle, /release requires android-wrapper\/lifecompanion\/libs\/samsung-health-data-api\.aar/);
assert.match(companionGradle, /com\.google\.code\.gson:gson:2\.9\.0/);

assert.match(companionManifest, /com\.crewcheck\.permission\.LIFE_SUMMARY/);
assert.match(companionManifest, /android:protectionLevel="signature"/);
assert.match(companionManifest, /com\.crewcheck\.life\.summary/);
assert.doesNotMatch(companionManifest, /android\.permission\.health\./);
assert.doesNotMatch(companionManifest, /BODY_SENSORS/);

assert.match(runtime, /"STEPS", "SLEEP", "ACTIVITY_SUMMARY", "ENERGY_SCORE"/);
assert.match(runtime, /AccessType/);
assert.match(runtime, /requestPermissionsAsync/);
assert.match(runtime, /aggregateDataAsync/);
assert.match(runtime, /readDataAsync/);
assert.match(runtime, /"automatic", true/);
assert.doesNotMatch(runtime, /BLOOD_GLUCOSE|BLOOD_PRESSURE|SLEEP_APNEA|IRREGULAR/);

assert.match(provider, /read-only/);
assert.match(store, /AndroidKeyStore/);
assert.match(store, /AES\/GCM\/NoPadding/);
assert.doesNotMatch(store, /putString\(LEGACY_JSON, summary\.toString/);
assert.match(mobileManifest, /com\.crewcheck\.permission\.LIFE_SUMMARY/);
assert.match(mobileManifest, /com\.crewcheck\.life/);
assert.match(mobile, /lifeCompanionStatus\(\)/);
assert.match(mobile, /readLifeCompanionSummary\(\)/);
assert.match(mobile, /openLifeCompanion\(\)/);
assert.match(mobile, /crewcheck:life-companion-summary/);

assert.match(life, /CrewLife Companion Samsung/);
assert.match(life, /Samsung Health · automático/);
assert.match(life, /energyScore/);
assert.match(life, /companionSummary\.automatic/);
assert.match(life, /nativeHealthEnabled/);
assert.match(life, /Energy Score/);

console.log('[crewlife-samsung-companion] automatic local Samsung integration contracts OK');
