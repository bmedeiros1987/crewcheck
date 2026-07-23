import fs from 'node:fs';

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.10-settings] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
}

function requireText(source, text, label) {
  if (!source.includes(text)) throw new Error(`[v14.3.10-settings] Ausente: ${label}`);
}

function forbidText(source, text, label) {
  if (source.includes(text)) throw new Error(`[v14.3.10-settings] Incompatibilidade presente: ${label}`);
}

const bridge = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckHealthBridge.kt');
const activity = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const life = read('client/src/components/v1434/CrewCheckLifeView.tsx');
const manifest = read('android-wrapper/app/src/main/AndroidManifest.xml');
const gradle = read('android-wrapper/app/build.gradle');
const pkg = JSON.parse(read('package.json'));

requireText(bridge, 'fun postMessage(raw: String?): Boolean', 'retorno real da ponte Kotlin');
requireText(bridge, '"openSettings" -> openHealthConnectSettings()', 'ação de gerenciamento');
requireText(bridge, 'HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS', 'ação oficial Kotlin do Health Connect');
requireText(bridge, 'getLaunchIntentForPackage(HEALTH_CONNECT_PACKAGE)', 'fallback Android 13');
forbidText(bridge, 'HealthConnectClient.getHealthConnectSettingsAction()', 'getter Java usado como função Kotlin');
forbidText(bridge, 'HealthConnectClient.getHealthConnectManageDataIntent(activity)', 'sobrecarga incompatível de gerenciamento');
requireText(activity, 'return healthBridge.postMessage(raw);', 'retorno nativo não mascarado');
requireText(life, 'accepted !== false', 'cliente respeita recusa nativa');
requireText(life, 'function manageAndroidAccess()', 'atalho Gerenciar acesso');
requireText(life, 'Gerenciar acesso', 'botão visível');
requireText(life, 'androidRequesting', 'feedback do botão');
requireText(manifest, 'android.permission.health.READ_SLEEP', 'permissão de sono');
requireText(manifest, 'com.google.android.apps.healthdata', 'consulta ao provedor');
requireText(gradle, 'versionName "14.3.10"', 'versionName 14.3.10');
requireText(gradle, 'versionCode 140310', 'versionCode 140310');
if (pkg.version !== '14.3.10') throw new Error(`[v14.3.10-settings] package.json em ${pkg.version}`);

console.log('[v14.3.10-settings] Regressão aprovada: API Kotlin compilável, feedback visível e acesso ao Health Connect.');
