import fs from 'node:fs';

const read = (path) => {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.12] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
};

const bridge = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckHealthBridge.kt');
const activity = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const life = read('client/src/components/v1434/CrewCheckLifeView.tsx');
const gradle = read('android-wrapper/app/build.gradle');
const pkg = JSON.parse(read('package.json'));

const checks = [
  ['origem Render preservada', bridge.includes('https://crewcheck.onrender.com') && bridge.includes('crewcheck.onrender.com" -> true')],
  ['autorização direta preservada', bridge.includes('fun requestPermissionsFromHost(): Boolean')],
  ['gerenciamento oficial Jetpack', bridge.includes('HealthConnectClient.getHealthConnectManageDataIntent(activity, HEALTH_CONNECT_PACKAGE)')],
  ['fallback de configurações oficial', bridge.includes('HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS')],
  ['fallback pelo pacote do provedor', bridge.includes('getLaunchIntentForPackage(HEALTH_CONNECT_PACKAGE)')],
  ['intent protegido removido', !bridge.includes('android.health.connect.action.MANAGE_HEALTH_PERMISSIONS')],
  ['SecurityException não derruba o estado', bridge.includes('catch (_: SecurityException)')],
  ['mensagem de ação separada do status', bridge.includes('crewcheck:health-action-message') && bridge.includes('dispatchActionMessage')],
  ['host nativo preservado', activity.includes('public boolean openHealthConnectSettings()') && activity.includes('healthBridge.openSettingsFromHost()')],
  ['cliente escuta falha amigável', life.includes("window.addEventListener('crewcheck:health-action-message'") && life.includes('toast.error(message)')],
  ['cliente aponta APK atual', life.includes('APK 14.3.12')],
  ['versionName 14.3.12', gradle.includes('versionName "14.3.12"')],
  ['versionCode 140312', gradle.includes('versionCode 140312')],
  ['package 14.3.12', pkg.version === '14.3.12'],
];

for (const [label, ok] of checks) {
  if (!ok) throw new Error(`[v14.3.12] Reprovado: ${label}`);
  console.log(`✓ ${label}`);
}

console.log(`[v14.3.12] ${checks.length} verificações aprovadas: conexão preservada e gerenciamento sem intent protegido.`);
