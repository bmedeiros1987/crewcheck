import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');

const settings = read('android-wrapper/settings.gradle');
const wearGradle = read('android-wrapper/wear/build.gradle');
const faceGradle = read('android-wrapper/watchface/build.gradle');
const wearMain = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/MainActivity.java');
const dataService = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/CrewCheckDataLayerService.java');
const contract = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/WatchContract.java');
const snapshot = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/WatchContextSnapshot.java');
const protocol = read('docs/peripherals/watch_snapshot_v1.md');

assert.match(settings, /include ':wear'/);
assert.match(settings, /include ':watchface'/);
assert.match(wearGradle, /applicationId 'com\.crewcheck\.app'/);
assert.match(faceGradle, /applicationId 'com\.crewcheck\.watch\.app'/);

assert.match(wearMain, /renderSchedule/);
assert.match(wearMain, /HORA DE SAIR/);
assert.match(wearMain, /APRESENTAÇÃO/);
assert.match(wearMain, /VOO ATUAL/);
assert.match(wearMain, /CONEXÃO/);
assert.match(wearMain, /PERNOITE/);
assert.match(wearMain, /navigationButton/);
assert.match(dataService, /CREWLIFE_PATH/);
assert.match(dataService, /ROUTINE_PATH/);

assert.match(contract, /SNAPSHOT_PROTOCOL = "watchSnapshotV1"/);
assert.match(contract, /SCHEMA_VERSION = 1/);
assert.match(snapshot, /generatedAtEpochMs obrigatório/);
assert.match(snapshot, /validUntilEpochMs obrigatório/);
assert.match(snapshot, /optBoolean\("premiumAccess", false\)/);
assert.match(snapshot, /optJSONArray\("schedule"\)/);

assert.match(protocol, /Obrigatórios:/);
assert.match(protocol, /Opcionais e defaults/);
assert.match(protocol, /peer v1 antigo/);
assert.match(protocol, /Downgrade Premium → Free/);
assert.match(protocol, /Handoff para Mobile Core/);
assert.match(protocol, /Nenhuma implementação de `android-wrapper\/app\/\*\*` ou `client\/\*\*`/);

console.log('[crewwatch-peripherals] portable contract OK');
