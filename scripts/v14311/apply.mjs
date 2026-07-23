import fs from 'node:fs';

const VERSION = '14.3.11';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14311] Arquivo obrigatório ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

update('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckHealthBridge.kt', (source) => {
  let next = source;

  next = next.replace(
    'private val TRUSTED_ORIGINS = setOf("https://crewcheck.online", "https://www.crewcheck.online")',
    'private val TRUSTED_ORIGINS = setOf("https://crewcheck.online", "https://www.crewcheck.online", "https://crewcheck.onrender.com")',
  );
  next = next.replace(
    '"crewcheck.online", "www.crewcheck.online" -> true',
    '"crewcheck.online", "www.crewcheck.online", "crewcheck.onrender.com" -> true',
  );

  if (!next.includes('fun requestPermissionsFromHost(): Boolean')) {
    const anchor = '    private fun isTrustedOrigin(origin: Uri): Boolean {';
    if (!next.includes(anchor)) throw new Error('[v14311] Âncora de origem confiável não encontrada.');
    const hostApi = `    fun requestPermissionsFromHost(): Boolean {
        if (clientOrNull() == null) {
            openProviderUpdateIfNeeded()
            dispatch("crewcheck:health-status", availabilityJson())
            return false
        }
        val request = JSONObject()
            .put("consentVersion", CONSENT_VERSION)
            .put("consentAccepted", true)
        requestPermissions(request)
        return true
    }

    fun openSettingsFromHost(): Boolean = openHealthConnectSettings()

`;
    next = next.replace(anchor, `${hostApi}${anchor}`);
  }

  const settingsPattern = /    private fun openHealthConnectSettings\(\): Boolean \{[\s\S]*?\n    \}\n\n    private fun hasCurrentConsent/;
  if (!settingsPattern.test(next)) throw new Error('[v14311] Função de configurações do Health Connect não encontrada.');
  next = next.replace(settingsPattern, `    private fun openHealthConnectSettings(): Boolean {
        val manager = Intent("android.health.connect.action.MANAGE_HEALTH_PERMISSIONS")
            .putExtra(Intent.EXTRA_PACKAGE_NAME, activity.packageName)
        val settings = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
        val packageManager = activity.packageManager
        val target = when {
            manager.resolveActivity(packageManager) != null -> manager
            settings.resolveActivity(packageManager) != null -> settings
            else -> packageManager.getLaunchIntentForPackage(HEALTH_CONNECT_PACKAGE) ?: return false
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

  if (!next.includes('crewcheck.onrender.com')
      || !next.includes('fun requestPermissionsFromHost(): Boolean')
      || !next.includes('fun openSettingsFromHost(): Boolean')
      || !next.includes('android.health.connect.action.MANAGE_HEALTH_PERMISSIONS')) {
    throw new Error('[v14311] Ponte nativa direta do Health Connect não foi aplicada por completo.');
  }
  return next;
}, { optional: true });

update('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', (source) => {
  let next = source;
  if (!next.includes('public boolean openHealthConnect()')) {
    const anchor = '        @JavascriptInterface\n        public String healthBridgePing() {';
    if (!next.includes(anchor)) throw new Error('[v14311] Âncora da ponte nativa principal não encontrada.');
    const methods = `        @JavascriptInterface
        public boolean openHealthConnect() {
            try {
                return healthBridge != null && healthBridge.requestPermissionsFromHost();
            } catch (Exception ignored) {
                return false;
            }
        }

        @JavascriptInterface
        public boolean openHealthConnectSettings() {
            try {
                return healthBridge != null && healthBridge.openSettingsFromHost();
            } catch (Exception ignored) {
                return false;
            }
        }

`;
    next = next.replace(anchor, `${methods}${anchor}`);
  }
  if (!next.includes('healthBridge.requestPermissionsFromHost()') || !next.includes('healthBridge.openSettingsFromHost()')) {
    throw new Error('[v14311] MainActivity não recebeu o fluxo Health Connect direto.');
  }
  return next;
}, { optional: true });

update('client/src/components/v1434/CrewCheckLifeView.tsx', (source) => {
  let next = source;
  const blockPattern = /  function connectAndroid\(\) \{[\s\S]*?\n  \}\n\n  function manageAndroidAccess\(\) \{[\s\S]*?\n  \}\n\n  function refreshAndroid/;
  if (!blockPattern.test(next)) throw new Error('[v14311] Bloco de conexão Android não encontrado.');
  next = next.replace(blockPattern, `  function callNativeHealth(method: 'openHealthConnect' | 'openHealthConnectSettings'): boolean {
    const native = (window as any).AndroidCrewCheckNative;
    if (!native) return false;
    try {
      return method === 'openHealthConnect'
        ? native.openHealthConnect() !== false
        : native.openHealthConnectSettings() !== false;
    } catch {
      return false;
    }
  }

  function connectAndroid() {
    setAndroidRequesting(true);
    if (callNativeHealth('openHealthConnect')) {
      toast.message('Abrindo as permissões nativas do Health Connect…');
      window.setTimeout(() => setAndroidRequesting(false), 3000);
      return;
    }
    const accepted = postAndroid('requestPermissions', { consentVersion: '1.0', consentAccepted: consent.active });
    if (!accepted) {
      setAndroidRequesting(false);
      toast.error('Não foi possível iniciar a autorização. Atualize para o APK 14.3.11 e abra o CrewCheck pelo ícone do aplicativo.');
      return;
    }
    toast.message('Abrindo as permissões do Health Connect…');
    window.setTimeout(() => setAndroidRequesting(false), 3000);
  }

  function manageAndroidAccess() {
    if (callNativeHealth('openHealthConnectSettings')) {
      toast.message('Abrindo o gerenciamento nativo do Health Connect…');
      return;
    }
    if (!postAndroid('openSettings')) {
      toast.error('Abra Configurações do Android → Segurança e privacidade → Health Connect → Permissões de apps → CrewCheck.');
      return;
    }
    toast.message('Abrindo o gerenciamento de acesso do Health Connect…');
  }

  function refreshAndroid`);

  if (!next.includes("function callNativeHealth(method: 'openHealthConnect' | 'openHealthConnectSettings')")
      || !next.includes("callNativeHealth('openHealthConnect')")
      || !next.includes("callNativeHealth('openHealthConnectSettings')")
      || !next.includes('APK 14.3.11')) {
    throw new Error('[v14311] Cliente não recebeu o fluxo nativo direto.');
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
  .replace(/versionCode\s+\d+/, 'versionCode 140311')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - direct native Health Connect authorization with Render origin support`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.11'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-11-health-native-host.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`[v14311] CrewCheck ${VERSION}: autorização Health Connect pelo host nativo, origem Render permitida e gerenciamento Android 14.`);
