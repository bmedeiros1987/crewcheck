import fs from 'node:fs';

const VERSION = '13.9.9';
const NAME = 'crewcheck-v13-9-9-monthly-roster-base-allowances-premium-admin';
const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value, 'utf8');

for (const path of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(path)) continue;
  const metadata = JSON.parse(read(path));
  metadata.name = NAME;
  metadata.version = VERSION;
  if (path === 'package.json') metadata.description = 'CrewCheck v13.9.9 - monthly roster, contractual-base allowances, premium responsive UI and Admin health';
  if (metadata.packages?.['']) {
    metadata.packages[''].name = NAME;
    metadata.packages[''].version = VERSION;
  }
  write(path, `${JSON.stringify(metadata, null, 2)}\n`);
}

let home = read('client/src/pages/Home.tsx');
home = home.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`);
home = home.replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v13.9.9: mês isolado, diárias na base corrigidas, menu premium e saúde Admin';");
write('client/src/pages/Home.tsx', home);

let server = read('server.mjs');
server = server.replace(/version\s*:\s*'13\.9\.\d+'/g, `version:'${VERSION}'`);
write('server.mjs', server);

if (fs.existsSync('client/public/manifest.json')) {
  const manifest = JSON.parse(read('client/public/manifest.json'));
  manifest.version = VERSION;
  manifest.start_url = String(manifest.start_url || '/').replace(/([?&]v=)[^&]+/, `$1${VERSION}`);
  const refresh = (value) => String(value || '').replace(/([?&]v=)\d+/, '$11399');
  for (const icon of manifest.icons || []) icon.src = refresh(icon.src);
  for (const shortcut of manifest.shortcuts || []) for (const icon of shortcut.icons || []) icon.src = refresh(icon.src);
  write('client/public/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
}

if (fs.existsSync('android-wrapper/app/build.gradle')) {
  let android = read('android-wrapper/app/build.gradle');
  android = android.replace(/versionCode\s+\d+\b/, 'versionCode 139900');
  android = android.replace(/versionName\s+'[^']+'/, `versionName '${VERSION}'`);
  write('android-wrapper/app/build.gradle', android);
}

const policy = read('client/src/lib/compensationPolicy.ts');
const canonical = read('client/src/lib/canonicalRoster.ts');
const roster = read('client/src/components/v1391/RosterLaunchView.tsx');
const css = read('client/src/components/v1399/premium.css');
const infobip = read('server/v1396/infobip.mjs');
if (!policy.includes('destinationAtContractualBase')) throw new Error('v13.9.9: café na chegada à base ausente');
if (!canonical.includes('hasExactContinuity')) throw new Error('v13.9.9: duração exata de pernoite ausente');
if (!roster.includes('cc-roster-period-v1399')) throw new Error('v13.9.9: seletor mensal/Hoje ausente');
if (!css.includes('cc-admin-health-v1399')) throw new Error('v13.9.9: painel Admin ausente');
if (!infobip.includes('normalizeInfobipVoice')) throw new Error('v13.9.9: voz estruturada Infobip ausente');

console.log(`CrewCheck v${VERSION}: escala mensal, diárias, menu premium e saúde Admin aplicados.`);
