import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const exists = (path) => fs.existsSync(path);
const home = read('client/src/pages/Home.tsx');
const life = read('client/src/components/v1434/CrewCheckLifeView.tsx');
const manualCenter = read('client/src/components/v1434/ManualCenterView.tsx');
const tour = read('client/src/components/v1432/FirstAccessTour.tsx');
const css = read('client/src/components/v1434/crewcheck-life.css');
const manualHtml = read('client/public/manual.html');
const docs = read('docs/crewcheck-life.md');
const packageJson = JSON.parse(read('package.json'));

let passed = 0;
function check(label, condition) {
  if (!condition) throw new Error(`[v14.3.4] Reprovado: ${label}`);
  passed += 1;
  console.log(`✓ ${label}`);
}

check('versão pública 14.3.4', packageJson.version === '14.3.4');
check('CrewCheck Life acessível pelo menu', home.includes("['life','CrewCheck Life'") && home.includes("view === 'life'"));
check('manual acessível pelo menu', home.includes("['manual','Manual CrewCheck'") && home.includes("view === 'manual'"));
check('manual não conflita com saída inteligente', home.includes("value === 'manual'") && !home.includes("value === 'manual' || value === 'departure'"));
check('consentimento explícito antes da conexão', life.includes('consentChecked') && life.includes('Nenhuma permissão de saúde foi solicitada ainda'));
check('modo manual completo', life.includes('sleepHours') && life.includes('activityMinutes') && life.includes('studyMinutes'));
check('recomendação explicável pela escala', life.includes('Por que estou vendo isso?') && life.includes('Próxima programação'));
check('revogação e exclusão disponíveis', life.includes('revokePermissions') && life.includes('Apagar todos os dados do Life'));
check('sem promessa médica', life.includes('não faz diagnóstico') && life.includes('não avalia aptidão'));
check('dados clínicos excluídos da interface', life.includes('Pressão, glicose, peso, medicamentos') && !life.includes('bloodPressure'));
check('Apple Health não é simulado no navegador', life.includes('depende do aplicativo nativo iOS') && life.includes('Modo manual disponível'));
check('manual PDF e web incorporados', manualCenter.includes('Manual_Completo_CrewCheck_v14.3.4.pdf') && manualCenter.includes('cc-manual-frame'));
check('tutorial ampliado para Life e manual', tour.includes('PASSO 5 DE 7') && tour.includes("view: 'life'") && tour.includes("view: 'manual'"));
check('tutorial não pede permissão de saúde', tour.includes('não pede permissões de saúde durante o tutorial'));
check('contraste claro e escuro definido', css.includes('html[data-crew-theme="light"]') && css.includes('--life-ink'));
check('layout responsivo até 420px', css.includes('@media (max-width: 420px)'));
check('manual web atualizado', manualHtml.includes('CrewCheck v14.3.4') && manualHtml.includes('id="crewcheck-life"'));
check('documentação local-first', docs.includes('Implementação v14.3.4') && docs.includes('não é enviado ao servidor'));
check('contrato iOS documentado', exists('docs/crewcheck-life-ios-healthkit.md') && read('docs/crewcheck-life-ios-healthkit.md').includes('NSHealthShareUsageDescription'));

if (exists('android-wrapper/app/src/main/AndroidManifest.xml')) {
  const manifest = read('android-wrapper/app/src/main/AndroidManifest.xml');
  const gradle = read('android-wrapper/app/build.gradle');
  const bridge = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckHealthBridge.kt');
  check('Health Connect estável instalado', gradle.includes('connect-client:1.1.0'));
  check('Kotlin e BOM alinhados', gradle.includes('kotlin-bom:2.0.21'));
  check('permissões mínimas declaradas', manifest.includes('READ_SLEEP') && manifest.includes('READ_STEPS') && manifest.includes('READ_EXERCISE'));
  check('sem permissão clínica ou de histórico amplo', !/READ_(?:BLOOD|GLUCOSE|WEIGHT|BODY|MEDICAL)/.test(manifest) && !manifest.includes('READ_HEALTH_DATA_HISTORY'));
  check('política Health Connect declarada', manifest.includes('ACTION_SHOW_PERMISSIONS_RATIONALE') && manifest.includes('VIEW_PERMISSION_USAGE'));
  check('ponte nativa possui interface controlada', bridge.includes('@JavascriptInterface') && bridge.includes('CONSENT_VERSION'));
  check('resumo sem série bruta', bridge.includes('restingHeartRateAverage') && !bridge.includes('heartRateSamples'));
}
if (exists('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java')) {
  const activity = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
  check('ponte registrada somente no app nativo', activity.includes('AndroidCrewCheckHealth') && activity.includes('healthBridge.handleActivityResult'));
}

console.log(`CrewCheck v14.3.4: ${passed} verificações do CrewCheck Life aprovadas.`);
