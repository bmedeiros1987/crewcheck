import fs from 'node:fs';

const path = 'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckHealthBridge.kt';
if (!fs.existsSync(path)) throw new Error(`[v14.3.10-fix] Arquivo ausente: ${path}`);

const before = fs.readFileSync(path, 'utf8');
let after = before;

const broken = `            Intent(HealthConnectClient.getHealthConnectSettingsAction()),
            HealthConnectClient.getHealthConnectManageDataIntent(activity),`;

const fixed = `            Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS),
            Intent("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS")
                .setPackage(HEALTH_CONNECT_PACKAGE),
            activity.packageManager.getLaunchIntentForPackage(HEALTH_CONNECT_PACKAGE),`;

if (after.includes(broken)) after = after.replace(broken, fixed);

if (after.includes('HealthConnectClient.getHealthConnectSettingsAction()')) {
  throw new Error('[v14.3.10-fix] Chamada Java incompatível ainda presente no Kotlin.');
}
if (after.includes('HealthConnectClient.getHealthConnectManageDataIntent(activity)')) {
  throw new Error('[v14.3.10-fix] Sobrecarga incompatível de gerenciamento ainda presente.');
}
if (!after.includes('HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS')) {
  throw new Error('[v14.3.10-fix] Ação Kotlin oficial do Health Connect não foi aplicada.');
}
if (!after.includes('getLaunchIntentForPackage(HEALTH_CONNECT_PACKAGE)')) {
  throw new Error('[v14.3.10-fix] Fallback para Android 13 não foi aplicado.');
}

if (after !== before) fs.writeFileSync(path, after, 'utf8');
console.log('[v14.3.10-fix] Abertura do Health Connect corrigida para a API Kotlin compilável.');
