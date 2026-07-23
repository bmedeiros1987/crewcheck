import fs from 'node:fs';

const VERSION = '14.3.9';

function update(path, transform, { optional = false } = {}) {
  if (!fs.existsSync(path)) {
    if (optional) return;
    throw new Error(`[v1439] Arquivo obrigatório ausente: ${path}`);
  }
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after !== before) fs.writeFileSync(path, after, 'utf8');
}

update('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java', (source) => {
  let next = source;

  next = next.replace(
    '                return BuildConfig.VERSION_NAME;',
    '                String versionName = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;\n                return versionName == null ? "" : versionName;',
  );

  if (next.includes('BuildConfig.VERSION_NAME')) {
    throw new Error('[v1439] MainActivity ainda depende de BuildConfig.VERSION_NAME.');
  }
  if (!next.includes('getPackageManager().getPackageInfo(getPackageName(), 0).versionName')) {
    throw new Error('[v1439] Leitura compilável da versão nativa não foi aplicada.');
  }
  if (!next.includes('window.CrewCheckHealth={') || !next.includes('healthBridgePostMessage')) {
    throw new Error('[v1439] Fachada Health Connect ou fallback nativo ausente.');
  }
  return next;
}, { optional: true });

update('client/src/components/v1434/CrewCheckLifeView.tsx', (source) => {
  let next = source;

  next = next.replace(
    "      toast.info(nativeWrapper\n        ? `A conexão nativa não respondeu${installedVersion ? ' na versão ' + installedVersion : ''}. Feche completamente o CrewCheck e abra novamente. Se persistir, instale a versão 14.3.8.`",
    "      toast.info(nativeWrapper\n        ? `A conexão nativa não respondeu${installedVersion ? ' na versão ' + installedVersion : ''}. O APK instalado não contém a ponte válida. Instale a versão 14.3.9.`",
  );

  if (!next.includes('Instale a versão 14.3.9.')) {
    throw new Error('[v1439] Diagnóstico da tela Life não foi atualizado.');
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
  .replace(/versionCode\s+\d+/, 'versionCode 140309')
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${VERSION}"`), { optional: true });
update('package.json', (source) => {
  const data = JSON.parse(source);
  data.version = VERSION;
  data.description = `CrewCheck v${VERSION} - compilable native version diagnostics and Health Connect WebView bridge`;
  data.scripts ||= {};
  data.scripts['regression:v14.3.9'] = 'node scripts/v139/apply.mjs && node scripts/regression-v14-3-9-health-compile.mjs';
  return `${JSON.stringify(data, null, 2)}\n`;
});

console.log(`[v1439] CrewCheck ${VERSION}: diagnóstico nativo sem BuildConfig e ponte Health Connect preservada.`);
await import('../v14310/apply.mjs');
