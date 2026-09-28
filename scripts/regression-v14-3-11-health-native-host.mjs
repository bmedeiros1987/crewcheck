import fs from 'node:fs';

const read = (path) => {
  if (!fs.existsSync(path)) throw new Error(`[v14.3.11] Arquivo ausente: ${path}`);
  return fs.readFileSync(path, 'utf8');
};

const bridge = read('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckHealthBridge.kt');
const activity = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const life = read('client/src/components/v1434/CrewCheckLifeView.tsx');
const gradle = read('android-wrapper/app/build.gradle');
const pkg = JSON.parse(read('package.json'));

const checks = [
  ['origem Render autorizada', bridge.includes('https://crewcheck.onrender.com') && bridge.includes('crewcheck.onrender.com" -> true')],
  ['autorização direta pelo host', bridge.includes('fun requestPermissionsFromHost(): Boolean')],
  ['configurações diretas pelo host', bridge.includes('fun openSettingsFromHost(): Boolean')],
  ['ação Android 14 para gerenciar permissões', bridge.includes('android.health.connect.action.MANAGE_HEALTH_PERMISSIONS')],
  ['pacote do CrewCheck enviado ao gerenciador', bridge.includes('Intent.EXTRA_PACKAGE_NAME, activity.packageName')],
  ['fallback oficial de configurações', bridge.includes('HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS')],
  ['MainActivity abre autorização nativa', activity.includes('public boolean openHealthConnect()') && activity.includes('healthBridge.requestPermissionsFromHost()')],
  ['MainActivity abre gerenciamento nativo', activity.includes('public boolean openHealthConnectSettings()') && activity.includes('healthBridge.openSettingsFromHost()')],
  ['cliente tenta host antes do WebView', life.includes("callNativeHealth('openHealthConnect')")],
  ['cliente gerencia acesso pelo host', life.includes("callNativeHealth('openHealthConnectSettings')")],
  ['diagnóstico aponta APK atual', life.includes('APK 14.3.11')],
  ['versionName 14.3.11', gradle.includes('versionName "14.3.11"')],
  ['versionCode 140311', gradle.includes('versionCode 140311')],
  ['package 14.3.11', pkg.version === '14.3.11'],
];

for (const [label, ok] of checks) {
  if (!ok) throw new Error(`[v14.3.11] Reprovado: ${label}`);
  console.log(`✓ ${label}`);
}

console.log(`[v14.3.11] ${checks.length} verificações aprovadas: conexão direta, origem Render e gerenciamento Android.`);
