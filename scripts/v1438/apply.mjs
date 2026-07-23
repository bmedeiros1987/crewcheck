import fs from 'node:fs';

const VERSION = '14.3.8';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v1438] Arquivo obrigatório ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`[v1438] Âncora não encontrada: ${label}`);
  return source.replace(before, after);
}

update('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', (source) => {
  let next = source;

  if (!next.includes('public String appVersion()')) {
    next = replaceRequired(
      next,
      '    public class CrewCheckNativeBridge {\n        @JavascriptInterface\n        public String healthBridgePing() {',
      '    public class CrewCheckNativeBridge {\n        @JavascriptInterface\n        public String appVersion() {\n            try {\n                return BuildConfig.VERSION_NAME;\n            } catch (Exception ignored) {\n                return "";\n            }\n        }\n\n        @JavascriptInterface\n        public String healthBridgePing() {',
      'versão nativa exposta para diagnóstico',
    );
  }

  if (!next.includes('window.CrewCheckHealth={')) {
    next = replaceRequired(
      next,
      '                "window.CrewCheckPremium=window.CrewCheckNative;" +',
      '                "window.CrewCheckHealth={ping:function(){try{return AndroidCrewCheckNative.healthBridgePing();}catch(e){return \'\';}},appVersion:function(){try{return AndroidCrewCheckNative.appVersion();}catch(e){return \'\';}},postMessage:function(raw){try{return AndroidCrewCheckNative.healthBridgePostMessage(String(raw||\'\'));}catch(e){return false;}}};" +\n                "window.CrewCheckPremium=window.CrewCheckNative;" +',
      'fachada JavaScript estável para Health Connect',
    );
  }

  if (!next.includes('window.CrewCheckHealth={') || !next.includes('public String appVersion()')) {
    throw new Error('[v1438] Fachada Health Connect estável não foi aplicada no Android.');
  }
  return next;
}, { optional: true });

update('client/src/components/v1434/CrewCheckLifeView.tsx', (source) => {
  let next = source;

  const oldBridge = `  function getAndroidBridge() {\n    const direct = (window as any).AndroidCrewCheckHealth;\n    if (direct && typeof direct.postMessage === 'function') return direct;\n    const native = (window as any).AndroidCrewCheckNative;\n    if (native && typeof native.healthBridgePostMessage === 'function') {\n      return {\n        ping: () => { try { return native.healthBridgePing?.() || 'crewcheck-health-fallback-v1'; } catch { return 'crewcheck-health-fallback-v1'; } },\n        postMessage: (raw: string) => {\n          const accepted = native.healthBridgePostMessage(String(raw || ''));\n          if (accepted === false) throw new Error('Ponte Health Connect indisponível.');\n        },\n      };\n    }\n    return undefined;\n  }`;

  const newBridge = `  function getAndroidBridge() {\n    const stable = (window as any).CrewCheckHealth;\n    if (stable && typeof stable.postMessage === 'function') return stable;\n\n    const direct = (window as any).AndroidCrewCheckHealth;\n    if (direct) {\n      try {\n        direct.ping();\n        return {\n          ping: () => direct.ping(),\n          postMessage: (raw: string) => direct.postMessage(String(raw || '')),\n        };\n      } catch {}\n    }\n\n    const native = (window as any).AndroidCrewCheckNative;\n    if (native) {\n      try {\n        native.healthBridgePing();\n        return {\n          ping: () => native.healthBridgePing(),\n          appVersion: () => { try { return native.appVersion(); } catch { return ''; } },\n          postMessage: (raw: string) => {\n            const accepted = native.healthBridgePostMessage(String(raw || ''));\n            if (accepted === false) throw new Error('Ponte Health Connect indisponível.');\n          },\n        };\n      } catch {}\n    }\n    return undefined;\n  }`;

  next = replaceRequired(next, oldBridge, newBridge, 'detecção da ponte sem typeof sobre métodos Java');

  const oldConnect = `  function connectAndroid() {\n    if (!postAndroid('requestPermissions', { consentVersion: '1.0', consentAccepted: consent.active })) {\n      const nativeWrapper = Boolean((window as any).AndroidCrewCheckNative);\n      toast.info(nativeWrapper\n        ? 'O aplicativo Android está aberto, mas a conexão nativa não respondeu. Atualize o CrewCheck para a versão 14.3.7.'\n        : 'Você abriu o CrewCheck pelo navegador ou por um atalho. Abra o aplicativo Android instalado para conectar o Health Connect.');\n    }\n  }`;

  const newConnect = `  function connectAndroid() {\n    if (!postAndroid('requestPermissions', { consentVersion: '1.0', consentAccepted: consent.active })) {\n      const nativeWrapper = (window as any).AndroidCrewCheckNative;\n      let installedVersion = '';\n      try { installedVersion = String(nativeWrapper?.appVersion?.() || ''); } catch {}\n      toast.info(nativeWrapper\n        ? \`A conexão nativa não respondeu\${installedVersion ? ' na versão ' + installedVersion : ''}. Feche completamente o CrewCheck e abra novamente. Se persistir, instale a versão 14.3.8.\`\n        : 'Você abriu o CrewCheck pelo navegador ou por um atalho. Abra o aplicativo Android instalado para conectar o Health Connect.');\n    }\n  }`;

  next = replaceRequired(next, oldConnect, newConnect, 'diagnóstico de versão real do APK');

  if (!next.includes('const stable = (window as any).CrewCheckHealth') || next.includes("typeof native.healthBridgePostMessage === 'function'")) {
    throw new Error('[v1438] Cliente ainda depende de typeof em método Java do WebView.');
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
  .replace(/versionCode\s+\d+/, 'versionCode 140308')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - stable Health Connect JavaScript facade for Android WebView`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.8'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-8-health-webview-facade.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`[v1438] CrewCheck ${VERSION}: fachada JS estável elimina falso negativo de métodos Java no WebView.`);
await import('../v1439/apply.mjs');
