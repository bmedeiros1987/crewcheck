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
const phoneMain = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const home = read('client/src/pages/Home.tsx');

assert.match(main, /MODE_JOURNEY = 1/);
assert.match(main, /PAGE_COUNT = 5/);
assert.match(main, /handleSwipeGesture/);
assert.match(main, /SOURCE_ROTARY_ENCODER/);
assert.match(main, /HapticFeedbackConstants\.CLOCK_TICK/);
assert.match(main, /renderJourney\(/);
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
assert.match(phoneMain, /requestCrewCheckWatchSnapshotFromWeb\("phone-resume"\)/);
assert.match(home, /document\.addEventListener\('visibilitychange', onVisible\)/);

assert.match(face, /BatteryComplicationService/);
const slots = [...face.matchAll(/<ComplicationSlot\b/g)].length;
assert.ok(slots >= 5, 'watch face deve manter pelo menos cinco glances/complicações');

console.log('[crewwatch-premium-experience-v2] premium navigation + humane fallbacks OK');
