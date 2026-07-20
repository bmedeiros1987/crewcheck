import fs from 'node:fs';

const VERSION = '14.0.6';
const VERSION_CODE = '140006';
const read = (file) => fs.readFileSync(file, 'utf8');
const write = (file, content) => fs.writeFileSync(file, content, 'utf8');
const snippet = (name) => read(new URL(`./${name}.snippet`, import.meta.url));

function replaceRequired(source, pattern, replacement, label) {
  pattern.lastIndex = 0;
  if (!pattern.test(source)) throw new Error(`CrewCheck v${VERSION}: ponto não localizado — ${label}.`);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

const homePath = 'client/src/pages/Home.tsx';
let home = read(homePath);

if (!home.includes("import '@/components/v1406/premium-layout.css';")) {
  home = home.replace(
    "import '@/components/v1399/premium.css';",
    "import '@/components/v1399/premium.css';\nimport '@/components/v1406/premium-layout.css';",
  );
}

if (!/\n\s*EyeOff,/.test(home)) {
  home = home.replace('  DollarSign,\n', '  DollarSign,\n  Eye,\n  EyeOff,\n');
}

home = home
  .replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`)
  .replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v14.0.6: Saída Inteligente resiliente, login funcional, financeiro protegido e auditoria responsiva';");

if (!home.includes('durationInTrafficSeconds?: number;')) {
  home = home.replace(
    '  distanceMeters?: number;\n};',
    '  distanceMeters?: number;\n  durationSeconds?: number;\n  durationInTrafficSeconds?: number;\n  durationMinutes?: number;\n  durationInTrafficMinutes?: number;\n};',
  );
}

if (!home.includes('data-smart-departure-v1406')) {
  home = replaceRequired(
    home,
    /function SmartCard\(\{ event, setView \}: \{ event: ZeroLeg; setView: \(v: ZeroView\) => void \}\) \{[\s\S]*?\n\}\n\n\nfunction UpdateCenterView/,
    `${snippet('smart-card').trim()}\n\nfunction UpdateCenterView`,
    'card da Saída Inteligente',
  );
}

if (!home.includes('function smartDepartureEstimate(')) {
  home = replaceRequired(
    home,
    /function routeDurationMinutes\(route: RoutePreviewInfo \| null\): number \{[\s\S]*?\n\}\nfunction eventClockDate/,
    `${snippet('route-helpers').trim()}\nfunction eventClockDate`,
    'motor de duração da rota',
  );
}

if (!home.includes('data-departure-v1406')) {
  home = replaceRequired(
    home,
    /function Departure\(\{ event \}: \{ event: ZeroLeg \}\) \{[\s\S]*?\n\}\n\nfunction MonthlyMapView/,
    `${snippet('departure').trim()}\n\nfunction MonthlyMapView`,
    'tela de Saída Inteligente',
  );
}

if (!home.includes('data-finance-v1406')) {
  home = replaceRequired(
    home,
    /function Cockpit\(\{ events, compliance, setView, onUpload, openMenu \}: \{ events: ZeroLeg\[]; compliance: ComplianceResult \| null; setView: \(v: ZeroView\) => void; onUpload: \(\) => void; openMenu: \(\) => void \}\) \{[\s\S]*?\n\}\n\nfunction rosterCode/,
    `${snippet('cockpit').trim()}\n\nfunction rosterCode`,
    'financeiro do cockpit',
  );
}

home = home.replace(
  '<Cockpit events={events} compliance={compliance} setView={setView} onUpload={actions.upload} openMenu={() => setDrawer(true)}/>',
  '<Cockpit bundle={bundle} events={events} compliance={compliance} setView={setView} onUpload={actions.upload} openMenu={() => setDrawer(true)}/>',
);

if (!home.includes('Ceia registrada a partir de 00:00 de quarta-feira')) {
  home = home.replace(
    '    <section className="cz-finance-grid">\n      <KpiCard icon={BriefcaseBusiness} title="Totais por moeda"',
    '    <p className="cz-mini-status">Ciclo previsto: quarta-feira a terça-feira, com pagamento na quinta-feira seguinte. Ceia registrada a partir de 00:00 de quarta-feira pertence ao ciclo seguinte.</p>\n    <section className="cz-finance-grid">\n      <KpiCard icon={BriefcaseBusiness} title="Totais por moeda"',
  );
}

write(homePath, home);

for (const metadataPath of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(metadataPath)) continue;
  const metadata = JSON.parse(read(metadataPath));
  metadata.version = VERSION;
  if (metadataPath === 'package.json') {
    metadata.name = 'crewcheck-v14-0-6-smart-departure-premium-layout';
    metadata.description = 'CrewCheck v14.0.6 - Saída Inteligente resiliente, login acessível, financeiro protegido e auditoria responsiva';
    metadata.scripts = metadata.scripts || {};
    metadata.scripts['regression:v14.0.6:smart-departure-layout'] = 'node scripts/regression-v14-0-6-smart-departure-login-finance-layout.mjs';
  }
  if (metadata.packages?.['']) {
    metadata.packages[''].version = VERSION;
    if (metadataPath === 'package-lock.json') metadata.packages[''].name = 'crewcheck-v14-0-6-smart-departure-premium-layout';
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

const androidPath = 'android-wrapper/app/build.gradle';
if (fs.existsSync(androidPath)) {
  let android = read(androidPath);
  android = android.replace(/versionCode\s+\d+\b/, `versionCode ${VERSION_CODE}`);
  android = android.replace(/versionName\s+'[^']+'/, `versionName '${VERSION}'`);
  write(androidPath, android);
}

const serviceWorkerPath = 'client/public/sw.js';
if (fs.existsSync(serviceWorkerPath)) {
  let serviceWorker = read(serviceWorkerPath);
  serviceWorker = serviceWorker
    .replace(/const CACHE_NAME = '[^']+';/, `const CACHE_NAME = 'crewcheck-v14.0.6-shell';`)
    .replace(/const RUNTIME_CACHE = '[^']+';/, `const RUNTIME_CACHE = 'crewcheck-v14.0.6-runtime';`);
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

if (fs.existsSync('server.mjs')) {
  let server = read('server.mjs');
  server = server.replace(/version\s*:\s*'(?:13\.9\.\d+|14\.0\.\d+)'/g, `version:'${VERSION}'`);
  write('server.mjs', server);
}

console.log(`CrewCheck v${VERSION}: Saída Inteligente, login, financeiro e layout premium aplicados.`);
