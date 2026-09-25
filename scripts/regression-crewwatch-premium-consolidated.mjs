import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');

const settings = read('android-wrapper/settings.gradle');
const wearGradle = read('android-wrapper/wear/build.gradle');
const faceGradle = read('android-wrapper/watchface/build.gradle');
const wearMain = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/MainActivity.java');
const wearStyles = read('android-wrapper/wear/src/main/res/values/styles.xml');
const dataService = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/CrewCheckDataLayerService.java');
// Existing read-only interoperability checks are not ownership of phone implementations.
const phoneMain = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const lifeView = read('client/src/components/v1434/CrewCheckLifeView.tsx');

assert.match(settings, /include ':wear'/);
assert.match(settings, /include ':watchface'/);

assert.match(wearGradle, /applicationId 'com\.crewcheck\.app'/);
assert.match(faceGradle, /applicationId 'com\.crewcheck\.watch\.app'/);
assert.match(wearGradle, /generateCrewWatchBrandAssets/);
assert.match(faceGradle, /generateCrewWatchFaceBrandAssets/);

// Sem resumo e resumo vencido são estados separados; nenhum afirma consentimento negado.
assert.doesNotMatch(wearMain, /ainda não autorizado/);
assert.match(wearMain, /Nenhum resumo CrewLife neste relógio/);
assert.match(wearMain, /Resumo desatualizado/);
assert.match(wearMain, /renderNotifications/);
assert.match(wearMain, /renderCrewLife/);
assert.match(wearMain, /renderSchedule/);
assert.match(wearMain, /HORA DE SAIR/);
assert.match(wearMain, /APRESENTAÇÃO/);
assert.match(wearMain, /VOO ATUAL/);
assert.match(wearMain, /CONEXÃO/);
assert.match(wearMain, /PERNOITE/);
assert.match(wearMain, /delayUntilNextMinute/);
assert.match(wearMain, /updateAmbientClock/);
assert.match(wearStyles, /windowBackground">#000000/);

assert.match(wearMain, /registerChangeListener\(dataListener\)/);
assert.match(wearMain, /unregisterChangeListener\(dataListener\)/);
assert.match(wearMain, /private final Runnable dataRefresh = this::renderSnapshot;/);
assert.doesNotMatch(wearMain, /removeCallbacks\(this::/, 'removeCallbacks precisa do mesmo Runnable, não de uma referência nova');
assert.match(wearMain, /if \(renderedSnapshotExpired\(\)\) renderSnapshot\(\);/);
assert.match(wearMain, /backToNow\.setEnabled\(!ambient && screenMode != MODE_NOW\)/);
assert.doesNotMatch(wearMain, /setEnabled\(false\);\s*getOnBackPressedDispatcher\(\)\.onBackPressed\(\)/);
assert.match(wearMain, /List<NotificationItem> alerts = operationalAlerts\(snapshot, now\);/);
assert.doesNotMatch(wearMain, /int alertCount\(WatchContextSnapshot/);
assert.match(wearMain, /decorative\(logo\);/);
assert.match(wearMain, /decorative\(icon\);/);
assert.ok((wearMain.match(/setAccessibilityHeading\(true\)/g) || []).length >= 5);
assert.ok((wearMain.match(/setScreenReaderFocusable\(true\)/g) || []).length >= 5);
assert.match(wearMain, /chip\.setSelected\(selected\);/);
assert.match(wearMain, /badge\.setContentDescription\(/);
assert.match(wearMain, /scroll\.setVerticalScrollBarEnabled\(true\);/, 'Play recusou a tela sem barra de rolagem');
assert.doesNotMatch(wearMain, /setVerticalScrollBarEnabled\(false\)/);
assert.match(wearMain, /AmbientModeSupport\.EXTRA_BURN_IN_PROTECTION/);
assert.match(wearMain, /AmbientModeSupport\.EXTRA_LOWBIT_AMBIENT/);
assert.match(wearMain, /applyBurnInShift\(\);\n    \}/, 'o tick do ambiente precisa deslocar o conteúdo');
assert.match(wearMain, /scroll\.scrollTo\(0, keepScroll\)/);
assert.match(wearMain, /setAutoSizeTextTypeUniformWithConfiguration/);
assert.doesNotMatch(wearMain, /\.value\.length\(\) > 1[24] \?/);

// Phone cadence implementation + all cadence assertions were transferred to Mobile
// Core #824 (regression-mobile-watch-publish-cadence.mjs). Wear does not require an
// unmerged phone optimization to work with the existing v1 producer.
const syncClient = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/WatchSyncClient.java');
const triage = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/DataItemTriage.java');
assert.match(triage, /CREWLIFE\(WatchContract\.CREWLIFE_PATH, WatchContract\.DATA_KEY_CREWLIFE_JSON\)/);
assert.match(triage, /ROUTINE\(WatchContract\.ROUTINE_PATH, WatchContract\.DATA_KEY_ROUTINE_JSON\)/);
assert.match(syncClient, /DataItemTriage\.Channel\.CREWLIFE/);
assert.match(syncClient, /clearCrewLife\(\)/, 'saúde ausente no Data Layer não fica retida no relógio');
assert.match(wearMain, /WatchSyncClient\.refresh\(this, crewLifeRequest,/);
assert.match(wearMain, /report\.crewLifeStatus\(\)/);
assert.ok(fs.existsSync('android-wrapper/wear/src/test/java/com/crewcheck/watch/CrewLifeSyncTest.java'));
const notificationCenter = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/WatchNotificationCenter.java');
assert.match(notificationCenter, /if \(snapshot\.isStale\(System\.currentTimeMillis\(\)\)\) return;/);
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
