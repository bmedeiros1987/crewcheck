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

requireMarker('server.mjs', "telegramApiUrl('sendVoice')");
requireMarker('server.mjs', 'buildCrewCheckAtis');
requireMarker('server.mjs', "allowed_updates: ['message', 'edited_message', 'callback_query']");
requireMarker('client/src/pages/Home.tsx', "@/components/v1392/ManualRegulationView");
requireMarker('client/src/components/v1392/ManualRegulationView.tsx', 'Extensão condicionada');
requireMarker('server/v1391/emergency.mjs', 'emerg[êe]ncia');

console.log(`CrewCheck v${VERSION} Telegram, ATIS, regulamentação e layout integrados.`);
