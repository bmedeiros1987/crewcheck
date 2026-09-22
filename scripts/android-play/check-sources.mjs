import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(p, 'utf8');
const policy = JSON.parse(read('scripts/android-play/release-policy.json'));
const seen = new Set();
for (const [module, spec] of Object.entries(policy.artifacts)) {
  const gradle = read(`android-wrapper/${module}/build.gradle`);
  assert.ok(gradle.includes(`versionCode ${spec.versionCode}`));
  assert.ok(gradle.includes("apply from: rootProject.file('store-policy.gradle')"));
  assert.ok(spec.versionCode > policy.knownMaxVersionCode[spec.package]);
  assert.ok(!seen.has(`${spec.package}:${spec.versionCode}`));
  seen.add(`${spec.package}:${spec.versionCode}`);
  const manifest = read(`android-wrapper/${module}/src/main/AndroidManifest.xml`);
  assert.doesNotMatch(manifest, /android\.permission\.health\.|healthdata|HEALTH_PERMISSIONS|health\.ACTION/);
  if (module === 'app') assert.doesNotMatch(manifest, /android.hardware.type.watch/);
}
const bridge = read('android-wrapper/app/src/store/java/com/crewcheck/app/CrewCheckHealthBridge.java');
assert.doesNotMatch(bridge, /androidx.health|startActivity|evaluateJavascript|getOrCreate|readRecords/);
const ui = read('client/src/components/v1434/CrewCheckLifeView.tsx');
assert.match(ui, /CrewLife opcional · registros manuais/);
assert.doesNotMatch(ui, /<h3>Health Connect \+ Samsung Health<\/h3>/);
assert.match(ui, /const \[nativeSummary[^\n]+\(\(\) => \(\{\}\)\)/);
assert.match(ui, /Ignore legacy health events/);
assert.match(ui, /if \(!consent.active \|\| !watchMirrorEnabled\) return/);
assert.match(ui, /payload.sleepMinutes = Math.round\(manual.sleepHours \* 60\)/);
console.log('[android-play] Canonical store source contracts passed.');
