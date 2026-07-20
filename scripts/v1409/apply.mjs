import fs from 'node:fs';

const VERSION = '14.0.9';
const VERSION_CODE = '140009';
const read = (file) => fs.readFileSync(file, 'utf8');
const write = (file, content) => fs.writeFileSync(file, content, 'utf8');

const mainPath = 'client/src/main.tsx';
const layoutImport = 'import "./components/v1409/layout-lock.css";';
if (!fs.existsSync(mainPath)) throw new Error(`CrewCheck v${VERSION}: main.tsx não localizado.`);
let main = read(mainPath);
if (!main.includes(layoutImport)) {
  const anchor = 'import "./premium-audit-v13-8-8.css";';
  if (!main.includes(anchor)) throw new Error(`CrewCheck v${VERSION}: âncora CSS principal não localizada.`);
  main = main.replace(anchor, `${anchor}\n${layoutImport}`);
}
const importCount = main.split(layoutImport).length - 1;
if (importCount !== 1) throw new Error(`CrewCheck v${VERSION}: layout lock importado ${importCount} vez(es).`);
write(mainPath, main);

const homePath = 'client/src/pages/Home.tsx';
if (fs.existsSync(homePath)) {
  let home = read(homePath);
  home = home
    .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
    .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v14.0.9: trava de layout carregada diretamente no entrypoint e compatível com cards antigos e novos';");
  write(homePath, home);
}

for (const metadataPath of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(metadataPath)) continue;
  const metadata = JSON.parse(read(metadataPath));
  metadata.version = VERSION;
  if (metadataPath === 'package.json') {
    metadata.name = 'crewcheck-v14-0-9-layout-lock';
    metadata.description = 'CrewCheck v14.0.9 - trava final de layout mobile carregada diretamente pelo entrypoint';
    metadata.scripts = metadata.scripts || {};
    metadata.scripts['regression:v14.0.9:layout-lock'] = 'node scripts/regression-v14-0-9-layout-lock.mjs';
  }
  if (metadata.packages?.['']) {
    metadata.packages[''].version = VERSION;
    if (metadataPath === 'package-lock.json') metadata.packages[''].name = 'crewcheck-v14-0-9-layout-lock';
  }
  write(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
}

const manifestPath = 'client/public/manifest.json';
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(read(manifestPath));
  manifest.version = VERSION;
  const startUrl = String(manifest.start_url || '/');
  manifest.start_url = /([?&]v=)[^&]+/.test(startUrl)
    ? startUrl.replace(/([?&]v=)[^&]+/, `$1${VERSION}`)
    : `${startUrl}${startUrl.includes('?') ? '&' : '?'}v=${VERSION}`;
  write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const serviceWorkerPath = 'client/public/sw.js';
if (fs.existsSync(serviceWorkerPath)) {
  let serviceWorker = read(serviceWorkerPath);
  serviceWorker = serviceWorker
    .replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = 'crewcheck-v14.0.9-shell';`)
    .replace(/const RUNTIME_CACHE = '[^']+';/, `const RUNTIME_CACHE = 'crewcheck-v14.0.9-runtime';`);
  write(serviceWorkerPath, serviceWorker);
}

const authPath = 'client/src/pages/AuthPage.tsx';
if (fs.existsSync(authPath)) {
  let auth = read(authPath);
  auth = auth
    .replace(/data-version="[^"]+"/, `data-version="${VERSION}"`)
    .replace(/CREWCHECK V[^<]+• PREMIUM BETA/, `CREWCHECK V${VERSION} • PREMIUM BETA`)
    .replace(/crewcheck_last_loaded_version', '[^']+'/, `crewcheck_last_loaded_version', '${VERSION}'`);
  write(authPath, auth);
}

const androidPath = 'android-wrapper/app/build.gradle';
if (fs.existsSync(androidPath)) {
  let android = read(androidPath);
  android = android
    .replace(/versionCode\s+\d+\b/, `versionCode ${VERSION_CODE}`)
    .replace(/versionName\s+'[^']+'/, `versionName '${VERSION}'`);
  write(androidPath, android);
}

if (fs.existsSync('server.mjs')) {
  let server = read('server.mjs');
  server = server.replace(/version\s*:\s*'(?:13\.9\.\d+|14\.0\.\d+)'/g, `version:'${VERSION}'`);
  write('server.mjs', server);
}

console.log(`CrewCheck v${VERSION}: trava final de layout mobile aplicada.`);
