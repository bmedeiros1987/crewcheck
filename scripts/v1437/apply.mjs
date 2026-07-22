import fs from 'node:fs';

const VERSION = '14.3.7';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v1437] Arquivo obrigatório ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v1437] Âncora não encontrada: ${label}`);
  return source.replace(before, after);
}

update('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', (source) => {
  let next = source;
  if (!next.includes('public boolean healthBridgePostMessage(final String raw)')) {
    next = replaceRequired(
      next,
      '    public class CrewCheckNativeBridge {\n',
      `    public class CrewCheckNativeBridge {\n        @JavascriptInterface\n        public String healthBridgePing() {\n            try {\n                return healthBridge != null ? healthBridge.ping() : "";\n            } catch (Exception ignored) {\n                return "";\n            }\n        }\n\n        @JavascriptInterface\n        public boolean healthBridgePostMessage(final String raw) {\n            try {\n                if (healthBridge == null) return false;\n                healthBridge.postMessage(raw);\n                return true;\n            } catch (Exception ignored) {\n                return false;\n            }\n        }\n`,
      'fallback Health Connect dentro da ponte nativa já estável',
    );
  }
  if (!next.includes('healthBridgePing()') || !next.includes('healthBridgePostMessage')) {
    throw new Error('[v1437] Fallback nativo do Health Connect não foi aplicado.');
  }
  return next;
}, { optional: true });

update('client/src/components/v1434/CrewCheckLifeView.tsx', (source) => {
  let next = source;
  next = next.replace(
    `  function getAndroidBridge() {\n    return (window as any).AndroidCrewCheckHealth;\n  }`,
    `  function getAndroidBridge() {\n    const direct = (window as any).AndroidCrewCheckHealth;\n    if (direct && typeof direct.postMessage === 'function') return direct;\n    const native = (window as any).AndroidCrewCheckNative;\n    if (native && typeof native.healthBridgePostMessage === 'function') {\n      return {\n        ping: () => { try { return native.healthBridgePing?.() || 'crewcheck-health-fallback-v1'; } catch { return 'crewcheck-health-fallback-v1'; } },\n        postMessage: (raw: string) => {\n          const accepted = native.healthBridgePostMessage(String(raw || ''));\n          if (accepted === false) throw new Error('Ponte Health Connect indisponível.');\n        },\n      };\n    }\n    return undefined;\n  }`,
  );

  next = next.replace(
    `  function connectAndroid() {\n    if (!postAndroid('requestPermissions', { consentVersion: '1.0', consentAccepted: consent.active })) {\n      toast.info('Abra esta opção no aplicativo Android CrewCheck. No navegador, use o lançamento manual.');\n    }\n  }`,
    `  function connectAndroid() {\n    if (!postAndroid('requestPermissions', { consentVersion: '1.0', consentAccepted: consent.active })) {\n      const nativeWrapper = Boolean((window as any).AndroidCrewCheckNative);\n      toast.info(nativeWrapper\n        ? 'O aplicativo Android está aberto, mas a conexão nativa não respondeu. Atualize o CrewCheck para a versão 14.3.7.'\n        : 'Você abriu o CrewCheck pelo navegador ou por um atalho. Abra o aplicativo Android instalado para conectar o Health Connect.');\n    }\n  }`,
  );

  next = next.replace(
    '<small>{integrationLabel(nativeStatus)}</small>',
    `<small>{androidBridgeReady\n            ? integrationLabel(nativeStatus)\n            : ((window as any).AndroidCrewCheckNative ? 'Atualização do app necessária' : 'Abra pelo aplicativo Android')}</small>`,
  );

  if (!next.includes('native.healthBridgePostMessage') || !next.includes('Atualize o CrewCheck para a versão 14.3.7') || !next.includes('androidBridgeReady')) {
    throw new Error('[v1437] Fallback e diagnóstico da tela Life não foram aplicados.');
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
  .replace(/versionCode\s+\d+/, 'versionCode 140307')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - Health Connect bridge runtime fallback and native/PWA diagnosis`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.7'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-7-health-bridge-fallback.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`[v1437] CrewCheck ${VERSION}: fallback Health Connect pela ponte nativa principal e diagnóstico PWA/APK.`);
await import('../v1438/apply.mjs');
