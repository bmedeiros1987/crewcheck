import fs from 'node:fs';

const VERSION = '13.9.8';
const NAME = 'crewcheck-v13-9-8-act-compensation-roster-precision';
const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value, 'utf8');

for (const path of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(path)) continue;
  const metadata = JSON.parse(read(path));
  metadata.name = NAME;
  metadata.version = VERSION;
  if (path === 'package.json') metadata.description = 'CrewCheck v13.9.8 - ACT compensation, statement cycle, roster continuity and iPad menu precision';
  if (metadata.packages?.['']) {
    metadata.packages[''].name = NAME;
    metadata.packages[''].version = VERSION;
  }
  write(path, `${JSON.stringify(metadata, null, 2)}\n`);
}

let home = read('client/src/pages/Home.tsx');
home = home.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`);
home = home.replace(/const CREWCHECK_UI_CORE_NOTE = '[^']+';/, "const CREWCHECK_UI_CORE_NOTE = 'v13.9.8: diárias ACT, fechamento do demonstrativo, parser contínuo e menu iPad';");
write('client/src/pages/Home.tsx', home);

let server = read('server.mjs');
server = server.replace(/version\s*:\s*'13\.9\.7'/g, `version:'${VERSION}'`);
write('server.mjs', server);

if (fs.existsSync('client/public/manifest.json')) {
  const manifest = JSON.parse(read('client/public/manifest.json'));
  manifest.version = VERSION;
  manifest.start_url = String(manifest.start_url || '/').replace(/([?&]v=)[^&]+/, `$1${VERSION}`);
  const refreshAssetVersion = (value) => String(value || '').replace(/([?&]v=)\d+/, '$11398');
  for (const icon of manifest.icons || []) icon.src = refreshAssetVersion(icon.src);
  for (const shortcut of manifest.shortcuts || []) for (const icon of shortcut.icons || []) icon.src = refreshAssetVersion(icon.src);
  write('client/public/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
}

if (fs.existsSync('android-wrapper/app/build.gradle')) {
  let android = read('android-wrapper/app/build.gradle');
  android = android.replace(/versionCode\s+\d+\b/, 'versionCode 139800');
  android = android.replace(/versionName\s+'[^']+'/, `versionName '${VERSION}'`);
  write('android-wrapper/app/build.gradle', android);
}

const policy = read('client/src/lib/compensationPolicy.ts');
const parser = read('client/src/lib/pdfParser.ts');
const canonical = read('client/src/lib/canonicalRoster.ts');
const menuCss = read('client/src/components/v1394/v1394.css');
if (!policy.includes('enginesOff.getTime() + 30 * 60_000')) throw new Error('v13.9.8: corte de motores +30 min ausente');
if (!policy.includes("allowed.push('lunch', 'dinner')")) throw new Error('v13.9.8: regra de pernoite externo ausente');
if (!parser.includes('transposedStationTimeRows')) throw new Error('v13.9.8: parser CrewRoster transposto ausente');
if (!canonical.includes('physicalDayOffset')) throw new Error('v13.9.8: continuidade física na virada ausente');
if (!menuCss.includes('v13.9.8 — iPad/tablet')) throw new Error('v13.9.8: correção do menu iPad ausente');

console.log(`CrewCheck v${VERSION}: precisão ACT, escala e iPad aplicada.`);
