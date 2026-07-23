import fs from 'node:fs';

const VERSION = '14.3.10';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v14310] Arquivo obrigatório ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

update('android-wrapper/app/src/main/java/com/crewcheck/app/CrewCheckHealthBridge.kt', (source) => {
  let next = source;

  const postMessagePattern = /    @JavascriptInterface\n    fun postMessage\(raw: String\?\) \{[\s\S]*?\n    \}\n\n    private fun isTrustedOrigin/;
  if (postMessagePattern.test(next)) {
    next = next.replace(postMessagePattern, `    @JavascriptInterface
    fun postMessage(raw: String?): Boolean {
        val currentUrl = webView.url ?: return false
        val currentOrigin = try { Uri.parse(currentUrl) } catch (_: Exception) { return false }
        if (!isTrustedOrigin(currentOrigin)) return false
        return handleMessage(raw)
    }

    private fun isTrustedOrigin`);
  }

  const handlePattern = /    private fun handleMessage\(raw: String\?\) \{[\s\S]*?\n    \}\n\n    private fun hasCurrentConsent/;
  if (!handlePattern.test(next)) throw new Error('[v14310] Bloco handleMessage não encontrado.');
  next = next.replace(handlePattern, `    private fun handleMessage(raw: String?): Boolean {
        if (raw.isNullOrBlank() || raw.length > 2048) return false
        return try {
            val request = JSONObject(raw)
            when (request.optString("action")) {
                "status" -> { refreshStatus(); true }
                "requestPermissions" -> { requestPermissions(request); true }
                "readSummary" -> { readSummary(request); true }
                "revokePermissions" -> { revokePermissions(); true }
                "openSettings" -> openHealthConnectSettings()
                else -> { dispatchError("Ação Health Connect não reconhecida."); false }
            }
        } catch (_: Exception) {
            dispatchError("Mensagem Health Connect inválida.")
            false
        }
    }

    private fun openHealthConnectSettings(): Boolean {
        val intents = listOf(
            Intent("android.health.connect.action.MANAGE_HEALTH_PERMISSIONS")
                .putExtra(Intent.EXTRA_PACKAGE_NAME, activity.packageName),
            Intent(HealthConnectClient.getHealthConnectSettingsAction()),
            HealthConnectClient.getHealthConnectManageDataIntent(activity),
        )
        val target = intents.firstOrNull { it.resolveActivity(activity.packageManager) != null } ?: return false
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

  const requestPattern = /    private fun requestPermissions\(request: JSONObject\) \{[\s\S]*?\n    \}\n\n    private fun readSummary/;
  if (!requestPattern.test(next)) throw new Error('[v14310] Bloco requestPermissions não encontrado.');
  next = next.replace(requestPattern, `    private fun requestPermissions(request: JSONObject) {
        if (!hasCurrentConsent(request)) {
            dispatch("crewcheck:health-status", availabilityJson().put("ok", false).put("message", "Ative o CrewCheck Life antes de autorizar dados."))
            return
        }
        val client = clientOrNull()
        if (client == null) {
            openProviderUpdateIfNeeded()
            dispatch("crewcheck:health-status", availabilityJson())
            return
        }
        scope.launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                if (granted.containsAll(PERMISSIONS)) {
                    dispatchPermissionStatus(client)
                    readSummaryInternal(client, 7)
                    return@launch
                }
                dispatch("crewcheck:health-status", availabilityJson()
                    .put("availability", "requesting")
                    .put("ok", true)
                    .put("message", "Abrindo as permissões do Health Connect."))
                activity.runOnUiThread {
                    try {
                        val intent = permissionContract.createIntent(activity, PERMISSIONS)
                        activity.startActivityForResult(intent, REQUEST_CODE)
                    } catch (error: Exception) {
                        dispatch("crewcheck:health-status", availabilityJson()
                            .put("ok", false)
                            .put("availability", "permission_required")
                            .put("message", error.message ?: "Não foi possível abrir as permissões. Use Gerenciar acesso."))
                    }
                }
            } catch (error: Exception) {
                dispatchError(error.message ?: "Não foi possível consultar as permissões do Health Connect.")
            }
        }
    }

    private fun readSummary`);

  if (!next.includes('fun postMessage(raw: String?): Boolean') || !next.includes('"openSettings" -> openHealthConnectSettings()') || !next.includes('availability", "requesting"')) {
    throw new Error('[v14310] Ponte Health Connect confirmável não foi aplicada.');
  }
  return next;
}, { optional: true });

update('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', (source) => {
  let next = source;
  next = next.replace(
    '                healthBridge.postMessage(raw);\n                return true;',
    '                return healthBridge.postMessage(raw);',
  );
  if (!next.includes('return healthBridge.postMessage(raw);')) {
    throw new Error('[v14310] A ponte nativa ainda mascara falha do Health Connect.');
  }
  return next;
}, { optional: true });

update('client/src/components/v1434/CrewCheckLifeView.tsx', (source) => {
  let next = source;

  next = next.replace(
    "availability?: 'available' | 'update_required' | 'unavailable' | 'permission_required' | 'partial' | 'connected';",
    "availability?: 'available' | 'update_required' | 'unavailable' | 'permission_required' | 'requesting' | 'partial' | 'connected';",
  );
  next = next.replace(
    "  if (status.allGranted || status.availability === 'connected') return 'Conectado';",
    "  if (status.availability === 'requesting') return 'Abrindo permissões…';\n  if (status.allGranted || status.availability === 'connected') return 'Conectado';",
  );
  next = next.replace(
    '  const [androidBridgeReady, setAndroidBridgeReady] = useState(false);',
    '  const [androidBridgeReady, setAndroidBridgeReady] = useState(false);\n  const [androidRequesting, setAndroidRequesting] = useState(false);',
  );
  next = next.replace(
    "      bridge.postMessage(JSON.stringify({ action, ...payload }));\n      return true;",
    "      const accepted = bridge.postMessage(JSON.stringify({ action, ...payload }));\n      return accepted !== false;",
  );
  next = next.replace(
    "    const onStatus = (event: Event) => setNativeStatus(parseNativePayload((event as CustomEvent).detail) as NativeHealthStatus);",
    "    const onStatus = (event: Event) => {\n      const detail = parseNativePayload((event as CustomEvent).detail) as NativeHealthStatus;\n      setNativeStatus(detail);\n      if (detail.availability !== 'requesting') setAndroidRequesting(false);\n    };",
  );

  const connectPattern = /  function connectAndroid\(\) \{[\s\S]*?\n  \}\n\n  function refreshAndroid/;
  if (!connectPattern.test(next)) throw new Error('[v14310] Função connectAndroid não encontrada.');
  next = next.replace(connectPattern, `  function connectAndroid() {
    setAndroidRequesting(true);
    const accepted = postAndroid('requestPermissions', { consentVersion: '1.0', consentAccepted: consent.active });
    if (!accepted) {
      setAndroidRequesting(false);
      toast.error('A ponte nativa recusou a solicitação. Instale o APK 14.3.10 e abra o CrewCheck pelo ícone do aplicativo.');
      return;
    }
    toast.message('Abrindo as permissões do Health Connect…');
    window.setTimeout(() => {
      setAndroidRequesting((pending) => {
        if (pending) toast.info('Se a tela não abriu, toque em Gerenciar acesso. O Health Connect pode bloquear novos pedidos após cancelamentos repetidos.');
        return false;
      });
    }, 3000);
  }

  function manageAndroidAccess() {
    if (!postAndroid('openSettings')) {
      toast.error('Não consegui abrir o Health Connect. Abra Configurações do Android → Segurança e privacidade → Health Connect.');
      return;
    }
    toast.message('Abrindo o gerenciamento de acesso do Health Connect…');
  }

  function refreshAndroid`);

  const buttonBefore = `<div><button className="primary" onClick={connectAndroid}>{nativeStatus.allGranted ? 'Rever permissões' : 'Conectar'}</button>{nativeStatus.allGranted && <button onClick={refreshAndroid}><RefreshCw/> Atualizar</button>}</div>`;
  const buttonAfter = `<div><button className="primary" onClick={connectAndroid} disabled={androidRequesting}>{androidRequesting ? 'Abrindo permissões…' : (nativeStatus.allGranted ? 'Rever permissões' : 'Conectar')}</button>{androidBridgeReady && <button onClick={manageAndroidAccess}><ShieldCheck/> Gerenciar acesso</button>}{nativeStatus.allGranted && <button onClick={refreshAndroid}><RefreshCw/> Atualizar</button>}</div>`;
  if (!next.includes(buttonBefore) && !next.includes(buttonAfter)) throw new Error('[v14310] Botões Health Connect não encontrados.');
  next = next.replace(buttonBefore, buttonAfter);

  next = next.replace(
    `<small>{androidBridgeReady
            ? integrationLabel(nativeStatus)
            : ((window as any).AndroidCrewCheckNative ? 'Atualização do app necessária' : 'Abra pelo aplicativo Android')}</small>`,
    `<small>{androidRequesting
            ? 'Abrindo permissões…'
            : (nativeStatus.message || (androidBridgeReady
              ? integrationLabel(nativeStatus)
              : ((window as any).AndroidCrewCheckNative ? 'Atualização do app necessária' : 'Abra pelo aplicativo Android')))}</small>`,
  );

  if (!next.includes('accepted !== false') || !next.includes('function manageAndroidAccess()') || !next.includes('Gerenciar acesso') || !next.includes('androidRequesting')) {
    throw new Error('[v14310] Feedback visível do botão Health Connect não foi aplicado.');
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
  .replace(/versionCode\s+\d+/, 'versionCode 140310')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - confirmed Health Connect action, visible permission feedback and manage-access fallback`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.10'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-10-health-button.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`[v14310] CrewCheck ${VERSION}: botão Health Connect com confirmação real, feedback visível e acesso direto às configurações.`);
