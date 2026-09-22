import assert from 'node:assert/strict';
import fs from 'node:fs';

const activity = fs.readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', 'utf8');
const service = fs.readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckWatchSyncService.java', 'utf8');
const publisher = fs.readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/CrewLifeWatchPublisher.java', 'utf8');
const consent = fs.readFileSync('android-wrapper/app/src/main/java/com/crewcheck/app/WatchHealthConsent.java', 'utf8');
const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
const life = fs.readFileSync('client/src/components/v1434/CrewCheckLifeView.tsx', 'utf8');
const bridge = fs.readFileSync('client/src/lib/watchCrewLife.ts', 'utf8');

assert.match(activity, /syncCrewLifeSnapshot\(final String snapshotJson\)/, 'bridge Android deve receber CrewLife agregado');
assert.match(activity, /consentAccepted/, 'bridge deve exigir consentimento CrewLife vigente');
assert.match(activity, /WatchHealthConsent\.grant/, 'bridge deve registrar apenas categorias presentes');
assert.match(activity, /revokeCrewLifeWatch\(\)/, 'bridge deve permitir revogação do pulso');
assert.match(activity, /syncCrewLifeSnapshot:function/, 'fachada JS preparada deve manter CrewLife');

assert.match(service, /CrewLifeWatchPublisher\.republishLast\(this\)/, 'resync do Watch deve recuperar CrewLife em cache');
assert.match(publisher, /\/crewcheck\/watch\/crewlife\/v1/, 'canal CrewLife separado deve permanecer v1');
assert.match(publisher, /LAST_CREWLIFE/, 'publisher deve manter último resumo agregado para background');
assert.match(publisher, /heartRateSeries/, 'publisher deve recusar séries brutas');
assert.match(publisher, /remove\(LAST_CREWLIFE\)/, 'revogação deve remover cache do celular');

assert.match(consent, /HEALTH_CATEGORIES/, 'consentimento granular deve permanecer fail-closed');
assert.match(consent, /allowsNarrative/, 'narrativa deve exigir consentimento completo');

assert.match(home, /publishCrewLifeWatchSnapshot/, 'Home deve publicar CrewLife junto da escala');
assert.match(home, /crewcheck:health-summary/, 'novo resumo Health Connect deve disparar sync imediato');
assert.match(life, /revokeCrewLifeWatchSnapshot/, 'pausar ou apagar CrewLife deve limpar o relógio');

assert.match(bridge, /crewcheck:life:consent:v1/, 'projeção deve respeitar consentimento local');
assert.match(bridge, /crewcheck:life:health-summary:v1/, 'projeção deve usar somente resumo agregado');
assert.doesNotMatch(bridge, /sleepStages|heartRateSeries|samples|rawHeartRate/, 'cliente não deve transportar série bruta');
assert.match(bridge, /restingHeartRateAverage/, 'FC de repouso agregada deve mapear para o relógio');
assert.match(bridge, /validUntilEpochMs/, 'CrewLife precisa expirar');

console.log('[watch-crewlife-main] transporte agregado + consentimento + revogação OK');
