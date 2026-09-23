import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const life = read('client/src/components/v1434/CrewCheckLifeView.tsx');
const mobile = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const manifest = read('android-wrapper/app/src/main/AndroidManifest.xml');
const companionProvider = read('android-wrapper/lifecompanion/src/main/java/com/crewcheck/life/LifeSummaryProvider.java');

// Samsung Companion discovery/install is optional and lives behind CrewLife.
assert.match(manifest, /<package android:name="com\.crewcheck\.life"\s*\/>/);
assert.match(mobile, /getPackageInfo\("com\.crewcheck\.life", 0\)/);
assert.match(mobile, /market:\/\/details\?id=" \+ LIFE_COMPANION_PACKAGE/);
assert.match(mobile, /https:\/\/play\.google\.com\/store\/apps\/details\?id=" \+ LIFE_COMPANION_PACKAGE/);
assert.match(mobile, /getLaunchIntentForPackage\(LIFE_COMPANION_PACKAGE\)/);
assert.match(life, /const LIFE_COMPANION_WEB_URL = `https:\/\/play\.google\.com\/store\/apps\/details\?id=\$\{LIFE_COMPANION_PACKAGE\}`/);
assert.match(life, /Conectar Samsung Health/);
assert.match(life, /Samsung Health · não instalado/);
assert.match(life, /Companion instalado · concluir conexão/);
assert.match(life, /Samsung Health · conectado automaticamente/);
assert.match(life, /componente opcional para sincronização automática/);
assert.match(life, /A sincronização automática com Samsung Health exige Android/);

// The general CrewLife opt-in must not install or require the Companion.
const onboardingStart = life.indexOf('if (!consent.active)');
const activeViewStart = life.indexOf('return <section className="cc-life-shell" aria-labelledby="crewcheck-life-title">', onboardingStart);
assert.ok(onboardingStart >= 0 && activeViewStart > onboardingStart, 'CrewLife onboarding boundaries not found');
const onboarding = life.slice(onboardingStart, activeViewStart);
assert.doesNotMatch(onboarding, /Conectar Samsung Health|Baixar Companion|market:\/\/|play\.google\.com/);

// Rotina -> CrewLife has a distinct, local, default-off consent.
assert.match(life, /type RoutineIntegrationConsent/);
assert.match(life, /routineIntegration: 'crewcheck:life:routine-integration:v1'/);
assert.match(life, /readStored\(KEYS\.routineIntegration, \{ active: false/);
assert.match(life, /Integrar minha Rotina ao CrewLife/);
assert.match(life, /getLifeRoutineContext\(\)/);
assert.match(life, /routineIntegration\.active \?/);
assert.match(life, /localStorage\.removeItem\(KEYS\.routineIntegration\)/);
assert.match(life, /não apaga seus registros de Rotina/);

// Health stays local/aggregated: UI does not upload health and provider remains local IPC.
assert.doesNotMatch(life, /fetch\(|XMLHttpRequest|axios\./);
assert.match(companionProvider, /ContentProvider/);
assert.doesNotMatch(companionProvider, /HttpURLConnection|OkHttp|Retrofit|fetch\(/);
assert.match(life, /Nenhum dado bruto é enviado/);

// Operational safety: routine context is advisory only and cannot mutate operational core.
const routineSectionStart = life.indexOf('ROTINA INTEGRADA');
const routineSectionEnd = life.indexOf('OBJETIVOS', routineSectionStart);
assert.ok(routineSectionStart >= 0 && routineSectionEnd > routineSectionStart, 'Rotina integrada section not found');
const routineSection = life.slice(routineSectionStart, routineSectionEnd);
assert.match(routineSection, /Não altera escala, APZ, jornada, compliance ou financeiro/);
assert.doesNotMatch(routineSection, /está apt[oa]|está inapt[oa]|fadiga detectada|risco operacional detectado/i);

console.log('[crewlife-routine-unified] Samsung install UX + separate local routine consent contracts OK');
