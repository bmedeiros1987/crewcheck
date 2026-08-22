import fs from 'node:fs';

const VERSION = '13.9.6';
const NAME = 'crewcheck-v13-9-6-infobip-premium-calls';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function write(path, value) { fs.writeFileSync(path, value, 'utf8'); }
function requireMarker(path, marker) {
  const source = read(path);
  if (!source.includes(marker)) throw new Error(`v${VERSION}: marcador ausente em ${path}: ${marker}`);
}
function requireAnyMarker(path, markers) {
  const source = read(path);
  if (!markers.some((marker) => source.includes(marker))) {
    throw new Error(`v${VERSION}: nenhum marcador compatível encontrado em ${path}: ${markers.join(' | ')}`);
  }
}

for (const path of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(path)) continue;
  const metadata = JSON.parse(read(path));
  metadata.name = NAME;
  metadata.version = VERSION;
  if (path === 'package.json') metadata.description = 'CrewCheck v13.9.6 - Infobip Premium call provider rebind and secure diagnostics';
  if (metadata.packages?.['']) {
    metadata.packages[''].name = NAME;
    metadata.packages[''].version = VERSION;
  }
  write(path, `${JSON.stringify(metadata, null, 2)}\n`);
}

let server = read('server.mjs');
server = server.replaceAll("version: '13.9.5'", `version: '${VERSION}'`).replaceAll("version:'13.9.5'", `version:'${VERSION}'`);
write('server.mjs', server);

let home = read('client/src/pages/Home.tsx');
home = home.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`);
home = home.replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v13.9.6: ligações Premium revinculadas à Infobip com diagnóstico seguro';");
write('client/src/pages/Home.tsx', home);

if (fs.existsSync('client/public/manifest.json')) {
  const manifest = JSON.parse(read('client/public/manifest.json'));
  manifest.version = VERSION;
  manifest.start_url = String(manifest.start_url || '/').replace(/([?&]v=)[^&]+/, `$1${VERSION}`);
  const refreshAssetVersion = (value) => String(value || '').replace(/([?&]v=)\d+/, '$11396');
  for (const icon of manifest.icons || []) icon.src = refreshAssetVersion(icon.src);
  for (const shortcut of manifest.shortcuts || []) {
    for (const icon of shortcut.icons || []) icon.src = refreshAssetVersion(icon.src);
  }
  write('client/public/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
}
if (fs.existsSync('android-wrapper/app/build.gradle')) {
  let android = read('android-wrapper/app/build.gradle');
  android = android.replace(/versionCode\s+\d+\b/, 'versionCode 139600');
  android = android.replace(/versionName\s+'[^']+'/, `versionName '${VERSION}'`);
  write('android-wrapper/app/build.gradle', android);
}

requireMarker('server.mjs', "from './server/v1396/infobip.mjs'");
requireMarker('server.mjs', 'phoneProviderStatus');
// v14.1.6+ deliberately removed the broad auxiliary route because it swallowed
// ordinary Concierge text. Accept either the historical integration marker or
// the current location-only route, while still proving that v139 is connected.
requireAnyMarker('server.mjs', [
  'chatId && await handleV139Telegram(update, sendTelegramMessage)',
  'message?.location && await handleV139Telegram(update, sendTelegramMessage)',
]);
requireMarker('server/v1396/infobip.mjs', 'INFOBIP_PHONE_FROM');
requireAnyMarker('render.yaml', ['value: infobip', 'value: callmebot']);

console.log(`CrewCheck v${VERSION} Infobip Premium revinculada com diagnóstico seguro.`);
