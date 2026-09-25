import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');

const settings = read('android-wrapper/settings.gradle');
const wearGradle = read('android-wrapper/wear/build.gradle');
const faceGradle = read('android-wrapper/watchface/build.gradle');
const wearMain = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/MainActivity.java');
const wearStyles = read('android-wrapper/wear/src/main/res/values/styles.xml');
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
assert.match(wearMain, /delayUntilNextMinute/);
assert.match(wearMain, /updateAmbientClock/);
assert.match(wearStyles, /windowBackground">#000000/);

// Tela aberta acompanha o celular: dados novos redesenham sem toque, e dado vencido não
// fica aceso no sempre-ligado.
assert.match(wearMain, /registerChangeListener\(dataListener\)/);
assert.match(wearMain, /unregisterChangeListener\(dataListener\)/);
assert.match(wearMain, /private final Runnable dataRefresh = this::renderSnapshot;/);
assert.doesNotMatch(wearMain, /removeCallbacks\(this::/, 'removeCallbacks precisa do mesmo Runnable, não de uma referência nova');
assert.match(wearMain, /if \(renderedSnapshotExpired\(\)\) renderSnapshot\(\);/);
// Voltar sobe um nível sem se desligar para sempre na raiz.
assert.match(wearMain, /backToNow\.setEnabled\(!ambient && screenMode != MODE_NOW\)/);
assert.doesNotMatch(wearMain, /setEnabled\(false\);\s*getOnBackPressedDispatcher\(\)\.onBackPressed\(\)/);
// Selo, chip e tela de alertas contam a mesma lista.
assert.match(wearMain, /List<NotificationItem> alerts = operationalAlerts\(snapshot, now\);/);
assert.doesNotMatch(wearMain, /int alertCount\(WatchContextSnapshot/);
// Leitor de tela: decoração fora, títulos como cabeçalho, quadros lidos de uma vez e
// o chip da tela atual anunciando o estado.
assert.match(wearMain, /decorative\(logo\);/);
assert.match(wearMain, /decorative\(icon\);/);
assert.ok((wearMain.match(/setAccessibilityHeading\(true\)/g) || []).length >= 5);
assert.ok((wearMain.match(/setScreenReaderFocusable\(true\)/g) || []).length >= 5);
assert.match(wearMain, /chip\.setSelected\(selected\);/);
assert.match(wearMain, /badge\.setContentDescription\(/);
// Recusas da revisão do Play de 24/09/2026: fundo preto e barra de rolagem visível.
assert.match(wearMain, /scroll\.setVerticalScrollBarEnabled\(true\);/, 'Play recusou a tela sem barra de rolagem');
assert.doesNotMatch(wearMain, /setVerticalScrollBarEnabled\(false\)/);
// Sempre-ligado: deslocamento anti-burn-in e tinta de low-bit.
assert.match(wearMain, /AmbientModeSupport\.EXTRA_BURN_IN_PROTECTION/);
assert.match(wearMain, /AmbientModeSupport\.EXTRA_LOWBIT_AMBIENT/);
assert.match(wearMain, /applyBurnInShift\(\);\n    \}/, 'o tick do ambiente precisa deslocar o conteúdo');
// Dado novo do celular não joga a leitura de volta ao topo.
assert.match(wearMain, /scroll\.scrollTo\(0, keepScroll\)/);
// Valor herói medido, não chutado por contagem de caracteres.
assert.match(wearMain, /setAutoSizeTextTypeUniformWithConfiguration/);
assert.doesNotMatch(wearMain, /\.value\.length\(\) > 1[24] \?/);
// Celular não acorda o relógio a cada minuto sem mudança de conteúdo; pedidos explícitos
// continuam publicando sempre (o relógio confirma o sync por um sentAt novo).
const watchContext = read('client/src/lib/watchContext.ts');
const home = read('client/src/pages/Home.tsx');
assert.match(watchContext, /export function watchSnapshotContentSignature/);
assert.match(watchContext, /generatedAtEpochMs: _generated, validUntilEpochMs: _validUntil/);
assert.match(watchContext, /WATCH_UNCHANGED_REPUBLISH_MS = 10 \* 60 \* 1000/);
assert.match(watchContext, /Math\.max\(now \+ 15 \* 60 \* 1000/, 'validade mínima precisa seguir maior que o reenvio sem mudança');
assert.match(home, /const onRequest = \(\) => publishWatchSnapshot\(true\);/);
assert.match(home, /setInterval\(\(\) => publishWatchSnapshot\(false\), 60_000\)/);
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
