import fs from 'node:fs';

const VERSION = '14.0.8';
const VERSION_CODE = '140008';
const read = (file) => fs.readFileSync(file, 'utf8');
const write = (file, content) => fs.writeFileSync(file, content, 'utf8');
const snippet = (name) => read(new URL(`../v1406/${name}.snippet`, import.meta.url));

function replaceFunctionBlock(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = start >= 0 ? source.indexOf(endMarker, start + startMarker.length) : -1;
  if (start < 0 || end < 0) throw new Error(`CrewCheck v${VERSION}: bloco não localizado — ${label}.`);
  return `${source.slice(0, start)}${replacement.trim()}\n\n${source.slice(end)}`;
}

const homePath = 'client/src/pages/Home.tsx';
if (!fs.existsSync(homePath)) throw new Error(`CrewCheck v${VERSION}: Home.tsx não localizado.`);
let home = read(homePath);

const layoutImport = "import '@/components/v1407/layout-audit.css';";
const polishImport = "import '@/components/v1407/component-polish.css';";
const hotfixImport = "import '@/components/v1408/structure-hotfix.css';";

if (!home.includes(polishImport)) {
  const anchor = home.includes(layoutImport) ? layoutImport : "import '@/components/v1406/premium-layout.css';";
  if (!home.includes(anchor)) throw new Error(`CrewCheck v${VERSION}: âncora visual não localizada.`);
  home = home.replace(anchor, `${anchor}\n${polishImport}`);
}
if (!home.includes(hotfixImport)) {
  const anchor = home.includes(polishImport) ? polishImport : layoutImport;
  home = home.replace(anchor, `${anchor}\n${hotfixImport}`);
}

if (!home.includes('data-finance-v1408')) {
  home = replaceFunctionBlock(home, 'function Cockpit(', 'function rosterCode', snippet('cockpit'), 'cockpit financeiro estrutural');
}
if (!home.includes('data-import-card-v1408')) {
  home = replaceFunctionBlock(home, 'function SmartCard(', 'function UpdateCenterView', snippet('smart-card'), 'card estrutural de importação');
}

home = home
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v14.0.8: hotfix estrutural do financeiro e importação, sem herança de grids legados';");
write(homePath, home);

for (const metadataPath of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(metadataPath)) continue;
  const metadata = JSON.parse(read(metadataPath));
  metadata.version = VERSION;
  if (metadataPath === 'package.json') {
    metadata.name = 'crewcheck-v14-0-8-layout-structure-hotfix';
    metadata.description = 'CrewCheck v14.0.8 - hotfix estrutural dos cards financeiros e de importação no mobile';
    metadata.scripts = metadata.scripts || {};
    metadata.scripts['regression:v14.0.8:layout-structure'] = 'node scripts/regression-v14-0-8-layout-structure-hotfix.mjs';
  }
  if (metadata.packages?.['']) {
    metadata.packages[''].version = VERSION;
    if (metadataPath === 'package-lock.json') metadata.packages[''].name = 'crewcheck-v14-0-8-layout-structure-hotfix';
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
    .replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = 'crewcheck-v14.0.8-shell';`)
    .replace(/const RUNTIME_CACHE = '[^']+';/, `const RUNTIME_CACHE = 'crewcheck-v14.0.8-runtime';`);
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

const requiredOnce = [hotfixImport, polishImport, 'data-finance-v1408', 'data-import-card-v1408'];
for (const marker of requiredOnce) {
  const count = home.split(marker).length - 1;
  if (count !== 1) throw new Error(`CrewCheck v${VERSION}: marcador ${marker} encontrado ${count} vez(es).`);
}

console.log(`CrewCheck v${VERSION}: hotfix estrutural de layout aplicado.`);
