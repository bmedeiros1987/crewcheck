import fs from 'node:fs';

const VERSION = '13.9.10';
const VERSION_CODE = '1391000';
const CACHE_VERSION = '13910';
const NAME = 'crewcheck-v13-9-10-premium-brand-reports';
const read = (path) => fs.readFileSync(path, 'utf8');
const write = (path, value) => fs.writeFileSync(path, value, 'utf8');

for (const path of ['package.json', 'package-lock.json']) {
  if (!fs.existsSync(path)) continue;
  const metadata = JSON.parse(read(path));
  metadata.name = NAME;
  metadata.version = VERSION;
  if (path === 'package.json') {
    metadata.description = 'CrewCheck v13.9.10 - identidade Premium oficial em relatórios, PDFs, e-mails, PWA e Android';
  }
  if (metadata.packages?.['']) {
    metadata.packages[''].name = NAME;
    metadata.packages[''].version = VERSION;
  }
  write(path, `${JSON.stringify(metadata, null, 2)}\n`);
}

const homePath = 'client/src/pages/Home.tsx';
if (fs.existsSync(homePath)) {
  let home = read(homePath);
  home = home.replace(/const DEFAULT_VERSION = '[^']+';/, `const DEFAULT_VERSION = '${VERSION}';`);
  home = home.replace(
    /const CREWCHECK_UI_CORE_NOTE = '[^']+';/,
    "const CREWCHECK_UI_CORE_NOTE = 'v13.9.10: identidade Premium oficial em relatórios, PDFs, e-mails, PWA e Android';",
  );
  write(homePath, home);
}

if (fs.existsSync('server.mjs')) {
  let server = read('server.mjs');
  server = server.replace(/version\s*:\s*'13\.9\.\d+'/g, `version:'${VERSION}'`);
  write('server.mjs', server);
}

if (fs.existsSync('client/public/manifest.json')) {
  const manifest = JSON.parse(read('client/public/manifest.json'));
  manifest.version = VERSION;
  const startUrl = String(manifest.start_url || '/');
  manifest.start_url = /([?&]v=)[^&]+/.test(startUrl)
    ? startUrl.replace(/([?&]v=)[^&]+/, `$1${VERSION}`)
    : `${startUrl}${startUrl.includes('?') ? '&' : '?'}v=${VERSION}`;
  const refresh = (value) => {
    const source = String(value || '');
    return /([?&]v=)\d+/.test(source)
      ? source.replace(/([?&]v=)\d+/, `$1${CACHE_VERSION}`)
      : `${source}${source.includes('?') ? '&' : '?'}v=${CACHE_VERSION}`;
  };
  for (const icon of manifest.icons || []) icon.src = refresh(icon.src);
  for (const shortcut of manifest.shortcuts || []) {
    for (const icon of shortcut.icons || []) icon.src = refresh(icon.src);
  }
  write('client/public/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
}

if (fs.existsSync('android-wrapper/app/build.gradle')) {
  let android = read('android-wrapper/app/build.gradle');
  android = android.replace(/versionCode\s+\d+\b/, `versionCode ${VERSION_CODE}`);
  android = android.replace(/versionName\s+'[^']+'/, `versionName '${VERSION}'`);
  write('android-wrapper/app/build.gradle', android);
}

const requiredFiles = [
  'client/src/lib/brand.ts',
  'client/src/lib/pdfExport.ts',
  'client/src/lib/emailClient.ts',
  'client/src/lib/sharing.ts',
  'client/public/icons/crewcheck-icon-v2.png',
];
for (const path of requiredFiles) {
  if (!fs.existsSync(path)) throw new Error(`v${VERSION}: asset obrigatório ausente: ${path}`);
}

const brand = read('client/src/lib/brand.ts');
const pdf = read('client/src/lib/pdfExport.ts');
const email = read('client/src/lib/emailClient.ts');
const sharing = read('client/src/lib/sharing.ts');
if (!brand.includes("magenta: '#EC2C86'") || !brand.includes("cyan: '#27C3E8'")) throw new Error(`v${VERSION}: paleta oficial incompleta`);
if (!pdf.includes('Relatório Premium de Conformidade da Escala') || !pdf.includes('drawBrandIcon')) throw new Error(`v${VERSION}: PDF Premium ausente`);
if (!email.includes('Relatório Premium de Escala') || !email.includes('crewCheckPublicAssetUrl')) throw new Error(`v${VERSION}: e-mail Premium ausente`);
if (!sharing.includes('Relatório Premium')) throw new Error(`v${VERSION}: compartilhamento Premium ausente`);

console.log(`CrewCheck v${VERSION}: identidade Premium oficial aplicada em relatórios, PDFs, e-mails, PWA e Android.`);
