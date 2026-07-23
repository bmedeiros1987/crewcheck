import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.10] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function requireText(source, text, label) {
  if (!source.includes(text)) throw new Error(`[v14.3.10] Ausente: ${label}`);
}

const bridge = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckHealthBridge.kt');
const activity = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const life = read('client/src/components/v1434/CrewCheckLifeView.tsx');
const manifest = read('android-wrapper/app/src/main/AndroidManifest.xml');
const gradle = read('android-wrapper/app/build.gradle');
const pkg = JSON.parse(read('package.json'));

requireText(bridge, 'fun postMessage(raw: String?): Boolean', 'retorno real da ponte Kotlin');
requireText(bridge, '"openSettings" -> openHealthConnectSettings()', 'ação de gerenciamento do Health Connect');
requireText(bridge, 'availability", "requesting"', 'estado visível de solicitação');
requireText(bridge, 'HealthConnectClient.getHealthConnectSettingsAction()', 'fallback oficial de configurações');
requireText(activity, 'return healthBridge.postMessage(raw);', 'retorno nativo não mascarado');
requireText(life, 'accepted !== false', 'cliente respeita recusa nativa');
requireText(life, 'function manageAndroidAccess()', 'atalho Gerenciar acesso');
requireText(life, 'Gerenciar acesso', 'botão visível de gerenciamento');
requireText(life, 'androidRequesting', 'feedback de carregamento do botão');
requireText(manifest, 'android.permission.health.READ_SLEEP', 'permissão de sono');
requireText(manifest, 'android.permission.health.READ_STEPS', 'permissão de passos');
requireText(manifest, 'android.permission.health.READ_DISTANCE', 'permissão de distância');
requireText(manifest, 'android.permission.health.READ_EXERCISE', 'permissão de exercício');
requireText(manifest, 'android.permission.health.READ_RESTING_HEART_RATE', 'permissão de frequência em repouso');
requireText(manifest, 'com.google.android.apps.healthdata', 'consulta ao provedor Health Connect');
requireText(gradle, 'versionName "14.3.10"', 'versionName 14.3.10');
requireText(gradle, 'versionCode 140310', 'versionCode 140310');
if (pkg.version !== '14.3.10') throw new Error(`[v14.3.10] package.json em ${pkg.version}`);

console.log('[v14.3.10] Regressão aprovada: clique confirmado, feedback visível e fallback Gerenciar acesso.');
