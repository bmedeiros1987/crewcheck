import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(p, 'utf8');
const main = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/MainActivity.java');
const life = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/CrewLifeSnapshot.java');
const text = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/ComplicationText.java');
const backdrop = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/PremiumBackdropView.java');
const face = read('android-wrapper/watchface/src/main/res/raw/watchface.xml');
const complicationBase = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/BaseComplicationService.java');
const nextStep = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/NextStepComplicationService.java');
const gate = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/GateComplicationService.java');
const crewLifeProvider = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/CrewLifeComplicationService.java');
const batteryProvider = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/BatteryComplicationService.java');
const autoSyncScheduler = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/WatchAutoSyncScheduler.java');
const autoSyncJob = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/WatchAutoSyncJobService.java');
const dataLayer = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/CrewCheckDataLayerService.java');
const watchContract = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/WatchContract.java');
const watchEntitlements = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/WatchEntitlements.java');
const watchConciergeClient = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/WatchConciergeClient.java');
const watchConciergeStore = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/WatchConciergeStore.java');
const conciergeProvider = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/ConciergeComplicationService.java');
const wearManifest = read('android-wrapper/wear/src/main/AndroidManifest.xml');
const notificationCenter = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/WatchNotificationCenter.java');
const watchSnapshot = read('android-wrapper/wear/src/main/java/com/crewcheck/watch/WatchContextSnapshot.java');
const protocol = read('docs/peripherals/watch_snapshot_v1.md');

assert.match(main, /MODE_JOURNEY = 1/);
assert.match(main, /MODE_CONCIERGE = 5/);
assert.match(main, /PAGE_COUNT = 6/);
assert.match(main, /handleSwipeGesture/);
assert.match(main, /SOURCE_ROTARY_ENCODER/);
assert.match(main, /HapticFeedbackConstants\.CLOCK_TICK/);
assert.match(main, /renderJourney\(/);
assert.match(main, /renderConcierge\(/);
assert.match(main, /Falar com Concierge/);
assert.match(main, /RecognizerIntent\.ACTION_RECOGNIZE_SPEECH/);
assert.match(main, /TextToSpeech\.QUEUE_FLUSH/);
assert.match(main, /Sua jornada/);
assert.match(main, /PRÓXIMOS PASSOS/);
assert.match(main, /PremiumBackdropView/);
assert.match(main, /CrewLife é opcional/);
assert.match(main, /batteryLabel\(\)/);
assert.match(main, /AUTO_SYNC_INTERVAL_MS/);
assert.match(main, /addProgramStrip\(snapshot\)/);
assert.match(main, /WatchAutoSyncScheduler\.schedule\(this\)/);
assert.doesNotMatch(main, /life\.recoveryScore > 0 \? life\.recoveryScore \+ "%" : life\.recoveryLabel/);

assert.match(backdrop, /drawArc/);
assert.match(backdrop, /LinearGradient/);
assert.match(backdrop, /RadialGradient/);
assert.match(life, /return "LOCAL"/);
assert.match(life, /!"DESCONHECIDA"\.equals\(recoveryLabel\)/);
assert.match(text, /CrewLife opcional · abra no celular/);
assert.doesNotMatch(text, /Ative a sincronização de saúde no celular/);

assert.match(complicationBase, /putExtra\("crewcheck_screen", tapScreen\(\)\)/);
assert.match(nextStep, /return "journey"/);
assert.match(gate, /return "journey"/);
assert.match(crewLifeProvider, /return "crewlife"/);
assert.match(batteryProvider, /BatteryManager\.EXTRA_LEVEL/);
assert.match(autoSyncScheduler, /15 \* 60_000L/);
assert.match(autoSyncJob, /WatchSyncClient\.refresh/);
assert.match(dataLayer, /ACTION_SNAPSHOT_UPDATED/);

assert.match(watchContract, /SNAPSHOT_PROTOCOL = "watchSnapshotV1"/);
assert.match(watchContract, /CONCIERGE_REQUEST_PATH/);
assert.match(watchContract, /CONCIERGE_RESPONSE_PATH/);
assert.match(watchConciergeClient, /Wearable\.getMessageClient/);
assert.match(watchConciergeClient, /CONCIERGE_REQUEST_PATH/);
assert.match(watchConciergeStore, /response_json/);
assert.match(dataLayer, /CONCIERGE_RESPONSE_PATH/);
assert.match(conciergeProvider, /return "concierge"/);
assert.match(wearManifest, /ConciergeComplicationService/);
assert.match(notificationCenter, /postConciergeResponse/);
assert.match(notificationCenter, /crewcheck_screen", "concierge"/);

assert.match(face, /defaultSystemProvider="STEP_COUNT"/);
assert.match(face, /defaultSystemProvider="WATCH_BATTERY"/);
assert.match(face, /defaultSystemProvider="NEXT_EVENT"/);
assert.doesNotMatch(face, /BatteryComplicationService/, 'face grátis não pode depender do APK Premium');
assert.doesNotMatch(face, /ConciergeComplicationService/, 'face grátis não pode depender do Concierge Premium');
const slots = [...face.matchAll(/<ComplicationSlot\b/g)].length;
assert.ok(slots >= 3, 'watch face grátis deve manter passos, bateria e próximo evento');

assert.match(main, /addGlanceRail\(snapshot, now\)/, 'Agora deve mostrar rail de glances essenciais');
assert.match(main, /"BATERIA"/, 'Agora deve expor bateria em glance legível');
assert.match(main, /"HOJE"/, 'Agora deve expor quantidade de etapas de hoje');
assert.match(main, /"SYNC"/, 'Agora deve expor frescor da sincronização');
assert.match(main, /"PROGRAMAÇÃO · "/, 'Agora deve antecipar a programação do dia');
assert.match(main, /"DEPOIS"/, 'programação deve mostrar também a etapa seguinte');
assert.doesNotMatch(main, /actionChip\("↻ Atualizar"/, 'refresh manual não deve dominar a experiência');
assert.match(main, /Sincronização automática\. Toque para atualizar agora\./, 'refresh manual deve ser fallback');

// Commercial contract: Free keeps the useful canonical roster. Premium is feature-scoped.
assert.doesNotMatch(main, /renderPremiumGate\(/, 'não pode existir gate global bloqueando o APK Free');
assert.doesNotMatch(main, /!snapshot\.premiumAccess/, 'Agora/Jornada/Escala não podem depender de Premium');
assert.match(watchSnapshot, /public final boolean premiumAccess/);
assert.doesNotMatch(watchSnapshot, /Ative o Premium no CrewCheck/, 'complicações básicas não podem virar paywall');
assert.match(watchEntitlements, /static boolean basicRoster\(Context context\)/);
assert.match(watchEntitlements, /return true;/);
assert.match(watchEntitlements, /static boolean crewLife\(Context context\)/);
assert.match(watchEntitlements, /static boolean concierge\(Context context\)/);
assert.match(watchEntitlements, /static boolean smartDeparture\(Context context\)/);
assert.match(watchEntitlements, /static boolean liveOps\(Context context\)/);
assert.match(dataLayer, /if \(!snapshot\.premiumAccess\)/, 'downgrade deve limpar caches Premium sem apagar escala');
assert.match(dataLayer, /WatchEntitlements\.crewLife/);
assert.match(dataLayer, /WatchEntitlements\.concierge/);
assert.match(watchConciergeClient, /WatchEntitlements\.concierge/);
assert.match(watchConciergeStore, /void clear\(\)/);

// Phone-side producer behavior is a documented handoff, not implementation owned by this branch.
assert.match(protocol, /Handoff para Mobile Core/);
assert.match(protocol, /Free sempre receba roster básico/);
assert.match(protocol, /peer v1 antigo/);
assert.match(protocol, /Downgrade Premium → Free/);
assert.match(protocol, /Nenhuma implementação de `android-wrapper\/app\/\*\*` ou `client\/\*\*`/);

console.log('[crewwatch-premium-experience-v2] peripheral Free roster + Premium capability boundaries OK');
