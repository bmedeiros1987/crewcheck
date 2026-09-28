import fs from 'node:fs';

function read(path) { return fs.readFileSync(path, 'utf8'); }
function assert(condition, message) {
  if (!condition) {
    console.error(`ERRO: ${message}`);
    process.exit(1);
  }
  console.log(`OK: ${message}`);
}

const home = read('client/src/pages/Home.tsx');
const main = read('client/src/main.tsx');
const crewlock = read('server/v139/crewlock.mjs');
const emergency = read('server/v1391/emergency.mjs');
const continuity = read('client/src/lib/rosterContinuity.ts');
const presentation = read('client/src/components/v1391/PresentationStayManagerView.tsx');
const roster = read('client/src/components/v1391/RosterLaunchView.tsx');
const bids = read('client/src/components/v139/BidsWindowsView.tsx');
const pbs = read('client/src/data/pbsWindows.ts');
const manifest = read('client/public/manifest.json');
const androidManifest = read('android-wrapper/app/src/main/AndroidManifest.xml');
const androidGradle = read('android-wrapper/app/build.gradle');
const androidActivity = read('android-wrapper/app/src/main/java/com/crewcheck/app/MainActivity.java');
const migration = read('migrations/20260716_006_v1391_launch_stabilization.sql');

assert(/const DEFAULT_VERSION = '(?:13\.9\.\d+|14\.0\.\d+)'/.test(home), 'Home versionada em versão CrewCheck suportada');
assert(main.includes('launch-v13-9-1.css'), 'camada visual de lançamento carregada');
assert(home.includes('EmergencyCenterView'), 'Central de Emergência ligada ao menu');
assert(home.includes('PresentationStayManagerView'), 'hotel, quarto e apresentação ligados');
assert(home.includes('RosterLaunchView'), 'escala de lançamento ligada');
assert(crewlock.includes('/api/platform/crewlock/health'), 'diagnóstico CrewLock disponível');
assert(crewlock.includes('crewcheck_platform_crewlock_blobs'), 'fallback cifrado do CrewLock no Aiven');
assert(crewlock.includes("env('CLOUDINARY_URL')"), 'CrewLock aceita CLOUDINARY_URL');
assert(emergency.includes('/api/platform/emergency/send'), 'envio de emergência disponível');
assert(emergency.includes('/emergencia'), 'comando Telegram de emergência disponível');
assert(emergency.includes("VALUES(?,?,?,'active',?,?,?,?)"), 'SQL de alerta de emergência consistente');
assert(continuity.includes('DESCANSO_BASE_CONTINUIDADE'), 'descanso entre jornadas na base');
assert(continuity.includes('PERNOITE_CONTINUIDADE'), 'pernoite por continuidade física');
assert(!continuity.includes("type: 'OFF'"), 'continuidade não inventa OFF');
assert(presentation.includes('Número do quarto'), 'campo de quarto restaurado');
assert(presentation.includes('Hotel de contingência / manual'), 'hotel manual de contingência');
assert(presentation.includes('CREW_HOTEL_CATALOG'), 'lista de hotéis priorizada');
assert(roster.includes("Verde · voo tripulando"), 'paleta verde para tripulando');
assert(roster.includes("Cinza · deslocamento/extra"), 'paleta cinza para extra');
assert(roster.includes('groundBeforeMinutes'), 'solo >= 60 min nos cards');
assert(bids.includes('Janela oficial aplicada'), 'PBS oficial aplicável');
assert(pbs.includes("label: 'Fevereiro', generalStart: 7, generalEnd: 11"), 'exceção de fevereiro');
assert(pbs.includes("label: 'Maio', generalStart: 10, generalEnd: 14"), 'exceção de maio');
assert(pbs.includes("label: 'Novembro', generalStart: 10, generalEnd: 14"), 'exceção de novembro');
assert(/"version"\s*:\s*"(?:13\.9\.\d+|14\.0\.\d+)"/.test(manifest), 'manifest PWA em versão CrewCheck suportada');
assert(/crewcheck-icon-v2\.png\?v=(?:139\d+|140\d+)/.test(manifest), 'logo atual no PWA');
assert(androidManifest.includes('@drawable/crewcheck_icon_site'), 'logo atual no launcher Android');
assert(/versionName '(?:13\.9\.\d+|14\.0\.\d+)'/.test(androidGradle), 'Android versionName suportado');
assert(androidGradle.includes('generateCrewCheckBrandAssets'), 'logo do site copiada para Android');
assert(/acknowledge\|acknowledgement\|accept schedule/.test(androidActivity), 'iFlight bloqueia ações de ciência/aceite');
assert(migration.includes('crewcheck_platform_crewlock_blobs'), 'migration CrewLock fallback');
assert(migration.includes('crewcheck_platform_emergency_profiles'), 'migration perfil médico');
assert(migration.includes('crewcheck_platform_emergency_alerts'), 'migration alertas');

for (const source of [crewlock, emergency, migration, androidGradle, androidManifest]) {
  assert(!/ghp_[A-Za-z0-9_]{20,}/.test(source), 'sem token GitHub hardcoded');
  assert(!/AVNS_[A-Za-z0-9_-]{16,}/.test(source), 'sem senha Aiven hardcoded');
  assert(!/cloudinary:\/\/[^:\s]+:[^@\s]+@/.test(source), 'sem segredo Cloudinary hardcoded');
}

console.log('OK: CrewCheck launch stabilization regression complete.');
