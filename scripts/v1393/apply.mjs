import fs from 'node:fs';

const VERSION = '13.9.3';
const NAME = 'crewcheck-v13-9-3-redemet-critical-weather';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value, 'utf8'); }
function requireMarker(path, marker) {
  const source = read(path);
  if (!source.includes(marker)) throw new Error(`v${VERSION}: marcador ausente em ${path}: ${marker}`);
}

for (const path of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(path)) continue;
  const metadata = JSON.parse(read(path));
  metadata.name = NAME;
  metadata.version = VERSION;
  if (path === 'package.json') metadata.description = 'CrewCheck v13.9.3 - REDEMET, decoded weather and schedule-aware critical alerts';
  if (metadata.packages?.['']) {
    metadata.packages[''].name = NAME;
    metadata.packages[''].version = VERSION;
  }
  write(path, `${JSON.stringify(metadata, null, 2)}\n`);
}

let server = read('server.mjs');
server = server.replaceAll('13.9.0', VERSION).replaceAll('13.9.1', VERSION).replaceAll('13.9.2', VERSION);
write('server.mjs', server);

let home = read('client/src/pages/Home.tsx');
home = home.replaceAll("const DEFAULT_VERSION = '13.9.2';", `const DEFAULT_VERSION = '${VERSION}';`);
write('client/src/pages/Home.tsx', home);

if (fs.existsSync('client/public/manifest.json')) {
  let manifest = read('client/public/manifest.json');
  manifest = manifest.replaceAll('13.9.2', VERSION).replaceAll('v=1392', 'v=1393');
  write('client/public/manifest.json', manifest);
}

if (fs.existsSync('android-wrapper/app/build.gradle')) {
  let android = read('android-wrapper/app/build.gradle');
  android = android.replace(/versionCode\s+139200\b/, 'versionCode 139300');
  android = android.replace(/versionName\s+'13\.9\.2'/, `versionName '${VERSION}'`);
  write('android-wrapper/app/build.gradle', android);
}

requireMarker('server.mjs', 'api-redemet.decea.mil.br/mensagens/metar');
requireMarker('server.mjs', 'handleCriticalWeatherMonitor');
requireMarker('server.mjs', 'criticalWeatherChange');
requireMarker('server.mjs', 'cc_weather:');
requireMarker('client/src/pages/Home.tsx', '@/components/v1393/weather.css');
requireMarker('client/src/components/v1393/weather.css', '.cc-weather-console');

console.log(`CrewCheck v${VERSION} REDEMET e alertas meteorológicos integrados.`);
