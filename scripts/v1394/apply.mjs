import fs from 'node:fs';

const VERSION = '13.9.4';
const NAME = 'crewcheck-v13-9-4-telegram-layout-amil-network';

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
  if (path === 'package.json') metadata.description = 'CrewCheck v13.9.4 - Telegram rebind, protected layouts, nearby address and Amil S450/S750 network';
  if (metadata.packages?.['']) {
    metadata.packages[''].name = NAME;
    metadata.packages[''].version = VERSION;
  }
  write(path, `${JSON.stringify(metadata, null, 2)}\n`);
}

let server = read('server.mjs');
server = server.replaceAll("version: '13.9.3'", `version: '${VERSION}'`).replaceAll("version:'13.9.3'", `version:'${VERSION}'`);
write('server.mjs', server);

let home = read('client/src/pages/Home.tsx');
home = home.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`);
home = home.replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v13.9.4: Telegram revinculável, rede S450/S750, endereço próximo e layout protegido';");
write('client/src/pages/Home.tsx', home);

if (fs.existsSync('client/public/manifest.json')) {
  const manifest = read('client/public/manifest.json').replaceAll('13.9.3', VERSION).replaceAll('v=1393', 'v=1394');
  write('client/public/manifest.json', manifest);
}
if (fs.existsSync('android-wrapper/app/build.gradle')) {
  let android = read('android-wrapper/app/build.gradle');
  android = android.replace(/versionCode\s+139300\b/, 'versionCode 139400');
  android = android.replace(/versionName\s+'13\.9\.3'/, `versionName '${VERSION}'`);
  write('android-wrapper/app/build.gradle', android);
}

requireMarker('server.mjs', 'handleTelegramDiagnostic');
requireMarker('server.mjs', 'handleReverseGeocode');
requireMarker('server/platform.mjs', 'amilSnapshotSearch');
requireMarker('client/src/pages/Home.tsx', '@/components/v1394/v1394.css');
requireMarker('client/src/components/v1394/v1394.css', '.cc-roster-event-v1394');
requireMarker('server/data/amil-network-s450-s750.json', '"schemaVersion":1');

console.log(`CrewCheck v${VERSION} Telegram, layouts, endereço e rede Amil integrados.`);
