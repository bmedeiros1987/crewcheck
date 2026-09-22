import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const main = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/MainActivity.java');
const service = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/CrewCheckDataLayerService.java');
const notifications = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/WatchNotificationCenter.java');
const manifest = read('android-wrapper/wear/src/main/AndroidManifest.xml');
const face = read('android-wrapper/watchface/src/main/res/raw/watchface.xml');
const faceManifest = read('android-wrapper/watchface/src/main/AndroidManifest.xml');
const wearGradle = read('android-wrapper/wear/build.gradle');
const faceGradle = read('android-wrapper/watchface/build.gradle');
const workflow = read('.github/workflows/crewwatch-v2.yml');

assert.ok(fs.statSync('android-wrapper/wear/src/main/res/drawable-nodpi/crewcheck_official.png').size > 5_000,
  'APK deve carregar o asset oficial CrewCheck');
assert.ok(fs.statSync('android-wrapper/watchface/src/main/res/drawable-nodpi/crewcheck_official.png').size > 5_000,
  'watch face deve carregar o asset oficial CrewCheck para launcher/branding');

for (const token of [
  'crewcheck_official',
  'Notificações',
  'CrewLife  opcional',
  'renderNotifications',
  'renderCrewLife',
  'Saia às',
  'Voo atual',
  'Próxima perna',
  'Pernoite',
  'Escala no relógio',
  'Aguardando dados do celular',
  'Sincronizar'
]) assert.ok(main.toLowerCase().includes(token.toLowerCase()), 'MainActivity deve conter: ' + token);

assert.match(main, /MotionEvent\.ACTION_UP/, 'CrewWatch premium deve aceitar swipe horizontal');
assert.match(main, /screenMode = \(screenMode \+ 1\) % 4/, 'swipe deve avançar entre as quatro superfícies');
assert.match(main, /screenMode = \(screenMode \+ 3\) % 4/, 'swipe deve voltar entre as quatro superfícies');
assert.match(main, /int\[\] modes = \{MODE_NOW, MODE_NOTIFICATIONS, MODE_CREWLIFE, MODE_SCHEDULE\}/,
  'navegação deve ser compacta em page dots, sem grade de quatro botões');
assert.doesNotMatch(main, /navChip\("Agora"/,
  'grade antiga Agora/Alertas/CrewLife/Escala não deve voltar');
assert.match(main, /life\.has\("sleepMinutes"\)/,
  'CrewLife deve distinguir dado ausente de valor zero');

assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
assert.match(manifest, /@drawable\/crewcheck_official/);
assert.match(faceManifest, /@drawable\/crewcheck_official/);
assert.match(service, /WatchNotificationCenter\.postForSnapshot/);
assert.match(notifications, /last_fingerprint/);
assert.match(notifications, /IMPORTANCE_HIGH/);
assert.match(notifications, /LEAVE_SOON/);
assert.match(notifications, /BOARDING/);
assert.match(notifications, /CONNECTION/);
assert.match(notifications, /OVERNIGHT/);

assert.match(face, /x="45" y="45" width="360" height="360"/,
  'anel externo oficial deve ficar dentro da faixa CrewLife/Rotina');
assert.match(face, /x="53" y="53" width="344" height="344"/,
  'anel interno oficial deve ficar dentro da faixa CrewLife/Rotina');
assert.doesNotMatch(face, /width="406" height="406"/,
  'anel antigo não pode continuar cortando a faixa inferior');

assert.match(wearGradle, /applicationId 'com\.crewcheck\.app'/,
  'CrewWatch deve manter o mesmo package do app móvel para o Data Layer');
assert.match(faceGradle, /applicationId 'com\.crewcheck\.watch\.app'/,
  'CrewWatch Face deve usar o package já cadastrado na Play Console');
assert.match(wearGradle, /versionCode 140387/);
assert.match(wearGradle, /versionName '14\\.3\\.87-crewwatch-premium-v3'/);
assert.match(faceGradle, /versionCode 140385/);
assert.match(faceGradle, /versionName '1\.3\.1-official'/);
assert.match(workflow, /CrewCheck-CrewWatch-Official-signed-release\.apk/);
assert.match(workflow, /CrewCheck-CrewWatchFace-Official-signed-release\.apk/);
assert.match(workflow, /CrewCheck-CrewWatch-com\.crewcheck\.app-Play-Console\.aab/);
assert.match(workflow, /CrewCheck-CrewWatchFace-com\.crewcheck\.watch\.app-Play-Console\.aab/);
assert.match(workflow, /Verify Google Play package identities/);
assert.match(workflow, /package: name='com\.crewcheck\.app'/);
assert.match(workflow, /package: name='com\.crewcheck\.watch\.app'/);
assert.match(workflow, /PACKAGE_MAP\.txt/);
assert.match(workflow, /regression-crewwatch-official-ui\.mjs/);

console.log('CrewWatch Official UI + notifications contract: PASS');
