import fs from 'node:fs';

const VERSION = '14.3.12';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14312] Arquivo obrigatório ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

update('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckHealthBridge.kt', (source) => {
  let next = source;

  const settingsPattern = /    private fun openHealthConnectSettings\(\): Boolean \{[\s\S]*?\n    \}\n\n    private fun hasCurrentConsent/;
  if (!settingsPattern.test(next)) throw new Error('[v14312] Função de gerenciamento do Health Connect não encontrada.');

  next = next.replace(settingsPattern, `    private fun openHealthConnectSettings(): Boolean {
        activity.runOnUiThread {
            val packageManager = activity.packageManager
            val candidates = listOfNotNull(
                try {
                    HealthConnectClient.getHealthConnectManageDataIntent(activity, HEALTH_CONNECT_PACKAGE)
                } catch (_: Exception) {
                    null
                },
                Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS),
                packageManager.getLaunchIntentForPackage(HEALTH_CONNECT_PACKAGE),
            )
            var opened = false
            for (target in candidates) {
                try {
                    if (target.resolveActivity(packageManager) == null) continue
                    activity.startActivity(target)
                    opened = true
                    break
                } catch (_: SecurityException) {
                    // Alguns fabricantes expõem uma tela protegida. Tente a próxima entrada oficial.
                } catch (_: Exception) {
                    // Tente a próxima entrada oficial sem substituir o estado conectado por erro técnico.
                }
            }
            if (!opened) {
                dispatchActionMessage("Abra Configurações do Android → Segurança e privacidade → Health Connect → Permissões de apps → CrewCheck.")
            }
        }
        return true
    }

    private fun hasCurrentConsent`);

  if (!next.includes('private fun dispatchActionMessage(message: String)')) {
    const anchor = '    private fun dispatchError(message: String) {';
    if (!next.includes(anchor)) throw new Error('[v14312] Âncora de mensagem da ponte não encontrada.');
    next = next.replace(anchor, `    private fun dispatchActionMessage(message: String) {
        dispatch("crewcheck:health-action-message", JSONObject().put("ok", false).put("message", message))
    }

${anchor}`);
  }

  if (next.includes('android.health.connect.action.MANAGE_HEALTH_PERMISSIONS')) {
    throw new Error('[v14312] Intent protegido MANAGE_HEALTH_PERMISSIONS ainda está presente.');
  }
  if (!next.includes('HealthConnectClient.getHealthConnectManageDataIntent(activity, HEALTH_CONNECT_PACKAGE)')) {
    throw new Error('[v14312] Intent oficial Jetpack para gerenciamento não foi aplicado.');
  }
  if (!next.includes('crewcheck:health-action-message')) {
    throw new Error('[v14312] Evento amigável de falha de abertura não foi aplicado.');
  }
  return next;
}, { optional: true });

update('client/src/components/v1434/CrewCheckLifeView.tsx', (source) => {
  let next = source;
  if (!next.includes("crewcheck:health-action-message")) {
    const addAnchor = "    window.addEventListener('crewcheck:health-status', onStatus);\n    window.addEventListener('crewcheck:health-summary', onSummary);";
    const removeAnchor = "      window.removeEventListener('crewcheck:health-status', onStatus);\n      window.removeEventListener('crewcheck:health-summary', onSummary);";
    if (!next.includes(addAnchor) || !next.includes(removeAnchor)) {
      throw new Error('[v14312] Âncoras de eventos da tela CrewCheck Life não encontradas.');
    }
    next = next.replace(addAnchor, `    const onActionMessage = (event: Event) => {
      const detail = parseNativePayload((event as CustomEvent).detail);
      const message = String(detail.message || '').trim();
      if (message) toast.error(message);
    };
    window.addEventListener('crewcheck:health-status', onStatus);
    window.addEventListener('crewcheck:health-summary', onSummary);
    window.addEventListener('crewcheck:health-action-message', onActionMessage);`);
    next = next.replace(removeAnchor, `      window.removeEventListener('crewcheck:health-status', onStatus);
      window.removeEventListener('crewcheck:health-summary', onSummary);
      window.removeEventListener('crewcheck:health-action-message', onActionMessage);`);
  }

  next = next.replace(/APK 14\.3\.11/g, 'APK 14.3.12');
  if (!next.includes("window.addEventListener('crewcheck:health-action-message'")) {
    throw new Error('[v14312] Tela não recebeu o evento amigável do gerenciamento.');
  }
  return next;
}, { optional: true });

update('client/src/App.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`), { optional: true });
update('client/src/pages/AuthPage.tsx', (source) => source.replace(/crewcheck_last_loaded_version', '[^']+'/g, `crewcheck_last_loaded_version', '${VERSION}'`).replace(/data-version="[^"]+"/g, `data-version="${VERSION}"`), { optional: true });
update('client/src/pages/Home.tsx', (source) => source.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`), { optional: true });
update('server/platform.mjs', (source) => source.replace(/const APP_VERSION = '\d+\.\d+\.\d+';/, `const APP_VERSION = '${VERSION}';`), { optional: true });
update('server.mjs', (source) => source
  .replace(/version\s*:\s*'\d+\.\d+\.\d+'/g, `version: '${VERSION}'`)
  .replace(/v=\d+\.\d+\.\d+/g, `v=${VERSION}`)
  .replace(/static-shell-\d+\.\d+\.\d+/g, `static-shell-${VERSION}`), { optional: true });
update('android-wrapper/app/build.gradle', (source) => source
  .replace(/versionCode\s+\d+/, 'versionCode 140312')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - safe Health Connect manage-access flow without protected Android intents`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.12'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-12-health-manage-access.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`[v14312] CrewCheck ${VERSION}: gerenciamento do Health Connect pela API Jetpack oficial, fallback seguro e erro amigável.`);
await import('../v14313/apply.mjs');
