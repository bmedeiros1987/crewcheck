import fs from 'node:fs';

const VERSION = '13.9.7';
const NAME = 'crewcheck-v13-9-7-premium-roster-finance';
const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value, 'utf8');

for (const path of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(path)) continue;
  const metadata = JSON.parse(read(path));
  metadata.name = NAME;
  metadata.version = VERSION;
  if (path === 'package.json') metadata.description = 'CrewCheck v13.9.7 - premium roster with per-program per diem and KM earnings';
  if (metadata.packages?.['']) {
    metadata.packages[''].name = NAME;
    metadata.packages[''].version = VERSION;
  }
  write(path, `${JSON.stringify(metadata, null, 2)}\n`);
}

let home = read('client/src/pages/Home.tsx');
home = home.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`);
home = home.replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v13.9.7: escala premium com diárias e produção por KM em cada programação';");
home = home.replace(
  '<RosterLaunchView events={events} setView={setView}/>',
  '<RosterLaunchView events={events} finance={financeSnapshot(bundle.roster)} setView={setView}/>'
);
if (!home.includes('eventId: string;\n  date: string;')) {
  home = home.replace('type PerDiemRow = {\n  date: string;', 'type PerDiemRow = {\n  eventId: string;\n  date: string;');
}
if (!home.includes('eventId: event.id,\n      date: dateChip(event.date),')) {
  home = home.replace('rows.push({\n      date: dateChip(event.date),', 'rows.push({\n      eventId: event.id,\n      date: dateChip(event.date),');
}
write('client/src/pages/Home.tsx', home);

let server = read('server.mjs');
server = server.replaceAll("version: '13.9.6'", `version: '${VERSION}'`).replaceAll("version:'13.9.6'", `version:'${VERSION}'`);
write('server.mjs', server);

if (fs.existsSync('client/public/manifest.json')) {
  const manifest = JSON.parse(read('client/public/manifest.json'));
  manifest.version = VERSION;
  manifest.start_url = String(manifest.start_url || '/').replace(/([?&]v=)[^&]+/, `$1${VERSION}`);
  const refreshAssetVersion = (value) => String(value || '').replace(/([?&]v=)\d+/, '$11397');
  for (const icon of manifest.icons || []) icon.src = refreshAssetVersion(icon.src);
  for (const shortcut of manifest.shortcuts || []) {
    for (const icon of shortcut.icons || []) icon.src = refreshAssetVersion(icon.src);
  }
  write('client/public/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
}

if (fs.existsSync('android-wrapper/app/build.gradle')) {
  let android = read('android-wrapper/app/build.gradle');
  android = android.replace(/versionCode\s+\d+\b/, 'versionCode 139700');
  android = android.replace(/versionName\s+'[^']+'/, `versionName '${VERSION}'`);
  write('android-wrapper/app/build.gradle', android);
}

const component = read('client/src/components/v1391/RosterLaunchView.tsx');
const css = read('client/src/components/v1397/roster-premium.css');
if (home.includes('<RosterLaunchView') && !home.includes('finance={financeSnapshot(bundle.roster)}')) throw new Error('v13.9.7: integração financeira da escala ausente');
if (!component.includes("@/components/v1397/roster-premium.css")) throw new Error('v13.9.7: folha premium da escala ausente');
if (!css.includes('.cc-roster-premium-v1397')) throw new Error('v13.9.7: escopo visual premium ausente');
if (css.includes('.cz-app[data-version="13.9.7"]')) throw new Error('v13.9.7: CSS não pode depender da versão global');

console.log(`CrewCheck v${VERSION}: escala premium e finanças por programação aplicadas.`);
