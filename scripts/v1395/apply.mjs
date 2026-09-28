import fs from 'node:fs';

const VERSION = '13.9.5';
const NAME = 'crewcheck-v13-9-5-medical-emergency-care';

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
  if (path === 'package.json') metadata.description = 'CrewCheck v13.9.5 - medical profile repair, coordinated emergencies and open care on Telegram';
  if (metadata.packages?.['']) {
    metadata.packages[''].name = NAME;
    metadata.packages[''].version = VERSION;
  }
  write(path, `${JSON.stringify(metadata, null, 2)}\n`);
}

let server = read('server.mjs');
server = server.replaceAll("version: '13.9.4'", `version: '${VERSION}'`).replaceAll("version:'13.9.4'", `version:'${VERSION}'`);
if (!server.includes("'/api/platform/emergency/assisted'")) {
  server = server.replace("expectedRoutes:['/api/auth/config'", "expectedRoutes:['/api/platform/emergency/profile','/api/platform/emergency/send','/api/platform/emergency/assisted','/api/auth/config'");
}
write('server.mjs', server);

let home = read('client/src/pages/Home.tsx');
home = home.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`);
home = home.replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v13.9.5: perfil médico persistente, emergência coordenada e atendimento aberto no Telegram';");
write('client/src/pages/Home.tsx', home);

if (fs.existsSync('client/public/manifest.json')) {
  const manifest = read('client/public/manifest.json').replaceAll('13.9.4', VERSION).replaceAll('v=1394', 'v=1395');
  write('client/public/manifest.json', manifest);
}
if (fs.existsSync('android-wrapper/app/build.gradle')) {
  let android = read('android-wrapper/app/build.gradle');
  android = android.replace(/versionCode\s+139400\b/, 'versionCode 139500');
  android = android.replace(/versionName\s+'13\.9\.4'/, `versionName '${VERSION}'`);
  write('android-wrapper/app/build.gradle', android);
}

requireMarker('server/v1391/emergency.mjs', 'ensureEmergencySchema');
requireMarker('server/v1391/emergency.mjs', 'cc_emergency_help:');
requireMarker('server/v1391/emergency.mjs', 'openNow: true');
requireMarker('server/v1391/emergency.mjs', "env('UBER_CLIENT_ID')");
requireMarker('client/src/components/v1391/EmergencyCenterView.tsx', '@/components/v1395/v1395.css');
requireMarker('client/src/components/v1395/v1395.css', '.cc139-delivery-report');

console.log(`CrewCheck v${VERSION} perfil médico, emergência coordenada e atendimento aberto integrados.`);
