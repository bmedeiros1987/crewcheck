import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');

const settings = read('android-wrapper/settings.gradle');
const wearGradle = read('android-wrapper/wear/build.gradle');
const faceGradle = read('android-wrapper/watchface/build.gradle');
const wearMain = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/MainActivity.java');
const dataService = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/CrewCheckDataLayerService.java');
const phoneMain = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const lifeView = read('client/src/components/v1434/CrewCheckLifeView.tsx');

assert.match(settings, /include ':wear'/);
assert.match(settings, /include ':watchface'/);

assert.match(wearGradle, /applicationId 'com\.crewcheck\.app'/);
assert.match(faceGradle, /applicationId 'com\.crewcheck\.watch\.app'/);
assert.match(wearGradle, /generateCrewWatchBrandAssets/);
assert.match(faceGradle, /generateCrewWatchFaceBrandAssets/);

assert.match(wearMain, /CrewLife no relógio ainda não autorizado/);
assert.match(wearMain, /renderNotifications/);
assert.match(wearMain, /renderCrewLife/);
assert.match(wearMain, /renderSchedule/);
assert.match(wearMain, /HORA DE SAIR/);
assert.match(wearMain, /APRESENTAÇÃO/);
assert.match(wearMain, /VOO ATUAL/);
assert.match(wearMain, /CONEXÃO/);
assert.match(wearMain, /PERNOITE/);

assert.match(dataService, /CREWLIFE_PATH/);
assert.match(dataService, /ROUTINE_PATH/);

assert.match(phoneMain, /watchLifeStatus\(\)/);
assert.match(phoneMain, /setWatchLifeConsent/);
assert.match(phoneMain, /publishWatchCrewLife/);
assert.match(phoneMain, /CrewLifeWatchPublisher\.publishCrewLife/);

assert.match(lifeView, /Mostrar CrewLife no relógio/);
assert.match(lifeView, /Espelhamento autorizado/);
assert.match(lifeView, /publishWatchCrewLife/);
assert.match(lifeView, /Nenhum dado bruto é enviado/);

console.log('[crewwatch-premium-consolidated] contracts OK');
