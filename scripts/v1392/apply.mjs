import fs from 'node:fs';

const VERSION = '13.9.2';
const NAME = 'crewcheck-v13-9-2-telegram-atis-regulation';

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
  if (path === 'package.json') metadata.description = 'CrewCheck v13.9.2 - Telegram voice notes, aviation ATIS, manual regulation and desktop menu audit';
  if (metadata.packages?.['']) {
    metadata.packages[''].name = NAME;
    metadata.packages[''].version = VERSION;
  }
  write(path, `${JSON.stringify(metadata, null, 2)}\n`);
}

const serverPath = 'server.mjs';
let server = read(serverPath);
server = server.replaceAll('13.9.0', VERSION);
server = server.replaceAll('13.9.1', VERSION);
server = server.replaceAll("version: '13.8.8'", `version: '${VERSION}'`);
server = server.replaceAll("version:'13.8.8'", `version:'${VERSION}'`);
server = server.replaceAll('13.8.8 - Safe Shell', `${VERSION} - Safe Shell`);
server = server.replaceAll('v=13.8.8', `v=${VERSION}`);
server = server.replaceAll('static-shell-13.8.8', `static-shell-${VERSION}`);
write(serverPath, server);

if (fs.existsSync('client/public/manifest.json')) {
  let manifest = read('client/public/manifest.json');
  manifest = manifest.replaceAll('13.9.1', VERSION).replaceAll('v=1391', 'v=1392');
  write('client/public/manifest.json', manifest);
}

if (fs.existsSync('android-wrapper/app/build.gradle')) {
  let android = read('android-wrapper/app/build.gradle');
  android = android.replace(/versionCode\s+139100\b/, 'versionCode 139200');
  android = android.replace(/versionName\s+'13\.9\.1'/, `versionName '${VERSION}'`);
  write('android-wrapper/app/build.gradle', android);
}

requireMarker('server.mjs', "telegramApiUrl('sendVoice')");
requireMarker('server.mjs', 'buildCrewCheckAtis');
requireMarker('server.mjs', "allowed_updates: ['message', 'edited_message', 'callback_query']");
// A later canonical materializer replaces the legacy import with v1432.
// Replaying after cache invalidation must validate that integration, not require
// the retired import. Both the route and its actual component remain mandatory.
const regulationHome = read('client/src/pages/Home.tsx');
const regulationImports = [
  ["import ManualRegulationView from '@/components/v1392/ManualRegulationView';", 'client/src/components/v1392/ManualRegulationView.tsx'],
  ["import ManualRegulationView, { regulationForScheduleDay } from '@/components/v1432/ManualRegulationView';", 'client/src/components/v1432/ManualRegulationView.tsx'],
];
const regulationIntegration = regulationImports.find(([statement]) => regulationHome.includes(statement));
if (!regulationIntegration || !regulationHome.includes("{view === 'regulation' && <ManualRegulationView compliance={compliance}")) {
  throw new Error(`v${VERSION}: integração ManualRegulationView ausente ou incompleta`);
}
requireMarker(regulationIntegration[1], 'Extensão condicionada');
requireMarker('server/v1391/emergency.mjs', 'emerg[êe]ncia');

console.log(`CrewCheck v${VERSION} Telegram, ATIS, regulamentação e layout integrados.`);
