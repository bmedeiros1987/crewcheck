import fs from 'node:fs';

const path = 'android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckHealthBridge.kt';
if (!fs.existsSync(path)) throw new Error(`[v14.3.10-fix] Arquivo ausente: ${path}`);

const before = fs.readFileSync(path, 'utf8');
let after = before;

const openSettingsPattern = /    private fun openHealthConnectSettings\(\): Boolean \{[\s\S]*?\n    \}\n\n    private fun hasCurrentConsent/;
if (!openSettingsPattern.test(after)) {
  throw new Error('[v14.3.10-fix] Função openHealthConnectSettings não encontrada.');
}

after = after.replace(openSettingsPattern, `    private fun openHealthConnectSettings(): Boolean {
        val primary = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
        val target = if (primary.resolveActivity(activity.packageManager) != null) {
            primary
        } else {
            activity.packageManager.getLaunchIntentForPackage(HEALTH_CONNECT_PACKAGE) ?: return false
        }
        activity.runOnUiThread {
            try {
                activity.startActivity(target)
            } catch (error: Exception) {
                dispatchError(error.message ?: "Não foi possível abrir o Health Connect.")
            }
        }
        return true
    }

    private fun hasCurrentConsent`);

if (after.includes('HealthConnectClient.getHealthConnectSettingsAction()')) {
  throw new Error('[v14.3.10-fix] Chamada Java incompatível ainda presente no Kotlin.');
}
if (after.includes('HealthConnectClient.getHealthConnectManageDataIntent(activity)')) {
  throw new Error('[v14.3.10-fix] Sobrecarga incompatível de gerenciamento ainda presente.');
}
if (after.includes('val intents = listOf(') || after.includes('val intents = listOfNotNull(')) {
  throw new Error('[v14.3.10-fix] Implementação antiga por lista de intents ainda presente.');
}
if (!after.includes('val primary = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)')) {
  throw new Error('[v14.3.10-fix] Ação Kotlin oficial do Health Connect não foi aplicada.');
}
if (!after.includes('getLaunchIntentForPackage(HEALTH_CONNECT_PACKAGE) ?: return false')) {
  throw new Error('[v14.3.10-fix] Fallback seguro para Android 13 não foi aplicado.');
}

if (after !== before) fs.writeFileSync(path, after, 'utf8');
console.log('[v14.3.10-fix] Abertura do Health Connect simplificada e compilável.');
