import fs from 'node:fs';

const VERSION = '14.0.7';
const VERSION_CODE = '140007';
const read = (file) => fs.readFileSync(file, 'utf8');
const write = (file, content) => fs.writeFileSync(file, content, 'utf8');

const homePath = 'client/src/pages/Home.tsx';
if (!fs.existsSync(homePath)) throw new Error(`CrewCheck v${VERSION}: Home.tsx não localizado.`);
let home = read(homePath);
const auditImports = [
  "import '@/components/v1407/layout-audit.css';",
  "import '@/components/v1407/component-polish.css';",
];
for (const auditImport of auditImports) {
  if (home.includes(auditImport)) continue;
  const anchors = [
    "import '@/components/v1407/layout-audit.css';",
    "import '@/components/v1406/premium-layout.css';",
    "import '@/components/v1399/premium.css';",
  ];
  const anchor = anchors.find((candidate) => candidate !== auditImport && home.includes(candidate));
  if (!anchor) throw new Error(`CrewCheck v${VERSION}: âncora de CSS premium não localizada.`);
  home = home.replace(anchor, `${anchor}\n${auditImport}`);
}
home = home
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v14.0.7: auditoria visual premium de alertas, hotéis, rotina, apresentação, despertador e cards responsivos';");
write(homePath, home);

const premiumPath = 'client/src/components/v1399/premium.css';
if (fs.existsSync(premiumPath)) {
  let premium = read(premiumPath);
  // As regras premium eram presas à versão 13.9.9 e deixavam de funcionar após
  // cada atualização. O seletor passa a acompanhar qualquer versão do app.
  premium = premium.replaceAll('[data-version="13.9.9"]', '[data-version]');
  write(premiumPath, premium);
}

const presentationPath = 'client/src/components/v1391/PresentationStayManagerView.tsx';
if (fs.existsSync(presentationPath)) {
  let presentation = read(presentationPath);
  presentation = presentation.replace(
    '<div className="cc139-choices">{catalogResults.map((hotel) => <button key={`${hotel.name}-${hotel.airport}`} className={draft.hotelName === hotel.name ? \'active\' : \'\'} onClick={() => chooseHotel(hotel)}><Hotel/>{hotel.name}<small>{hotel.airport || hotel.alternateAirport} · {hotel.city}</small></button>)}</div>',
    '<div className="cc139-choices">{catalogResults.map((hotel) => <button type="button" key={`${hotel.name}-${hotel.airport}`} className={draft.hotelName === hotel.name ? \'active\' : \'\'} onClick={() => chooseHotel(hotel)}><Hotel/><span><strong>{hotel.name}</strong><small>{hotel.airport || hotel.alternateAirport} · {hotel.city}</small></span></button>)}</div>',
  );
  write(presentationPath, presentation);
}

for (const metadataPath of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(metadataPath)) continue;
  const metadata = JSON.parse(read(metadataPath));
  metadata.version = VERSION;
  if (metadataPath === 'package.json') {
    metadata.name = 'crewcheck-v14-0-7-premium-layout-audit';
    metadata.description = 'CrewCheck v14.0.7 - auditoria visual premium, alertas, hotéis, rotina, apresentação e despertador responsivos';
    metadata.scripts = metadata.scripts || {};
    metadata.scripts['regression:v14.0.7:layout-audit'] = 'node scripts/regression-v14-0-7-premium-layout-audit.mjs';
  }
  if (metadata.packages?.['']) {
    metadata.packages[''].version = VERSION;
    if (metadataPath === 'package-lock.json') metadata.packages[''].name = 'crewcheck-v14-0-7-premium-layout-audit';
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
    .replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = 'crewcheck-v14.0.7-shell';`)
    .replace(/const RUNTIME_CACHE = '[^']+';/, `const RUNTIME_CACHE = 'crewcheck-v14.0.7-runtime';`);
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

console.log(`CrewCheck v${VERSION}: auditoria visual premium aplicada.`);
